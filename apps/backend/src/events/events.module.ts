import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { EventFoundationController } from './foundation/event-foundation.controller';
import { EventFoundationService } from './foundation/event-foundation.service';

@Module({
  imports: [DatabaseModule],
  controllers: [EventFoundationController],
  providers: [EventFoundationService],
})
export class EventsModule {}
