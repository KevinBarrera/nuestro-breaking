import type { INestApplication } from '@nestjs/common';
import { createCorsDelegate } from './cors-options';
import { type Environment, readCorsOrigins } from './http-config';

/** HTTP wiring shared by `main.ts` and the e2e tests, so tests exercise the real CORS policy. */
export function configureHttp(app: INestApplication, env: Environment = process.env): void {
  app.enableCors(createCorsDelegate(readCorsOrigins(env)));
}
