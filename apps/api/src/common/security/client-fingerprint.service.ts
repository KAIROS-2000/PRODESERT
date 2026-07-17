import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Request } from 'express';
import { type Environment } from '../config/environment';

export interface ClientMetadata {
  correlationId?: string;
  ipHash?: string;
  userAgent?: string;
}

@Injectable()
export class ClientFingerprintService {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  fromRequest(request: Request & { correlationId?: string }): ClientMetadata {
    const secret = this.config.get('PII_HASH_SECRET', { infer: true });
    const ipHash =
      secret && request.ip
        ? createHmac('sha256', secret).update(request.ip, 'utf8').digest('hex')
        : undefined;
    const userAgent = request.header('user-agent')?.slice(0, 512);

    return {
      ...(request.correlationId ? { correlationId: request.correlationId } : {}),
      ...(ipHash ? { ipHash } : {}),
      ...(userAgent ? { userAgent } : {}),
    };
  }
}
