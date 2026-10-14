import { Controller, Get, Inject, Logger, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';

type Database = DatabaseService['db'];

/** A ping slower than this counts as down, so a stuck connection cannot hang the probe. */
export const HEALTH_PING_TIMEOUT_MS = 3_000;

export interface HealthResponse {
  status: 'ok';
}

/**
 * Liveness and readiness probe for the hosting platform: no session and no rate limit. A failed
 * database ping answers 503 with no error details; the cause is only logged.
 */
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@Inject(DATABASE_CLIENT) private readonly db: Database) {}

  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await withTimeout(this.db.execute(sql`select 1`), HEALTH_PING_TIMEOUT_MS);
    } catch (error) {
      this.logger.warn(
        `Database ping failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
    return { status: 'ok' };
  }
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Database ping timed out after ${timeoutMs} ms`)),
      timeoutMs,
    );
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}
