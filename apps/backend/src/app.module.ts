import { Module } from '@nestjs/common';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { DatabaseModule } from '@/database/database.module';
import { EventsModule } from '@/events/events.module';
import { IdentityAccessModule } from '@/identity-access/identity-access.module';
import { PaymentsModule } from '@/payments';

@Module({
  imports: [DatabaseModule, EventsModule, IdentityAccessModule, PaymentsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
