import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { FileSignatureService } from './file-signature.service';

describe('FileSignatureService', () => {
  const config = {
    get: jest.fn((key: string) => (key === 'PAYMENT_PROOF_MAX_BYTES' ? 64 : undefined)),
  };
  const service = new FileSignatureService(config as never);

  beforeEach(() => jest.clearAllMocks());

  it('accepts a PDF by signature and transliterates a Cyrillic client filename', () => {
    const buffer = Buffer.from('%PDF-1.7\nsafe');
    expect(
      service.validate({
        buffer,
        originalname: '../чек?.pdf',
        mimetype: 'application/pdf',
        size: buffer.length,
      }),
    ).toMatchObject({
      originalFilename: 'chek_.pdf',
      detectedMimeType: 'application/pdf',
      extension: 'pdf',
      sizeBytes: buffer.length,
    });
  });

  it('recovers a UTF-8 filename that multipart decoded as Latin-1', () => {
    const buffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const originalname = Buffer.from('Чек оплаты.png', 'utf8').toString('latin1');

    expect(
      service.validate({
        buffer,
        originalname,
        mimetype: 'image/png',
        size: buffer.length,
      }),
    ).toMatchObject({ originalFilename: 'Chek oplaty.png' });
  });

  it('rejects a spoofed JPEG declaration', () => {
    const buffer = Buffer.from('not-a-jpeg');
    expect(() =>
      service.validate({
        buffer,
        originalname: 'proof.jpg',
        mimetype: 'image/jpeg',
        size: buffer.length,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects a mismatched declared MIME type', () => {
    const buffer = Buffer.from('%PDF-1.7\nsafe');
    expect(() =>
      service.validate({
        buffer,
        originalname: 'proof.png',
        mimetype: 'image/png',
        size: buffer.length,
      }),
    ).toThrow(BadRequestException);
  });

  it('enforces the configured byte limit', () => {
    const buffer = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(64)]);
    expect(() =>
      service.validate({
        buffer,
        originalname: 'proof.pdf',
        mimetype: 'application/pdf',
        size: buffer.length,
      }),
    ).toThrow(PayloadTooLargeException);
  });
});
