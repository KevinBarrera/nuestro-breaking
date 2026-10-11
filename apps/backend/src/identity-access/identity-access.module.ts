import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { AdminTeamController } from './admin-team.controller';
import { AdminTeamService } from './admin-team.service';
import { AuthController } from './auth.controller';
import { SessionAccessService } from './session-access.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, AdminTeamController],
  providers: [SessionAccessService, AdminTeamService],
  exports: [SessionAccessService],
})
export class IdentityAccessModule {}
