import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { AuthController } from './auth.controller';
import { SessionAccessService } from './session-access.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [SessionAccessService],
  exports: [SessionAccessService],
})
export class IdentityAccessModule {}
