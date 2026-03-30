import type { Site } from '@prisma/client';

declare module 'fastify' {
  interface FastifyRequest {
    site: Site;
  }
}
