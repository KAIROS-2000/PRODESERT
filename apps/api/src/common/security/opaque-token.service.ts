import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';

export interface OpaqueToken {
  raw: string;
  hash: string;
}

@Injectable()
export class OpaqueTokenService {
  generate(): OpaqueToken {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: this.hash(raw) };
  }

  hash(raw: string): string {
    return createHash('sha256').update(raw, 'utf8').digest('hex');
  }
}
