import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

async function rateLimitPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      success: false,
      error: 'Too many requests. Please try again later.',
    }),
  });
}

export default fp(rateLimitPlugin, { name: 'rateLimit' });
