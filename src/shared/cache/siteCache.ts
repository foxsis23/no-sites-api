import type { Site } from '@prisma/client';

interface CacheEntry {
  site: Site;
  expiresAt: number;
}

const TTL_MS = 60_000; // 60 seconds
const cache = new Map<string, CacheEntry>();

export const siteCache = {
  get(domain: string): Site | null {
    const entry = cache.get(domain);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      cache.delete(domain);
      return null;
    }
    return entry.site;
  },

  set(domain: string, site: Site): void {
    cache.set(domain, { site, expiresAt: Date.now() + TTL_MS });
  },

  invalidate(domain: string): void {
    cache.delete(domain);
  },
};
