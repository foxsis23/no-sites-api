import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { resolveSite } from '../../shared/middleware/resolveSite.js';
import { createSessionSchema } from './auth.schema.js';
import { createSession } from './auth.service.js';

interface CreateSessionBody {
  email: string;
}

export default async function authRoute(fastify: FastifyInstance): Promise<void> {
  // POST /auth/session
  fastify.post<{ Body: CreateSessionBody }>(
    '/auth/session',
    {
      schema: createSessionSchema,
      preHandler: [resolveSite],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request: FastifyRequest<{ Body: CreateSessionBody }>, reply: FastifyReply) => {
      const result = await createSession(
        request.server.prisma,
        request.site.id,
        request.body.email,
      );
      return reply.status(200).send({ success: true, data: result });
    },
  );
}
