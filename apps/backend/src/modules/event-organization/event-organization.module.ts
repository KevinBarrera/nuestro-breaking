import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { EventOrganizationReadService } from './application/event-organization-read.service';
import { EventOrganizationService } from './application/event-organization.service';
import { EventOrganizationController } from './event-organization.controller';
import { EventOrganizationReadRepository } from './infrastructure/event-organization-read.repository';
import { EventOrganizationRepository } from './infrastructure/event-organization.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [EventOrganizationController],
  providers: [
    EventOrganizationReadService,
    EventOrganizationReadRepository,
    EventOrganizationService,
    EventOrganizationRepository,
  ],
})
export class EventOrganizationModule {}
