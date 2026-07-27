import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { AdminContentController } from './admin-content.controller';
import { AdminContentService } from './admin-content.service';
import { AdminOperationsController } from './admin-operations.controller';
import { AdminOperationsService } from './admin-operations.service';

@Module({
  imports: [AuthModule, FilesModule, ReservationsModule],
  controllers: [AdminOperationsController, AdminContentController],
  providers: [AdminOperationsService, AdminContentService],
})
export class AdminModule {}
