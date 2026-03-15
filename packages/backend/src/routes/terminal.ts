import { type FastifyPluginAsync } from 'fastify';
import { eq, and } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { deployments } from '../db/schema.js';
import { TerminalService } from '../services/terminal.service.js';
import { tunnelService } from '../workers/deploy.worker.js';
import logger from '../lib/logger.js';

interface TerminalRouteOptions {
  db: LibSQLDatabase;
}

const terminalService = new TerminalService(tunnelService);

const terminalRoute: FastifyPluginAsync<TerminalRouteOptions> = async (fastify, opts) => {
  const { db } = opts;

  // POST /api/deployments/:id/terminal — start ttyd + cloudflared tunnel, return URL
  fastify.post('/api/deployments/:id/terminal', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as Record<string, string>;
    const headerToken = request.headers['x-session-token'];
    const sessionToken = (typeof headerToken === 'string' ? headerToken : null)
      ?? query['sessionToken']
      ?? query['token'];

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

    if (deployment.status !== 'running' || !deployment.containerId) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Deployment is not running',
      });
    }

    try {
      const metadata = (typeof deployment.metadata === 'string'
        ? JSON.parse(deployment.metadata)
        : deployment.metadata) as { ttydHostPort?: number } | null;

      if (!metadata?.ttydHostPort) {
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Terminal host port not found in deployment metadata',
        });
      }

      const { terminalUrl } = await terminalService.startSession(
        deployment.containerId,
        id,
        metadata.ttydHostPort,
      );

      return reply.send({ terminalUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ deploymentId: id, err }, 'Failed to start terminal session');
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: `Failed to start terminal: ${message}`,
      });
    }
  });

  // DELETE /api/deployments/:id/terminal
  fastify.delete('/api/deployments/:id/terminal', async (request, reply) => {
    const { id } = request.params as { id: string };
    const headerToken = request.headers['x-session-token'];
    const sessionToken = typeof headerToken === 'string' ? headerToken : null;

    if (!sessionToken) {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Session token is required' });
    }

    const results = await db
      .select()
      .from(deployments)
      .where(
        and(eq(deployments.id, id), eq(deployments.sessionToken, sessionToken)),
      )
      .limit(1);

    if (!results[0]) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Deployment not found' });
    }

    terminalService.stopSession(id);
    return reply.send({ message: 'Terminal session stopped' });
  });
};

export { terminalService };
export default terminalRoute;
