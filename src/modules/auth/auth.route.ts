import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { resolveSite } from '../../shared/middleware/resolveSite.js';
import { createSessionSchema, getMeSchema } from './auth.schema.js';
import { createSession, getSessionProducts } from './auth.service.js';

interface CreateSessionBody {
  email: string;
}

export default async function authRoute(fastify: FastifyInstance): Promise<void> {
  // GET /auth/me
  fastify.get(
    '/auth/me',
    { schema: getMeSchema, preHandler: [resolveSite] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authHeader = request.headers['authorization'];
      const token =
        typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7)
          : null;

      if (!token) {
        return reply.status(401).send({ success: false, error: 'Missing Bearer token' });
      }

      const result = await getSessionProducts(request.server.prisma, request.site.id, token);
      return reply.status(200).send({ success: true, data: result });
    },
  );

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
