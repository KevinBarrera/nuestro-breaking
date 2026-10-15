import { Module } from '@nestjs/common';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { DatabaseModule } from '@/database/database.module';
import { EventsModule } from '@/events/events.module';
import { HealthModule } from '@/health';
import { IdentityAccessModule } from '@/identity-access/identity-access.module';
import { NotificationsModule } from '@/notifications';
import { PaymentsModule } from '@/payments';

@Module({
  imports: [
    DatabaseModule,
    EventsModule,
    HealthModule,
    IdentityAccessModule,
    NotificationsModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
