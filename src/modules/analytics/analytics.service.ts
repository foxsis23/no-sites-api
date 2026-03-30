import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

interface EventSummary {
  event: string;
  count: number;
}

export async function trackEvent(
  prisma: PrismaClient,
  siteId: string,
  event: string,
  metadata: Record<string, unknown> | undefined,
  ip: string,
): Promise<void> {
  await prisma.analyticsEvent.create({
    data: {
      siteId,
      event,
      metadata: metadata !== undefined ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      ip,
    },
  });
}

export async function getSummary(
  prisma: PrismaClient,
  siteId: string,
  days = 30,
): Promise<EventSummary[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const grouped = await prisma.analyticsEvent.groupBy({
    by: ['event'],
    where: {
      siteId,
      createdAt: { gte: since },
    },
    _count: { event: true },
    orderBy: { _count: { event: 'desc' } },
  });

  return grouped.map((row) => ({
    event: row.event,
    count: row._count.event,
  }));
}
