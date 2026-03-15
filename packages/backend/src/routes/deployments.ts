import { type FastifyPluginAsync } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { TunnelProtocol, PortMapping } from '@instadeploy/shared';
import {
  MAX_CONCURRENT_DEPLOYMENTS_PER_IP,
  MAX_GLOBAL_RUNNING_CONTAINERS,
  MAX_EXTENSIONS,
  EXTENSION_TTL_MS,
} from '@instadeploy/shared';
import { deployments, auditLog } from '../db/schema.js';
import { CleanupService } from '../services/cleanup.service.js';
import { ContainerService } from '../services/container.service.js';
import { GitService } from '../services/git.service.js';
import { PortService } from '../services/port.service.js';
import { processDeployment, tunnelService, publishDeploymentLog } from '../workers/deploy.worker.js';
import { deployRateLimitConfig } from '../middleware/rate-limit.js';
import logger from '../lib/logger.js';

interface DeploymentRouteOptions {
  db: LibSQLDatabase;
}

const deploymentsRoute: FastifyPluginAsync<DeploymentRouteOptions> = async (fastify, opts) => {
  const { db } = opts;
  const containerService = new ContainerService();
  const gitService = new GitService();
  const portService = new PortService();
  const cleanupService = new CleanupService(db, containerService, tunnelService, portService);

  function getSessionToken(request: { headers: Record<string, string | string[] | undefined>; query: Record<string, unknown> }): string | undefined {
    const headerToken = request.headers['x-session-token'];
    if (typeof headerToken === 'string') return headerToken;
    const queryToken = (request.query as Record<string, string>)['sessionToken'];
    if (typeof queryToken === 'string') return queryToken;
    return undefined;
  }

  // POST /api/deployments/list — fetch multiple deployments by session tokens
  fastify.post('/api/deployments/list', async (request, reply) => {
    const body = request.body as { sessions?: Array<{ id: string; sessionToken: string }> } | null;

    if (!body?.sessions || !Array.isArray(body.sessions) || body.sessions.length === 0) {
      return reply.send({ deployments: [] });
    }

    const sessions = body.sessions.slice(0, 50);

    const results: Array<{
      id: string;
      repoUrl: string;
      status: string;
      portMappings: unknown[];
      errorMessage: string | null;
      expiresAt: string | null;
      extensionCount: number;
      createdAt: string | null;
      startedAt: string | null;
      finishedAt: string | null;
    }> = [];

    for (const session of sessions) {
      if (!session.id || !session.sessionToken) continue;

      const rows = await db
        .select()
        .from(deployments)
        .where(
          and(eq(deployments.id, session.id), eq(deployments.sessionToken, session.sessionToken)),
        )
        .limit(1);

      const deployment = rows[0];
      if (!deployment) continue;

      const portMappings = typeof deployment.portMappings === 'string'
        ? JSON.parse(deployment.portMappings)
        : deployment.portMappings ?? [];

      results.push({
        id: deployment.id,
        repoUrl: deployment.repoUrl,
        status: deployment.status,
        portMappings,
        errorMessage: deployment.errorMessage,
        expiresAt: deployment.expiresAt ?? null,
        extensionCount: deployment.extensionCount ?? 0,
        createdAt: deployment.createdAt ?? null,
        startedAt: deployment.startedAt ?? null,
        finishedAt: deployment.finishedAt ?? null,
      });
    }

    return reply.send({ deployments: results });
  });

  // POST /api/deployments
  fastify.post('/api/deployments', {
    config: {
      rateLimit: deployRateLimitConfig,
    },
  }, async (request, reply) => {
    const body = request.body as { repoUrl?: string } | null;

    if (!body?.repoUrl) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'repoUrl is required',
      });
    }

    const { repoUrl } = body;

    try {
      gitService.validateUrl(repoUrl);
    } catch (err) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: err instanceof Error ? err.message : 'Invalid repository URL',
      });
    }

    const clientIp = request.ip;

    // Check concurrent deployments per IP
    const ipDeployments = await db
      .select()
      .from(deployments)
      .where(
        and(
          eq(deployments.creatorIp, clientIp),
          sql`${deployments.status} IN ('queued', 'cloning', 'building', 'deploying', 'running')`,
        ),
      );

    if (ipDeployments.length >= MAX_CONCURRENT_DEPLOYMENTS_PER_IP) {
      return reply.status(429).send({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Maximum ${MAX_CONCURRENT_DEPLOYMENTS_PER_IP} concurrent deployments per IP`,
      });
    }

    // Check global running containers
    const globalDeployments = await db
      .select()
      .from(deployments)
      .where(
        sql`${deployments.status} IN ('queued', 'cloning', 'building', 'deploying', 'running')`,
      );

    if (globalDeployments.length >= MAX_GLOBAL_RUNNING_CONTAINERS) {
      return reply.status(503).send({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Maximum global deployment limit reached. Please try again later.',
      });
    }

    const id = randomUUID();
    const sessionToken = randomUUID();
    const now = new Date().toISOString();

    await db.insert(deployments)
      .values({
        id,
        repoUrl,
        creatorIp: clientIp,
        sessionToken,
        status: 'queued',
        createdAt: now,
      });

    await db.insert(auditLog).values({
      deploymentId: id,
      action: 'created',
      details: JSON.stringify({ repoUrl }),
      ipAddress: clientIp,
      createdAt: now,
    });

    logger.info({ deploymentId: id, repoUrl }, 'Deployment created');

    // Fire-and-forget: process the deployment asynchronously
    processDeployment(db, id, repoUrl).catch((err) => {
      logger.error({ deploymentId: id, err }, 'Deployment processing failed');
    });

    return reply.status(201).send({
      id,
      sessionToken,
    });
  });

  // GET /api/deployments/:id
  fastify.get('/api/deployments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const sessionToken = getSessionToken(request as unknown as { headers: Record<string, string | string[] | undefined>; query: Record<string, unknown> });

    if (!sessionToken) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Session token is required (x-session-token header or sessionToken query param)',
      });
    }

    const results = await db
      .select()
      .from(deployments)
      .where(
        and(eq(deployments.id, id), eq(deployments.sessionToken, sessionToken)),
      )
      .limit(1);

    const deployment = results[0];

    if (!deployment) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Deployment not found',
      });
    }

    const portMappings = typeof deployment.portMappings === 'string'
      ? JSON.parse(deployment.portMappings)
      : deployment.portMappings ?? [];

    return reply.send({
      id: deployment.id,
      repoUrl: deployment.repoUrl,
      status: deployment.status,
      portMappings,
      errorMessage: deployment.errorMessage,
      expiresAt: deployment.expiresAt ?? null,
      extensionCount: deployment.extensionCount ?? 0,
      createdAt: deployment.createdAt ?? null,
      startedAt: deployment.startedAt ?? null,
      finishedAt: deployment.finishedAt ?? null,
    });
  });

  // DELETE /api/deployments/:id
  fastify.delete('/api/deployments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const sessionToken = getSessionToken(request as unknown as { headers: Record<string, string | string[] | undefined>; query: Record<string, unknown> });

    if (!sessionToken) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Session token is required',
      });
    }

    const results = await db
      .select()
      .from(deployments)
      .where(
        and(eq(deployments.id, id), eq(deployments.sessionToken, sessionToken)),
      )
      .limit(1);

    if (!results[0]) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Deployment not found',
      });
    }

    await cleanupService.cleanupDeployment(id);

    await db.update(deployments)
      .set({ status: 'stopped', finishedAt: new Date().toISOString() })
      .where(eq(deployments.id, id));

    await db.insert(auditLog).values({
      deploymentId: id,
      action: 'stopped',
      details: JSON.stringify({ stoppedBy: 'user' }),
      ipAddress: request.ip,
      createdAt: new Date().toISOString(),
    });

    logger.info({ deploymentId: id }, 'Deployment stopped by user');

    return reply.status(200).send({ message: 'Deployment stopped' });
  });

  // POST /api/deployments/:id/extend
  fastify.post('/api/deployments/:id/extend', async (request, reply) => {
    const { id } = request.params as { id: string };
    const sessionToken = getSessionToken(request as unknown as { headers: Record<string, string | string[] | undefined>; query: Record<string, unknown> });

    if (!sessionToken) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Session token is required',
      });
    }

    const results = await db
      .select()
      .from(deployments)
      .where(
        and(eq(deployments.id, id), eq(deployments.sessionToken, sessionToken)),
      )
      .limit(1);

    const deployment = results[0];

    if (!deployment) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Deployment not found',
      });
    }

    if (deployment.status !== 'running') {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Only running deployments can be extended',
      });
    }

    const currentExtensions = deployment.extensionCount ?? 0;
    if (currentExtensions >= MAX_EXTENSIONS) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: `Maximum ${MAX_EXTENSIONS} extensions allowed`,
      });
    }

    const currentExpiry = deployment.expiresAt ? new Date(deployment.expiresAt) : new Date();
    const newExpiry = new Date(currentExpiry.getTime() + EXTENSION_TTL_MS);

    await db.update(deployments)
      .set({
        expiresAt: newExpiry.toISOString(),
        extensionCount: currentExtensions + 1,
      })
      .where(eq(deployments.id, id));

    await db.insert(auditLog).values({
      deploymentId: id,
      action: 'extended',
      details: JSON.stringify({ extensionNumber: currentExtensions + 1, newExpiresAt: newExpiry.toISOString() }),
      ipAddress: request.ip,
      createdAt: new Date().toISOString(),
    });

    logger.info({ deploymentId: id, newExpiry, extensionCount: currentExtensions + 1 }, 'Deployment TTL extended');

    return reply.send({
      message: 'Deployment extended',
      expiresAt: newExpiry.toISOString(),
      extensionCount: currentExtensions + 1,
    });
  });

  // PATCH /api/deployments/:id/ports/:containerPort/protocol — switch tunnel protocol for a port
  fastify.patch('/api/deployments/:id/ports/:containerPort/protocol', async (request, reply) => {
    const { id, containerPort } = request.params as { id: string; containerPort: string };
    const containerPortNum = parseInt(containerPort, 10);
    const sessionToken = getSessionToken(request as unknown as { headers: Record<string, string | string[] | undefined>; query: Record<string, unknown> });

    if (!sessionToken) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Session token is required',
      });
    }

    const body = request.body as { protocol?: string } | null;
    const validProtocols = ['http', 'https', 'tcp', 'udp'] as const;
    const newProtocol = body?.protocol as TunnelProtocol | undefined;

    if (!newProtocol || !validProtocols.includes(newProtocol)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'protocol must be one of: http, https, tcp, udp',
      });
    }

    const results = await db
      .select()
      .from(deployments)
      .where(
        and(eq(deployments.id, id), eq(deployments.sessionToken, sessionToken)),
      )
      .limit(1);

    const deployment = results[0];

    if (!deployment) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Deployment not found',
      });
    }

    if (deployment.status !== 'running') {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Only running deployments can have ports reconfigured',
      });
    }

    const portMappings: PortMapping[] = typeof deployment.portMappings === 'string'
      ? JSON.parse(deployment.portMappings)
      : deployment.portMappings ?? [];

    const portMapping = portMappings.find((pm) => pm.containerPort === containerPortNum);
    if (!portMapping) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Port ${containerPort} not found in deployment`,
      });
    }

    if (portMapping.protocol === newProtocol) {
      return reply.send({
        message: 'Protocol unchanged',
        portMappings,
      });
    }

    if (!portMapping.hostPort) {
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Host port not found for this port mapping',
      });
    }

    try {
      const originAddress = `localhost:${portMapping.hostPort}`;
      const newTunnelUrl = await tunnelService.restartTunnel(
        originAddress,
        containerPortNum,
        newProtocol,
        id,
      );

      portMapping.protocol = newProtocol;
      portMapping.tunnelUrl = newTunnelUrl;

      await db.update(deployments)
        .set({ portMappings: JSON.stringify(portMappings) })
        .where(eq(deployments.id, id));

      logger.info({ deploymentId: id, containerPort: containerPortNum, newProtocol, newTunnelUrl }, 'Port protocol changed');

      await publishDeploymentLog(
        db, id,
        `Tunnel ready: ${newTunnelUrl} → container port ${containerPortNum} (${newProtocol})`,
        'running',
      );

      return reply.send({
        message: 'Protocol updated',
        portMappings,
      });
    } catch (err) {
      logger.error({ deploymentId: id, containerPort: containerPortNum, err }, 'Failed to change port protocol');

      await publishDeploymentLog(
        db, id,
        `Failed to change port ${containerPortNum} protocol to ${newProtocol}: ${err instanceof Error ? err.message : String(err)}`,
        'running',
        'stderr',
      );

      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Failed to restart tunnel with new protocol',
      });
    }
  });
};

export default deploymentsRoute;
