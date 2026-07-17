import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CatalogController, CatalogPublicController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CatalogImportService } from './import/catalog-import.service';
import { MockOneCCatalogAdapter } from './import/mock-one-c.adapter';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [CatalogController, CatalogPublicController],
  providers: [CatalogService, CatalogImportService, MockOneCCatalogAdapter],
  exports: [CatalogService],
})
export class CatalogModule {}
