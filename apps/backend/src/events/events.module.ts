import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { IdentityAccessModule } from '@/identity-access/identity-access.module';
import { EventFoundationGuard } from './foundation/event-foundation.guard';
import { EventFoundationController } from './foundation/event-foundation.controller';
import { EventFoundationService } from './foundation/event-foundation.service';

@Module({
  imports: [DatabaseModule, IdentityAccessModule],
  controllers: [EventFoundationController],
  providers: [EventFoundationService, EventFoundationGuard],
})
export class EventsModule {}
