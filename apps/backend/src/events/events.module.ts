import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { IdentityAccessModule } from '@/identity-access/identity-access.module';
import { EventFoundationGuard } from './foundation/event-foundation.guard';
import { EventFoundationController } from './foundation/event-foundation.controller';
import { EventFoundationService } from './foundation/event-foundation.service';
import { RegistrationSearchController } from './registration-search/registration-search.controller';
import { RegistrationSearchService } from './registration-search/registration-search.service';
import { ManualRegistrationController } from './manual-registration/manual-registration.controller';
import { ManualRegistrationService } from './manual-registration/manual-registration.service';
import { CheckInController } from './check-in/check-in.controller';
import { CheckInService } from './check-in/check-in.service';
import { CheckInEventListController } from './check-in-event-list/check-in-event-list.controller';
import { CheckInEventListService } from './check-in-event-list/check-in-event-list.service';

@Module({
  imports: [DatabaseModule, IdentityAccessModule],
  controllers: [
    EventFoundationController,
    RegistrationSearchController,
    ManualRegistrationController,
    CheckInController,
    CheckInEventListController,
  ],
  providers: [
    EventFoundationService,
    EventFoundationGuard,
    RegistrationSearchService,
    ManualRegistrationService,
    CheckInService,
    CheckInEventListService,
  ],
})
export class EventsModule {}
