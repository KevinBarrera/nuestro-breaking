export type Environment = Record<string, string | undefined>;

export interface CorsOrigins {
  /** The single admin frontend origin; admin routes reflect only this one, with credentials. */
  admin: string;
  /** Exact origins allowed on `/public/...` routes: the admin origin plus `PUBLIC_ALLOWED_ORIGINS`. */
  public: string[];
}

export interface PublicRateLimitConfig {
  /** Requests allowed per client IP and route within one window. */
  limit: number;
  /** Window length in milliseconds. */
  ttl: number;
}

const DEFAULT_ADMIN_ORIGIN = 'http://localhost:5173';
const DEFAULT_PUBLIC_RATE_LIMIT: PublicRateLimitConfig = { limit: 60, ttl: 60_000 };

/** Reads CORS origins from the environment; throws on any public origin that is not exact. */
export function readCorsOrigins(env: Environment): CorsOrigins {
  const admin = env.AUTH_TRUSTED_ORIGIN ?? DEFAULT_ADMIN_ORIGIN;
  const extra = (env.PUBLIC_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  for (const origin of extra) {
    if (!isExactOrigin(origin)) {
      throw new Error(
        `PUBLIC_ALLOWED_ORIGINS must list exact origins like https://tickets.example (got "${origin}").`,
      );
    }
  }

  return { admin, public: [...new Set([admin, ...extra])] };
}

/** Reads the public rate limit; unset or blank values use the defaults, invalid ones throw. */
export function readPublicRateLimit(env: Environment): PublicRateLimitConfig {
  return {
    limit: readPositiveInteger(env, 'PUBLIC_RATE_LIMIT_LIMIT', DEFAULT_PUBLIC_RATE_LIMIT.limit),
    ttl: readPositiveInteger(env, 'PUBLIC_RATE_LIMIT_TTL_MS', DEFAULT_PUBLIC_RATE_LIMIT.ttl),
  };
}

function isExactOrigin(value: string): boolean {
  if (value.includes('*')) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
}

function readPositiveInteger(env: Environment, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || !Number.isSafeInteger(Number(raw))) {
    throw new Error(`${name} must be a positive integer (got "${raw}").`);
  }
  return Number(raw);
}
