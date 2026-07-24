import { Module } from '@nestjs/common';
import { FileScannerService } from './file-scanner.service';
import { FileSignatureService } from './file-signature.service';
import { InvoiceService } from './invoice.service';
import { PaymentDocumentService } from './payment-document.service';
import { S3ObjectStorageService } from './s3-object-storage.service';

@Module({
  providers: [
    FileSignatureService,
    FileScannerService,
    S3ObjectStorageService,
    PaymentDocumentService,
    InvoiceService,
  ],
  exports: [PaymentDocumentService, InvoiceService],
})
export class FilesModule {}
