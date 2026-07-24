import {
  ConflictException,
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';
import { ONE_C_INTEGRATION_ENDPOINT_METADATA } from '../decorators/one-c-integration-endpoint.decorator';
import { ONE_C_NONCE_STORE, type OneCNonceStore } from './one-c-nonce-store';
import {
  ONE_C_KEY_STORE,
  ONE_C_SIGNATURE_OPTIONS,
  type OneCHmacKeyStore,
  type OneCSignatureComponents,
  type OneCSignatureOptions,
  OneCSignatureService,
} from './one-c-signature.service';

export const ONE_C_SIGNATURE_HEADERS = {
  keyId: 'x-pd-key-id',
  timestamp: 'x-pd-timestamp',
  nonce: 'x-pd-nonce',
  contentSha256: 'x-pd-content-sha256',
  signature: 'x-pd-signature',
} as const;

interface OneCRawRequest extends Request {
  readonly rawBody?: Buffer;
}

const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const NONCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,255}$/;
const UNIX_SECONDS_PATTERN = /^\d{10,13}$/;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

@Injectable()
export class OneCSignatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly signatures: OneCSignatureService,
    @Inject(ONE_C_KEY_STORE) private readonly keys: OneCHmacKeyStore,
    @Inject(ONE_C_NONCE_STORE) private readonly nonces: OneCNonceStore,
    @Inject(ONE_C_SIGNATURE_OPTIONS) private readonly options: OneCSignatureOptions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const marked = this.reflector.getAllAndOverride<boolean>(ONE_C_INTEGRATION_ENDPOINT_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (marked !== true) {
      return true;
    }

    this.assertOptions();
    const request = context.switchToHttp().getRequest<OneCRawRequest>();
    const keyId = this.header(request, ONE_C_SIGNATURE_HEADERS.keyId);
    const timestamp = this.header(request, ONE_C_SIGNATURE_HEADERS.timestamp);
    const nonce = this.header(request, ONE_C_SIGNATURE_HEADERS.nonce);
    const contentSha256 = this.header(request, ONE_C_SIGNATURE_HEADERS.contentSha256);
    const signature = this.header(request, ONE_C_SIGNATURE_HEADERS.signature);
    if (
      !keyId ||
      !KEY_ID_PATTERN.test(keyId) ||
      !timestamp ||
      !UNIX_SECONDS_PATTERN.test(timestamp) ||
      !nonce ||
      !NONCE_PATTERN.test(nonce) ||
      !contentSha256 ||
      !SHA256_HEX_PATTERN.test(contentSha256) ||
      !signature ||
      !SHA256_HEX_PATTERN.test(signature)
    ) {
      throw this.invalidSignature();
    }

    const timestampSeconds = Number(timestamp);
    if (!Number.isSafeInteger(timestampSeconds)) {
      throw this.invalidSignature();
    }
    const now = Date.now();
    const timestampMilliseconds = timestampSeconds * 1_000;
    if (Math.abs(now - timestampMilliseconds) > this.options.maxClockSkewSeconds * 1_000) {
      throw this.invalidSignature();
    }

    const rawBody = this.rawBody(request);
    if (!this.signatures.validContentHash(rawBody, contentSha256)) {
      throw this.invalidSignature();
    }

    let secret: Buffer | string | null;
    try {
      secret = await this.keys.resolve(keyId);
    } catch {
      throw this.dependencyUnavailable();
    }
    if (secret === null) {
      throw this.invalidSignature();
    }
    const secretLength =
      typeof secret === 'string' ? Buffer.byteLength(secret, 'utf8') : secret.length;
    if (secretLength < 32) {
      throw this.dependencyUnavailable();
    }

    const components: OneCSignatureComponents = {
      method: request.method,
      pathAndQuery: request.originalUrl,
      timestamp,
      nonce,
      contentSha256,
    };
    if (!this.signatures.verify(components, signature, secret)) {
      throw this.invalidSignature();
    }

    try {
      const claim = await this.nonces.claim(
        keyId,
        nonce,
        new Date(now + this.options.nonceTtlSeconds * 1_000),
      );
      if (claim === 'REPLAY') {
        throw new ConflictException({
          code: 'REPLAY_DETECTED',
          message: 'The integration request nonce has already been used.',
        });
      }
      if (claim !== 'CLAIMED') {
        throw this.dependencyUnavailable();
      }
    } catch (error: unknown) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw this.dependencyUnavailable();
    }
    return true;
  }

  private rawBody(request: OneCRawRequest): Buffer {
    if (Buffer.isBuffer(request.rawBody)) {
      return request.rawBody;
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      return Buffer.alloc(0);
    }
    // Reconstructing JSON would change signed bytes. Raw-body capture is mandatory.
    throw this.dependencyUnavailable();
  }

  private header(request: OneCRawRequest, name: string): string | undefined {
    const value = request.headers[name];
    return typeof value === 'string' ? value : undefined;
  }

  private assertOptions(): void {
    if (
      !Number.isInteger(this.options.maxClockSkewSeconds) ||
      this.options.maxClockSkewSeconds < 1 ||
      !Number.isInteger(this.options.nonceTtlSeconds) ||
      this.options.nonceTtlSeconds <= this.options.maxClockSkewSeconds
    ) {
      throw this.dependencyUnavailable();
    }
  }

  private invalidSignature(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_SIGNATURE',
      message: 'The integration signature is invalid.',
    });
  }

  private dependencyUnavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'DEPENDENCY_UNAVAILABLE',
      message: 'Integration authentication is temporarily unavailable.',
    });
  }
}
