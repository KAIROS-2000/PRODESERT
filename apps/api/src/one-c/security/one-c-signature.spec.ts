import 'reflect-metadata';
import {
  type ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';
import {
  ONE_C_INTEGRATION_ENDPOINT_METADATA,
  OneCIntegrationEndpoint,
} from '../decorators/one-c-integration-endpoint.decorator';
import { InMemoryOneCNonceStore } from './one-c-nonce-store';
import { ONE_C_SIGNATURE_HEADERS, OneCSignatureGuard } from './one-c-signature.guard';
import { type OneCHmacKeyStore, OneCSignatureService } from './one-c-signature.service';

const secret = 'stage-four-integration-secret-32-bytes-minimum';

class MarkedEndpoint {
  @OneCIntegrationEndpoint()
  handle(): true {
    return true;
  }
}

interface TestRequest extends Pick<Request, 'headers' | 'method' | 'originalUrl'> {
  rawBody?: Buffer;
}

function executionContext(request: TestRequest): ExecutionContext {
  return {
    getHandler: () => MarkedEndpoint.prototype.handle,
    getClass: () => MarkedEndpoint,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function signedRequest(
  signatures: OneCSignatureService,
  overrides: {
    timestamp?: string;
    nonce?: string;
    signature?: string;
    includeRawBody?: boolean;
  } = {},
): TestRequest {
  const rawBody = Buffer.from('{"schemaVersion":"1.0"}', 'utf8');
  const timestamp = overrides.timestamp ?? String(Math.floor(Date.now() / 1_000));
  const nonce = overrides.nonce ?? 'nonce-12345678901234567890';
  const contentSha256 = signatures.contentHash(rawBody);
  const components = {
    method: 'POST',
    pathAndQuery: '/api/v1/integration/1c/orders/status?mode=event',
    timestamp,
    nonce,
    contentSha256,
  };
  return {
    method: components.method,
    originalUrl: components.pathAndQuery,
    headers: {
      [ONE_C_SIGNATURE_HEADERS.keyId]: 'one-c-primary',
      [ONE_C_SIGNATURE_HEADERS.timestamp]: timestamp,
      [ONE_C_SIGNATURE_HEADERS.nonce]: nonce,
      [ONE_C_SIGNATURE_HEADERS.contentSha256]: contentSha256,
      [ONE_C_SIGNATURE_HEADERS.signature]:
        overrides.signature ?? signatures.sign(components, secret),
    },
    ...(overrides.includeRawBody === false ? {} : { rawBody }),
  };
}

describe('OneCSignatureGuard', () => {
  const signatures = new OneCSignatureService();
  const keys: OneCHmacKeyStore = {
    resolve: async (keyId) => (keyId === 'one-c-primary' ? secret : null),
  };

  function guard(nonces = new InMemoryOneCNonceStore()): OneCSignatureGuard {
    return new OneCSignatureGuard(new Reflector(), signatures, keys, nonces, {
      maxClockSkewSeconds: 300,
      nonceTtlSeconds: 601,
    });
  }

  it('publishes stable integration endpoint metadata', () => {
    expect(
      Reflect.getMetadata(ONE_C_INTEGRATION_ENDPOINT_METADATA, MarkedEndpoint.prototype.handle),
    ).toBe(true);
  });

  it('rejects a bad HMAC signature', async () => {
    const request = signedRequest(signatures, { signature: '0'.repeat(64) });
    await expect(guard().canActivate(executionContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a request outside the allowed clock skew', async () => {
    const oldTimestamp = String(Math.floor(Date.now() / 1_000) - 301);
    const request = signedRequest(signatures, { timestamp: oldTimestamp });
    await expect(guard().canActivate(executionContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('claims the nonce once and rejects a replay', async () => {
    const request = signedRequest(signatures);
    const signatureGuard = guard();
    await expect(signatureGuard.canActivate(executionContext(request))).resolves.toBe(true);
    await expect(signatureGuard.canActivate(executionContext(request))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REPLAY_DETECTED' }),
    });
  });

  it('fails closed when exact request bytes are unavailable', async () => {
    const request = signedRequest(signatures, { includeRawBody: false });
    await expect(guard().canActivate(executionContext(request))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
