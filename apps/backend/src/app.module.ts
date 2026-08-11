import { Module } from '@nestjs/common';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { DatabaseModule } from '@/database/database.module';
import { EventOrganizationModule } from '@/modules/event-organization/event-organization.module';

@Module({
  imports: [DatabaseModule, EventOrganizationModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
