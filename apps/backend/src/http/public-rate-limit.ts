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
 * Apply it only to public controllers. Behind a reverse proxy, `req.ip` is the proxy address
 * unless Express `trust proxy` is configured (see the public catalog contract).
 */
export const PublicRateLimit = () => UseGuards(ThrottlerGuard);
