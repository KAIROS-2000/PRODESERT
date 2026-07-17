import { Global, Module } from '@nestjs/common';
import { ClientFingerprintService } from './security/client-fingerprint.service';
import { CsrfService } from './security/csrf.service';
import { JsonLogger } from './logging/json-logger.service';

@Global()
@Module({
  providers: [JsonLogger, ClientFingerprintService, CsrfService],
  exports: [JsonLogger, ClientFingerprintService, CsrfService],
})
export class CommonModule {}
