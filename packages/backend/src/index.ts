import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import deploymentsRoute from './routes/deployments.js';
import logsRoute from './routes/logs.js';
import terminalRoute, { terminalService } from './routes/terminal.js';
import { errorHandler } from './middleware/error-handler.js';
import { rateLimitConfig } from './middleware/rate-limit.js';
import { CleanupService } from './services/cleanup.service.js';
import { ContainerService } from './services/container.service.js';
import { PortService } from './services/port.service.js';
import { tunnelService } from './workers/deploy.worker.js';
import { initializeDatabase } from './db/init.js';
import logger from './lib/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const dbPath = process.env.DATABASE_PATH ?? './data/instadeploy.db';
  mkdirSync(dirname(dbPath), { recursive: true });

  const client = createClient({
    url: `file:${dbPath}`,
  });

  const db = drizzle(client);

  await initializeDatabase(client);

  const fastify = Fastify({
    logger: false,
    trustProxy: true,
  });

  fastify.setErrorHandler(errorHandler);

  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN ?? true,
    credentials: true,
  });

  await fastify.register(rateLimit, rateLimitConfig);

  // Register API routes
  await fastify.register(deploymentsRoute, { db });
  await fastify.register(logsRoute, { db });
  await fastify.register(terminalRoute, { db });

  // Serve frontend static files in production
  const frontendDist = process.env.FRONTEND_DIST_PATH
    ?? resolve(__dirname, '../../frontend/dist');

  if (existsSync(frontendDist)) {
    await fastify.register(fastifyStatic, {
      root: frontendDist,
      prefix: '/',
      wildcard: false,
    });

    fastify.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'API route not found',
        });
      }
      return reply.sendFile('index.html');
    });

    logger.info({ frontendDist }, 'Serving frontend static files');
  } else {
    logger.warn({ frontendDist }, 'Frontend dist not found, skipping static file serving');
  }

  // Start cleanup service
  const containerService = new ContainerService();
  const portService = new PortService();
  const cleanupService = new CleanupService(db, containerService, tunnelService, portService);
  await cleanupService.recoverOnStartup();
  cleanupService.startPeriodicSweep();

  const port = parseInt(process.env.PORT ?? '3001', 10);
  const host = process.env.HOST ?? '0.0.0.0';

  await fastify.listen({ port, host });
  logger.info({ port, host }, 'InstaDeploy server started');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Received shutdown signal');
    cleanupService.stopPeriodicSweep();
    tunnelService.stopAll();
    terminalService.stopAll();
    await fastify.close();
    client.close();
    logger.info('Server shut down');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
