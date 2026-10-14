import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createCorsDelegate } from './cors-options';
import { type Environment, readCorsOrigins, readTrustProxyHops } from './http-config';
import { assertJsonSourceAccess, keepUnsafeIntegersExact } from './json-reviver';

/**
 * HTTP wiring shared by `main.ts` and the e2e tests, so tests exercise the real CORS policy, JSON
 * parsing and client address. Call it before `init()`/`listen()`: Nest then skips its default JSON
 * parser.
 */
export function configureHttp(app: INestApplication, env: Environment = process.env): void {
  assertJsonSourceAccess();
  const trustProxyHops = readTrustProxyHops(env);
  // `req.ip` (and so the rate-limit key) becomes the client the outermost trusted proxy saw.
  if (trustProxyHops > 0) {
    (app as NestExpressApplication).set('trust proxy', trustProxyHops);
  }
  app.enableCors(createCorsDelegate(readCorsOrigins(env)));
  (app as NestExpressApplication).useBodyParser('json', { reviver: keepUnsafeIntegersExact });
}
