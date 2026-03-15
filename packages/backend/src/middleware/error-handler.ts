import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import type { ApiError } from '@instadeploy/shared';
import logger from '../lib/logger.js';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const statusCode = error.statusCode ?? 500;

  logger.error(
    {
      err: error,
      method: request.method,
      url: request.url,
      statusCode,
    },
    'Request error',
  );

  const response: ApiError = {
    statusCode,
    error: error.name ?? 'InternalServerError',
    message: statusCode >= 500 ? 'Internal Server Error' : error.message,
  };

  reply.status(statusCode).send(response);
}

export default errorHandler;
