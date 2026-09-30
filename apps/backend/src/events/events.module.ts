import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { IdentityAccessModule } from '@/identity-access/identity-access.module';
import { EventFoundationGuard } from './foundation/event-foundation.guard';
import { EventFoundationController } from './foundation/event-foundation.controller';
import { EventFoundationService } from './foundation/event-foundation.service';
import { RegistrationSearchController } from './registration-search/registration-search.controller';
import { RegistrationSearchService } from './registration-search/registration-search.service';

@Module({
  imports: [DatabaseModule, IdentityAccessModule],
  controllers: [EventFoundationController, RegistrationSearchController],
  providers: [EventFoundationService, EventFoundationGuard, RegistrationSearchService],
})
export class EventsModule {}
