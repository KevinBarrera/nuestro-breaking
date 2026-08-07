import { Module } from '@nestjs/common';
import { DATABASE_CLIENT } from '@/database/database.constants';
import { DatabaseService } from '@/database/database.service';

@Module({
  providers: [
    DatabaseService,
    {
      provide: DATABASE_CLIENT,
      useFactory: (database: DatabaseService) => database.db,
      inject: [DatabaseService],
    },
  ],
  exports: [DATABASE_CLIENT],
})
export class DatabaseModule {}
