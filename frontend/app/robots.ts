import type { MetadataRoute } from 'next';

/**
 * The service is meant to be reached through the links people deliberately
 * share, not discovered through search. This blocks every crawler outright.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/' },
  };
}
