import { UseGuards } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { readPublicRateLimit } from './http-config';

/**
 * In-memory throttler storage, configured from the environment when the app boots (invalid values
 * stop the boot). Counters are per process: several API instances do not share them.
 */
export const PublicRateLimitModule = ThrottlerModule.forRootAsync({
  useFactory: () => [readPublicRateLimit(process.env)],
});

/**
 * Limits requests per client IP and route; over the limit the API answers 429 with `Retry-After`.
 * Apply it only to public controllers. The client IP is `req.ip`; behind reverse proxies it is
 * the real client only when `TRUST_PROXY_HOPS` matches them (see the public catalog contract).
 */
export const PublicRateLimit = () => UseGuards(ThrottlerGuard);
