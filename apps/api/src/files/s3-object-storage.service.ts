import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Environment } from '../common/config/environment';

@Injectable()
export class S3ObjectStorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<Environment, true>) {
    const accessKeyId = config.get('S3_ACCESS_KEY', { infer: true });
    const secretAccessKey = config.get('S3_SECRET_KEY', { infer: true });
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.client = new S3Client({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: config.get('S3_REGION', { infer: true }),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    });
  }

  async put(objectKey: string, bytes: Buffer, contentType: string): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Body: bytes,
          ContentType: contentType,
          CacheControl: 'private, no-store, max-age=0',
          Metadata: { classification: 'private-payment-document' },
        }),
      );
    } catch {
      throw this.unavailable();
    }
  }

  async get(objectKey: string): Promise<Buffer> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      if (!response.Body) throw new Error('empty object');
      return Buffer.from(await response.Body.transformToByteArray());
    } catch {
      throw this.unavailable();
    }
  }

  async remove(objectKey: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
    } catch {
      // A failed cleanup must not hide the original storage/scan error.
    }
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'PRIVATE_STORAGE_UNAVAILABLE',
      message: 'Хранилище документов временно недоступно.',
    });
  }
}
