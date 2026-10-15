import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Environment } from './http-config';

/**
 * Where the rate limit reads the client address (see the public catalog contract):
 * - `request`: Express `req.ip`, set by `TRUST_PROXY_HOPS` (default; local and tests).
 * - `x-real-ip`: the `X-Real-IP` header Railway's edge sets. Railway passes a client-sent
 *   `X-Forwarded-For` through, so hop counting cannot be trusted there.
 * - `cloudflare`: `CF-Connecting-IP`, trusted only when the request carries the origin secret a
 *   Cloudflare Transform Rule adds; any other request (one that bypassed Cloudflare) uses
 *   `X-Real-IP`, so it cannot choose its address.
 */
export type ClientIpSource =
  { kind: 'request' } | { kind: 'x-real-ip' } | { kind: 'cloudflare'; originSecret: string };

/** The parts of an Express request the resolver reads; header names are lowercase. */
export interface ClientIpRequest {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

const MIN_ORIGIN_SECRET_LENGTH = 32;

/** Reads `CLIENT_IP_SOURCE`; unset or blank is `request`. Invalid values stop the boot. */
export function readClientIpSource(env: Environment): ClientIpSource {
  const raw = env.CLIENT_IP_SOURCE?.trim();
  if (!raw || raw === 'request') return { kind: 'request' };
  if (raw === 'x-real-ip') return { kind: 'x-real-ip' };
  if (raw === 'cloudflare') {
    const originSecret = env.CLOUDFLARE_ORIGIN_SECRET?.trim() ?? '';
    if (originSecret.length < MIN_ORIGIN_SECRET_LENGTH) {
      throw new Error(
        `CLOUDFLARE_ORIGIN_SECRET must be at least ${MIN_ORIGIN_SECRET_LENGTH} characters when CLIENT_IP_SOURCE is "cloudflare".`,
      );
    }
    return { kind: 'cloudflare', originSecret };
  }
  throw new Error(
    `CLIENT_IP_SOURCE must be "request", "x-real-ip" or "cloudflare" (got "${raw}").`,
  );
}

/** The address the rate limit counts for this request. */
export function resolveClientIp(source: ClientIpSource, request: ClientIpRequest): string {
  const fallback = request.ip ?? '';
  if (source.kind === 'request') return fallback;

  const realIp = singleAddress(request.headers['x-real-ip']) ?? fallback;
  if (source.kind === 'x-real-ip') return realIp;

  if (secretMatches(request.headers['x-origin-secret'], source.originSecret)) {
    return singleAddress(request.headers['cf-connecting-ip']) ?? realIp;
  }
  return realIp;
}

function singleAddress(value: string | string[] | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const address = value.trim();
  return isIP(address) ? address : undefined;
}

function secretMatches(value: string | string[] | undefined, secret: string): boolean {
  if (typeof value !== 'string') return false;
  const given = Buffer.from(value);
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
