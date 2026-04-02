import Fastify from 'fastify';
import dbPlugin from './plugins/db.js';
import corsPlugin from './plugins/cors.js';
import rateLimitPlugin from './plugins/rateLimit.js';
import { errorHandler } from './shared/errors/errorHandler.js';
import healthRoute from './modules/health/health.route.js';
import productsRoute from './modules/products/products.route.js';
import paymentsRoute from './modules/payments/payments.route.js';
import analyticsRoute from './modules/analytics/analytics.route.js';
import authRoute from './modules/auth/auth.route.js';
import type { Config } from './config.js';

export async function buildApp(config: Config) {
  const loggerConfig =
    process.env['NODE_ENV'] !== 'production'
      ? ({
          level: 'info',
          transport: { target: 'pino-pretty', options: { colorize: true } },
        } as const)
      : ({ level: 'info' } as const);

  const fastify = Fastify({
    logger: loggerConfig,
    trustProxy: true,
  });

  // Plugins
  await fastify.register(dbPlugin);
  await fastify.register(corsPlugin);
  await fastify.register(rateLimitPlugin);

  // Global error handler
  fastify.setErrorHandler(errorHandler as Parameters<typeof fastify.setErrorHandler>[0]);

  // Routes
  await fastify.register(healthRoute);
  await fastify.register(productsRoute, { config });
  await fastify.register(paymentsRoute, { config });
  await fastify.register(analyticsRoute);
  await fastify.register(authRoute);

  return fastify;
}
