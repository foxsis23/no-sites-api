import type { PrismaClient } from '@prisma/client';

const SESSION_DURATION_DAYS = 30;
// Fixed minimum processing time (ms) to prevent timing oracle attacks (R3)
const MIN_RESPONSE_MS = 200;

export interface SessionResult {
  session_token: string;
  expires_at: string;
  productIds: string[];
}

export async function createSession(
  prisma: PrismaClient,
  siteId: string,
  email: string,
): Promise<SessionResult> {
  const start = Date.now();

  // Look up paid orders for this email + site
  const orders = await prisma.order.findMany({
    where: { siteId, customerEmail: email, status: 'PAID' },
    select: { productId: true },
  });

  const productIds = orders.map((o) => o.productId);

  // Create session regardless of whether orders exist (silent result per R3)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

  const session = await prisma.session.create({
    data: { siteId, email, expiresAt },
    select: { token: true, expiresAt: true },
  });

  // Pad to fixed minimum time to prevent timing oracle
  const elapsed = Date.now() - start;
  if (elapsed < MIN_RESPONSE_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_RESPONSE_MS - elapsed));
  }

  return {
    session_token: session.token,
    expires_at: session.expiresAt.toISOString(),
    productIds,
  };
}
