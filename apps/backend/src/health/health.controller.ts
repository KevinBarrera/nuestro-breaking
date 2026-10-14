import { Controller, Get, Inject, Logger, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';

type Database = DatabaseService['db'];

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
      await this.db.execute(sql`select 1`);
    } catch (error) {
      this.logger.warn(
        `Database ping failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
    return { status: 'ok' };
  }
}
