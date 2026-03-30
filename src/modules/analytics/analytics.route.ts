import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { resolveSite } from '../../shared/middleware/resolveSite.js';
import { adminAuth } from '../../shared/middleware/adminAuth.js';
import { trackEventSchema, summaryQuerySchema } from './analytics.schema.js';
import { trackEvent, getSummary } from './analytics.service.js';

interface TrackEventBody {
  event: string;
  metadata?: Record<string, unknown>;
}

interface SummaryQuery {
  days?: number;
}

export default async function analyticsRoute(fastify: FastifyInstance): Promise<void> {
  // POST /analytics/event
  fastify.post<{ Body: TrackEventBody }>(
    '/analytics/event',
    { schema: trackEventSchema, preHandler: [resolveSite] },
    async (request: FastifyRequest<{ Body: TrackEventBody }>, _reply: FastifyReply) => {
      // Fire-and-forget: don't await to keep response fast
      void trackEvent(
        request.server.prisma,
        request.site.id,
        request.body.event,
        request.body.metadata,
        request.ip,
      );
      return { success: true };
    },
  );

  // GET /analytics/summary (admin)
  fastify.get<{ Querystring: SummaryQuery }>(
    '/analytics/summary',
    { schema: summaryQuerySchema, preHandler: [resolveSite, adminAuth] },
    async (request: FastifyRequest<{ Querystring: SummaryQuery }>, _reply: FastifyReply) => {
      const days = request.query.days ?? 30;
      const summary = await getSummary(request.server.prisma, request.site.id, days);
      return { success: true, data: summary };
    },
  );
}
