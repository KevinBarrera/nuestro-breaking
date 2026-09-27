import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { AuthController } from './auth.controller';

@Module({ imports: [DatabaseModule], controllers: [AuthController] })
export class IdentityAccessModule {}
