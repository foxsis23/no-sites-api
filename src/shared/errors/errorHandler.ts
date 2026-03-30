import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from './AppError.js';
import { Prisma } from '@prisma/client';

export async function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // App-level errors
  if (error instanceof AppError) {
    await reply.status(error.statusCode).send({ success: false, error: error.message });
    return;
  }

  // Prisma known errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') {
      await reply.status(404).send({ success: false, error: 'Record not found' });
      return;
    }
    if (error.code === 'P2002') {
      await reply.status(409).send({ success: false, error: 'Duplicate entry' });
      return;
    }
  }

  // Fastify validation errors
  const fastifyError = error as FastifyError;
  if (fastifyError.statusCode === 400 || fastifyError.validation) {
    await reply.status(400).send({ success: false, error: error.message });
    return;
  }

  // Unexpected errors
  request.log.error(error);
  await reply.status(500).send({ success: false, error: 'Internal server error' });
}
