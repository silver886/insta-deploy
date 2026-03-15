import { type FastifyPluginAsync } from 'fastify';
import { eq, and, gt } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { deployments, deployLogs } from '../db/schema.js';
import { logBus, type LogEntry } from '../lib/log-bus.js';
import logger from '../lib/logger.js';

interface LogsRouteOptions {
  db: LibSQLDatabase;
}

const logsRoute: FastifyPluginAsync<LogsRouteOptions> = async (fastify, opts) => {
  const { db } = opts;

  // GET /api/deployments/:id/logs (SSE)
  fastify.get('/api/deployments/:id/logs', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as Record<string, string>;
    const sessionToken =
      (request.headers['x-session-token'] as string) ?? query['sessionToken'] ?? query['token'];

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

    const lastEventId = request.headers['last-event-id'] as string | undefined;
    const lastId = lastEventId ? parseInt(lastEventId, 10) : 0;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Replay history from SQLite
    const history = await db
      .select()
      .from(deployLogs)
      .where(
        and(
          eq(deployLogs.deploymentId, id),
          gt(deployLogs.id, lastId),
        ),
      )
      .orderBy(deployLogs.id);

    for (const entry of history) {
      const data = JSON.stringify({
        id: entry.id,
        timestamp: entry.createdAt,
        message: entry.message,
        stream: entry.stream,
        stage: entry.stage ?? null,
      });
      reply.raw.write(`id: ${entry.id}\nevent: log\ndata: ${data}\n\n`);
    }

    // Subscribe to live events
    const onLog = (entry: LogEntry) => {
      if (entry.deploymentId === id) {
        const data = JSON.stringify({
          id: entry.id,
          timestamp: entry.timestamp,
          message: entry.message,
          stream: entry.stream,
          stage: entry.stage ?? null,
        });
        reply.raw.write(`id: ${entry.id}\nevent: log\ndata: ${data}\n\n`);
      }
    };

    logBus.on('log', onLog);

    // Keep-alive ping
    const keepAlive = setInterval(() => {
      reply.raw.write(': keepalive\n\n');
    }, 15000);

    // Cleanup on client disconnect
    request.raw.on('close', () => {
      clearInterval(keepAlive);
      logBus.off('log', onLog);
      logger.debug({ deploymentId: id }, 'SSE client disconnected');
    });
  });
};

export default logsRoute;
