import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { CorsOrigins } from './http-config';

type CorsCallback = (error: Error | null, options?: CorsOptions) => void;
type RequestLike = { originalUrl?: string; url?: string };

/** True for `/public` and everything under it. Case-insensitive, like Express routing. */
export function isPublicPath(url: string): boolean {
  const path = url.split('?')[0].toLowerCase();
  return path === '/public' || path.startsWith('/public/');
}

/**
 * Admin routes keep the original single-origin, credentialed policy. Public routes reflect only
 * an exactly listed origin (the array form also sends `Vary: Origin`) and never allow
 * credentials, so a public page can never ride an admin session cookie.
 */
export function corsOptionsFor(url: string, origins: CorsOrigins): CorsOptions {
  if (isPublicPath(url)) {
    return { origin: origins.public, credentials: false };
  }
  return { origin: origins.admin, credentials: true, exposedHeaders: ['X-CSRF-Token'] };
}

/** Per-request options delegate for `app.enableCors`. */
export function createCorsDelegate(origins: CorsOrigins) {
  return (request: RequestLike, callback: CorsCallback): void => {
    callback(null, corsOptionsFor(request.originalUrl ?? request.url ?? '/', origins));
  };
}
