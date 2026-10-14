import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { HealthController } from './health.controller';

/** `GET /health` for the hosting platform's health checks (#238). */
@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
})
export class HealthModule {}
