import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { AccountActivationController } from './account-activation.controller';
import { AccountActivationService } from './account-activation.service';
import { AdminTeamController } from './admin-team.controller';
import { AdminTeamService } from './admin-team.service';
import { AuthController } from './auth.controller';
import { SessionAccessService } from './session-access.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, AdminTeamController, AccountActivationController],
  providers: [SessionAccessService, AdminTeamService, AccountActivationService],
  exports: [SessionAccessService],
})
export class IdentityAccessModule {}
