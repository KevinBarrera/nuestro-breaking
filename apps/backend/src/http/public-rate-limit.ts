import { UseGuards } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { readClientIpSource, resolveClientIp, type ClientIpRequest } from './client-ip';
import { readPublicRateLimit } from './http-config';

/**
 * In-memory throttler storage, configured from the environment when the app boots (invalid values
 * stop the boot). Counters are per process: several API instances do not share them. The counter
 * key is the client address `CLIENT_IP_SOURCE` selects (see `client-ip.ts`).
 */
export const PublicRateLimitModule = ThrottlerModule.forRootAsync({
  useFactory: () => {
    const source = readClientIpSource(process.env);
    return {
      throttlers: [readPublicRateLimit(process.env)],
      getTracker: (request: Record<string, unknown>) =>
        resolveClientIp(source, request as unknown as ClientIpRequest),
    };
  },
});

/**
 * Limits requests per client IP and route; over the limit the API answers 429 with `Retry-After`.
 * Apply it only to public controllers. The client IP comes from `CLIENT_IP_SOURCE`; with the
 * default `request` it is `req.ip`, the real client only when `TRUST_PROXY_HOPS` matches the
 * proxies (see the public catalog contract).
 */
export const PublicRateLimit = () => UseGuards(ThrottlerGuard);
