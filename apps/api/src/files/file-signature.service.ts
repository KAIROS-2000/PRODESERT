import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Environment } from '../common/config/environment';

export interface IncomingPaymentFile {
  readonly buffer: Buffer;
  readonly originalname: string;
  readonly mimetype: string;
  readonly size: number;
}

export interface ValidatedPaymentFile {
  readonly buffer: Buffer;
  readonly originalFilename: string;
  readonly detectedMimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  readonly extension: 'pdf' | 'jpg' | 'png';
  readonly sizeBytes: number;
  readonly sha256: string;
}

const declaredMimeAliases = new Map<string, ValidatedPaymentFile['detectedMimeType']>([
  ['application/pdf', 'application/pdf'],
  ['image/jpeg', 'image/jpeg'],
  ['image/jpg', 'image/jpeg'],
  ['image/png', 'image/png'],
]);

@Injectable()
export class FileSignatureService {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  validate(file: IncomingPaymentFile): ValidatedPaymentFile {
    const maximum = this.config.get('PAYMENT_PROOF_MAX_BYTES', { infer: true });
    if (
      !Buffer.isBuffer(file.buffer) ||
      file.buffer.length === 0 ||
      file.size !== file.buffer.length
    ) {
      throw new BadRequestException({
        code: 'PAYMENT_PROOF_FILE_INVALID',
        message: 'Не удалось прочитать файл подтверждения.',
      });
    }
    if (file.buffer.length > maximum) {
      throw new PayloadTooLargeException({
        code: 'PAYMENT_PROOF_FILE_TOO_LARGE',
        message: `Размер файла не должен превышать ${Math.floor(maximum / 1_048_576)} МБ.`,
      });
    }

    const detected = this.detect(file.buffer);
    const declared = declaredMimeAliases.get(file.mimetype.trim().toLowerCase());
    if (!detected || declared !== detected.mimeType) {
      throw new BadRequestException({
        code: 'PAYMENT_PROOF_FILE_TYPE_INVALID',
        message: 'Допустимы только PDF, JPEG и PNG с корректным содержимым.',
      });
    }

    return {
      buffer: file.buffer,
      originalFilename: this.safeFilename(file.originalname, detected.extension),
      detectedMimeType: detected.mimeType,
      extension: detected.extension,
      sizeBytes: file.buffer.length,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  private detect(buffer: Buffer): {
    mimeType: ValidatedPaymentFile['detectedMimeType'];
    extension: ValidatedPaymentFile['extension'];
  } | null {
    if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
      return {
        mimeType: 'application/pdf',
        extension: 'pdf',
      };
    }
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { mimeType: 'image/jpeg', extension: 'jpg' };
    }
    if (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      return { mimeType: 'image/png', extension: 'png' };
    }
    return null;
  }

  private safeFilename(raw: string, extension: ValidatedPaymentFile['extension']): string {
    const normalized = Array.from(basename(raw || `payment-proof.${extension}`).normalize('NFKC'))
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && code !== 127;
      })
      .join('');
    const leaf = normalized
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);
    return leaf || `payment-proof.${extension}`;
  }
}
