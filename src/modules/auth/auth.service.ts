import type { PrismaClient } from '@prisma/client';
import { AppError } from '../../shared/errors/AppError.js';

const SESSION_DURATION_DAYS = 30;
// Fixed minimum processing time (ms) to prevent timing oracle attacks (R3)
const MIN_RESPONSE_MS = 200;

export interface SessionResult {
  session_token: string;
  expires_at: string;
  productIds: string[];
}

export interface MeResult {
  product_ids: string[];
}

export async function getSessionProducts(
  prisma: PrismaClient,
  siteId: string,
  token: string,
): Promise<MeResult> {
  const session = await prisma.session.findUnique({ where: { token } });

  if (!session || session.siteId !== siteId || session.expiresAt < new Date()) {
    throw new AppError(401, 'Invalid or expired session');
  }

  const orders = await prisma.order.findMany({
    where: { siteId, customerEmail: session.email, status: 'PAID' },
    select: { productId: true },
  });

  return { product_ids: orders.map((o) => o.productId) };
}

export async function createSessionInternal(
  prisma: PrismaClient,
  siteId: string,
  email: string,
): Promise<SessionResult> {
  const orders = await prisma.order.findMany({
    where: { siteId, customerEmail: email, status: 'PAID' },
    select: { productId: true },
  });

  const productIds = orders.map((o) => o.productId);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

  const session = await prisma.session.create({
    data: { siteId, email, expiresAt },
    select: { token: true, expiresAt: true },
  });

  return {
    session_token: session.token,
    expires_at: session.expiresAt.toISOString(),
    productIds,
  };
}

export async function createSession(
  prisma: PrismaClient,
  siteId: string,
  email: string,
): Promise<SessionResult> {
  const start = Date.now();

  // Create session regardless of whether orders exist (silent result per R3)
  const result = await createSessionInternal(prisma, siteId, email);

  // Pad to fixed minimum time to prevent timing oracle
  const elapsed = Date.now() - start;
  if (elapsed < MIN_RESPONSE_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_RESPONSE_MS - elapsed));
  }

  return result;
}
