import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { EventOrganizationReadService } from './application/event-organization-read.service';
import { EventOrganizationController } from './event-organization.controller';
import { EventOrganizationReadRepository } from './infrastructure/event-organization-read.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [EventOrganizationController],
  providers: [EventOrganizationReadService, EventOrganizationReadRepository],
})
export class EventOrganizationModule {}
