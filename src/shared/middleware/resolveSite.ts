import type { FastifyRequest, FastifyReply } from 'fastify';
import { siteCache } from '../cache/siteCache.js';

function extractDomain(request: FastifyRequest): string | null {
  // x-forwarded-host takes priority (behind proxy/load balancer)
  const forwardedHost = request.headers['x-forwarded-host'];
  const rawHost = forwardedHost
    ? (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost.split(',')[0])
    : request.headers['host'];

  if (!rawHost) return null;

  // Strip port (e.g. "example.com:3000" → "example.com")
  const withoutPort = rawHost.trim().split(':')[0];
  return withoutPort ?? null;
}

export async function resolveSite(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const domain = extractDomain(request);

  if (!domain) {
    await reply.status(400).send({ success: false, error: 'Missing host header' });
    return;
  }

  // Check cache first
  const cached = siteCache.get(domain);
  if (cached) {
    request.site = cached;
    return;
  }

  // DB lookup
  const site = await request.server.prisma.site.findUnique({
    where: { domain },
  });

  if (!site) {
    await reply.status(404).send({ success: false, error: 'Site not found' });
    return;
  }

  siteCache.set(domain, site);
  request.site = site;
}
