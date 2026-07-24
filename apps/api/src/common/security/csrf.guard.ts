import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';
import { CsrfService } from './csrf.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ONE_C_INTEGRATION_ENDPOINT_METADATA = 'pro-dessert:one-c-integration-endpoint';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly csrf: CsrfService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method.toUpperCase())) {
      return true;
    }
    const isSignedIntegrationEndpoint = this.reflector.getAllAndOverride<boolean>(
      ONE_C_INTEGRATION_ENDPOINT_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (isSignedIntegrationEndpoint === true) return true;
    this.csrf.assertTrustedRequest(request);
    return true;
  }
}
