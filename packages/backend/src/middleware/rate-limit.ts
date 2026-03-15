import type { FastifyRateLimitOptions } from '@fastify/rate-limit';

export const rateLimitConfig: FastifyRateLimitOptions = {
  global: false,
};

export const deployRateLimitConfig = {
  max: 10,
  timeWindow: '1 minute',
  keyGenerator: (request: { ip: string }) => request.ip,
};

export default rateLimitConfig;
