import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Config } from '../../config.js';
import { AppError } from '../../shared/errors/AppError.js';
import { consultationSchema } from './consultations.schema.js';
import { sendConsultationEmail } from './consultations.service.js';
import type { ConsultationInput } from './consultations.service.js';

interface ConsultationsRouteOptions {
  config: Config;
}

export default async function consultationsRoute(
  fastify: FastifyInstance,
  opts: ConsultationsRouteOptions,
): Promise<void> {
  const { config } = opts;

  // POST /consultation — lead form submission, emailed to CONSULTATION_EMAIL
  fastify.post<{ Body: ConsultationInput }>(
    '/consultation',
    { schema: consultationSchema },
    async (request: FastifyRequest<{ Body: ConsultationInput }>, reply: FastifyReply) => {
      try {
        await sendConsultationEmail(config.smtp, config.consultationEmail, request.body);
      } catch (err) {
        request.log.error(err, 'Failed to send consultation email');
        throw new AppError(502, 'Failed to send consultation request. Please try again later.');
      }

      return reply.status(201).send({ success: true });
    },
  );
}
