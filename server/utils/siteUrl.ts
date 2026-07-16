import type { H3Event } from 'h3';
import { getRequestURL } from 'h3';

/** Canonical public origin for links that leave the request/response boundary. */
export function publicOrigin(event: H3Event): string {
  return resolvePublicOrigin(
    useRuntimeConfig(event).siteUrl,
    getRequestURL(event).origin,
    process.env.NODE_ENV === 'production',
  );
}

export function resolvePublicOrigin(
  configuredSiteUrl: string,
  requestOrigin: string,
  isProduction: boolean,
): string {
  const configured = configuredSiteUrl.trim();
  if (!configured) {
    if (isProduction) {
      throw new Error('NUXT_SITE_URL must be configured in production');
    }
    return requestOrigin;
  }

  const url = new URL(configured);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('NUXT_SITE_URL must be an http(s) URL without credentials');
  }
  if (isProduction && url.protocol !== 'https:') {
    throw new Error('NUXT_SITE_URL must use HTTPS in production');
  }
  return url.origin;
}
