import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { IdentityAccessModule } from '@/identity-access/identity-access.module';
import { PublicRateLimitModule } from '@/http';
import { AdminEventsController } from './admin-events/admin-events.controller';
import { AdminEventsService } from './admin-events/admin-events.service';
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
import { ActivityAdminController } from './activity-admin/activity-admin.controller';
import { ActivityAdminService } from './activity-admin/activity-admin.service';
import { PassTypeAdminController } from './pass-type-admin/pass-type-admin.controller';
import { PassTypeAdminService } from './pass-type-admin/pass-type-admin.service';
import { RegistrationEntitlementsController } from './registration-entitlements/registration-entitlements.controller';
import { RegistrationEntitlementsService } from './registration-entitlements/registration-entitlements.service';
import { EventSalesController } from './sales/event-sales.controller';
import { EventSalesService } from './sales/event-sales.service';
import { PublicCatalogController } from './public-catalog/public-catalog.controller';
import { PublicCatalogService } from './public-catalog/public-catalog.service';
import { PublicRegistrationController } from './public-registration/public-registration.controller';
import { PublicRegistrationService } from './public-registration/public-registration.service';
import { PENDING_PAYMENT_WINDOW, readPendingPaymentWindow } from './shared/pending-payment-window';
import { VenueAdminController } from './venue-admin/venue-admin.controller';
import { VenueAdminService } from './venue-admin/venue-admin.service';

@Module({
  imports: [DatabaseModule, IdentityAccessModule, PublicRateLimitModule],
  controllers: [
    AdminEventsController,
    EventFoundationController,
    RegistrationSearchController,
    ManualRegistrationController,
    CheckInController,
    CheckInEventListController,
    ActivityAdminController,
    PassTypeAdminController,
    RegistrationEntitlementsController,
    EventSalesController,
    PublicCatalogController,
    PublicRegistrationController,
    VenueAdminController,
  ],
  providers: [
    AdminEventsService,
    EventFoundationService,
    EventFoundationGuard,
    RegistrationSearchService,
    ManualRegistrationService,
    CheckInService,
    CheckInEventListService,
    ActivityAdminService,
    PassTypeAdminService,
    RegistrationEntitlementsService,
    EventSalesService,
    PublicCatalogService,
    PublicRegistrationService,
    VenueAdminService,
    { provide: PENDING_PAYMENT_WINDOW, useFactory: () => readPendingPaymentWindow(process.env) },
  ],
})
export class EventsModule {}
