import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type PaymentDocument,
  PaymentDocumentKind,
  StatusSource,
  StorageStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  FileSignatureService,
  type IncomingPaymentFile,
  type ValidatedPaymentFile,
} from './file-signature.service';
import { FileScannerService } from './file-scanner.service';
import { S3ObjectStorageService } from './s3-object-storage.service';

export interface StorePaymentProofInput {
  readonly paymentId: string;
  readonly orderId: string;
  readonly file: IncomingPaymentFile;
  readonly source: 'STOREFRONT';
  readonly uploadedByUserId?: string;
}

export interface PrivatePaymentDocument {
  readonly record: PaymentDocument;
  readonly bytes: Buffer;
  readonly filename: string;
  readonly mimeType: string;
}

@Injectable()
export class PaymentDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signatures: FileSignatureService,
    private readonly scanner: FileScannerService,
    private readonly storage: S3ObjectStorageService,
  ) {}

  async storeProof(input: StorePaymentProofInput): Promise<PaymentDocument> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: input.paymentId },
      select: { orderId: true },
    });
    if (!payment || payment.orderId !== input.orderId) throw this.notFound();
    const file = this.signatures.validate(input.file);
    const existing = await this.prisma.paymentDocument.findFirst({
      where: {
        paymentId: input.paymentId,
        kind: PaymentDocumentKind.PAYMENT_PROOF,
        sha256: file.sha256,
        storageStatus: { not: StorageStatus.FAILED },
      },
    });
    if (existing?.storageStatus === StorageStatus.AVAILABLE) return existing;
    if (existing) {
      throw new ConflictException({
        code: 'PAYMENT_PROOF_UPLOAD_IN_PROGRESS',
        message: 'Этот файл уже загружается. Повторите проверку статуса позже.',
      });
    }
    return this.store({
      paymentId: input.paymentId,
      kind: PaymentDocumentKind.PAYMENT_PROOF,
      file,
      source: StatusSource.STOREFRONT,
      uploadedByUserId: input.uploadedByUserId,
      scanRequired: true,
    });
  }

  async storeInvoice(
    paymentId: string,
    publicNumber: string,
    bytes: Buffer,
  ): Promise<PaymentDocument> {
    const file: ValidatedPaymentFile = {
      buffer: bytes,
      originalFilename: `schet-${publicNumber}.pdf`,
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      sizeBytes: bytes.length,
      sha256: (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex'),
    };
    const existing = await this.prisma.paymentDocument.findFirst({
      where: {
        paymentId,
        kind: PaymentDocumentKind.INVOICE,
        sha256: file.sha256,
        storageStatus: { not: StorageStatus.FAILED },
      },
    });
    if (existing?.storageStatus === StorageStatus.AVAILABLE) return existing;
    return this.store({
      paymentId,
      kind: PaymentDocumentKind.INVOICE,
      file,
      source: StatusSource.SYSTEM,
      scanRequired: false,
    });
  }

  async getPrivate(documentId: string): Promise<PrivatePaymentDocument> {
    const record = await this.prisma.paymentDocument.findUnique({ where: { id: documentId } });
    if (
      !record ||
      record.storageStatus !== StorageStatus.AVAILABLE ||
      !['CLEAN', 'NOT_REQUIRED'].includes(record.scanStatus)
    ) {
      throw this.notFound();
    }
    return {
      record,
      bytes: await this.storage.get(record.objectKey),
      filename: record.originalFilename,
      mimeType: record.mimeType,
    };
  }

  private async store(input: {
    paymentId: string;
    kind: PaymentDocumentKind;
    file: ValidatedPaymentFile;
    source: StatusSource;
    uploadedByUserId?: string;
    scanRequired: boolean;
  }): Promise<PaymentDocument> {
    const objectKey = `private/payments/${input.paymentId}/${input.kind.toLowerCase()}/${randomUUID()}.${input.file.extension}`;
    const pending = await this.prisma.paymentDocument.create({
      data: {
        paymentId: input.paymentId,
        kind: input.kind,
        objectKey,
        originalFilename: input.file.originalFilename,
        storedFilename: objectKey.slice(objectKey.lastIndexOf('/') + 1),
        mimeType: input.file.detectedMimeType,
        sizeBytes: BigInt(input.file.sizeBytes),
        sha256: input.file.sha256,
        storageStatus: StorageStatus.PENDING_UPLOAD,
        scanStatus: input.scanRequired ? 'PENDING' : 'NOT_REQUIRED',
        source: input.source,
        ...(input.uploadedByUserId ? { uploadedByUserId: input.uploadedByUserId } : {}),
      },
    });
    try {
      await this.storage.put(objectKey, input.file.buffer, input.file.detectedMimeType);
      if (input.scanRequired) {
        const scanResult = await this.scanner.scan(input.file.buffer);
        if (scanResult === 'INFECTED') {
          await this.storage.remove(objectKey);
          await this.prisma.paymentDocument.update({
            where: { id: pending.id },
            data: {
              storageStatus: StorageStatus.FAILED,
              scanStatus: 'INFECTED',
              scannedAt: new Date(),
              failureReason: 'MALWARE_DETECTED',
            },
          });
          throw new BadRequestException({
            code: 'PAYMENT_PROOF_MALWARE_DETECTED',
            message: 'Файл не прошёл проверку безопасности.',
          });
        }
      }
      return await this.prisma.paymentDocument.update({
        where: { id: pending.id },
        data: {
          storageStatus: StorageStatus.AVAILABLE,
          scanStatus: input.scanRequired ? 'CLEAN' : 'NOT_REQUIRED',
          availableAt: new Date(),
          ...(input.scanRequired ? { scannedAt: new Date() } : {}),
        },
      });
    } catch (error: unknown) {
      await this.storage.remove(objectKey);
      const current = await this.prisma.paymentDocument.findUnique({
        where: { id: pending.id },
        select: { scanStatus: true },
      });
      if (current?.scanStatus === 'INFECTED') throw error;
      await this.prisma.paymentDocument.update({
        where: { id: pending.id },
        data: {
          storageStatus: StorageStatus.FAILED,
          scanStatus: input.scanRequired ? 'FAILED' : 'NOT_REQUIRED',
          failureReason: 'DOCUMENT_STORAGE_FAILED',
        },
      });
      throw error;
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'PAYMENT_DOCUMENT_NOT_FOUND',
      message: 'Документ не найден или недоступен.',
    });
  }
}
