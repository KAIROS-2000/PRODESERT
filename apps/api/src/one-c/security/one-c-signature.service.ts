import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

export const ONE_C_KEY_STORE = Symbol('ONE_C_KEY_STORE');
export const ONE_C_SIGNATURE_OPTIONS = Symbol('ONE_C_SIGNATURE_OPTIONS');

export interface OneCHmacKeyStore {
  resolve(keyId: string): Promise<Buffer | string | null>;
}

export interface OneCSignatureOptions {
  readonly maxClockSkewSeconds: number;
  /**
   * A nonce remains reserved beyond both sides of the accepted clock window.
   * Must be strictly greater than maxClockSkewSeconds.
   */
  readonly nonceTtlSeconds: number;
}

export interface OneCSignatureComponents {
  readonly method: string;
  readonly pathAndQuery: string;
  readonly timestamp: string;
  readonly nonce: string;
  readonly contentSha256: string;
}

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

@Injectable()
export class OneCSignatureService {
  contentHash(rawBody: Buffer): string {
    return createHash('sha256').update(rawBody).digest('hex');
  }

  canonicalString(components: OneCSignatureComponents): string {
    return [
      components.method.toUpperCase(),
      components.pathAndQuery,
      components.timestamp,
      components.nonce,
      components.contentSha256,
    ].join('\n');
  }

  sign(components: OneCSignatureComponents, secret: Buffer | string): string {
    return createHmac('sha256', secret)
      .update(this.canonicalString(components), 'utf8')
      .digest('hex');
  }

  validContentHash(rawBody: Buffer, suppliedHash: string): boolean {
    return this.safeHexEqual(this.contentHash(rawBody), suppliedHash);
  }

  verify(
    components: OneCSignatureComponents,
    suppliedSignature: string,
    secret: Buffer | string,
  ): boolean {
    return this.safeHexEqual(this.sign(components, secret), suppliedSignature);
  }

  private safeHexEqual(expectedHex: string, suppliedHex: string): boolean {
    if (!SHA256_HEX_PATTERN.test(suppliedHex)) {
      return false;
    }
    const expected = Buffer.from(expectedHex, 'hex');
    const supplied = Buffer.from(suppliedHex, 'hex');
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  }
}
