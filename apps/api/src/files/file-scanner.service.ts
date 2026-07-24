import { Socket } from 'node:net';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Environment } from '../common/config/environment';

export type FileScanResult = 'CLEAN' | 'INFECTED';

@Injectable()
export class FileScannerService {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  async scan(buffer: Buffer): Promise<FileScanResult> {
    if (this.config.get('FILE_SCAN_MODE', { infer: true }) === 'local') return 'CLEAN';
    const host = this.config.get('CLAMAV_HOST', { infer: true });
    if (!host) throw this.unavailable();
    return this.scanWithClamAv(host, this.config.get('CLAMAV_PORT', { infer: true }), buffer);
  }

  private scanWithClamAv(host: string, port: number, buffer: Buffer): Promise<FileScanResult> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const chunks: Buffer[] = [];
      let settled = false;
      const finish = (error?: Error, result?: FileScanResult): void => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error);
        else resolve(result ?? 'CLEAN');
      };

      socket.setTimeout(15_000);
      socket.on('error', () => finish(this.unavailable()));
      socket.on('timeout', () => finish(this.unavailable()));
      socket.on('data', (chunk: Buffer) => chunks.push(chunk));
      socket.on('end', () => {
        const response = Buffer.concat(chunks).toString('utf8');
        if (response.includes(' FOUND')) finish(undefined, 'INFECTED');
        else if (response.includes(' OK')) finish(undefined, 'CLEAN');
        else finish(this.unavailable());
      });
      socket.connect(port, host, () => {
        socket.write(Buffer.from('zINSTREAM\0', 'utf8'));
        for (let offset = 0; offset < buffer.length; offset += 64 * 1024) {
          const chunk = buffer.subarray(offset, Math.min(offset + 64 * 1024, buffer.length));
          const length = Buffer.allocUnsafe(4);
          length.writeUInt32BE(chunk.length, 0);
          socket.write(length);
          socket.write(chunk);
        }
        socket.end(Buffer.alloc(4));
      });
    });
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'FILE_SCANNER_UNAVAILABLE',
      message: 'Проверка файла временно недоступна. Повторите попытку позже.',
    });
  }
}
