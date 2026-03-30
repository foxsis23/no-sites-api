import { timingSafeEqual } from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../errors/AppError.js';

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still do the comparison to avoid timing leak on length
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export async function adminAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const adminKey = request.headers['x-admin-key'];

  if (!adminKey || typeof adminKey !== 'string') {
    await reply.status(401).send({ success: false, error: 'Missing x-admin-key header' });
    return;
  }

  const settings = request.site.settings as Record<string, unknown>;
  const expectedKey = settings['adminKey'];

  if (typeof expectedKey !== 'string') {
    throw new AppError(500, 'Site admin key not configured');
  }

  if (!safeCompare(adminKey, expectedKey)) {
    await reply.status(403).send({ success: false, error: 'Invalid admin key' });
    return;
  }
}
