import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { type Request } from 'express';
import {
  OptionalSessionGuard,
  type RequestWithOptionalPrincipal,
} from '../cart/optional-session.guard';
import { SubmitPaymentProofDto } from './dto/payment.dto';
import { PaymentService } from './payment.service';
import {
  type PaymentProofResult,
  type PublicPaymentView,
  type UploadedPaymentProof,
} from './payment.types';

type PaymentRequest = Request &
  RequestWithOptionalPrincipal & {
    correlationId?: string;
  };

@Controller('orders/public/:number')
@UseGuards(OptionalSessionGuard)
export class PublicPaymentsController {
  constructor(private readonly payments: PaymentService) {}

  @Get('payment')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  payment(
    @Param('number') publicNumber: string,
    @Headers('authorization') authorization: string | undefined,
    @Req() request: PaymentRequest,
  ): Promise<PublicPaymentView> {
    return this.payments.publicPayment(publicNumber, authorization, request.principal);
  }

  @Post('payment-proof')
  @HttpCode(202)
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { files: 1, fileSize: 8 * 1024 * 1024, fields: 8 },
    }),
  )
  submitProof(
    @Param('number') publicNumber: string,
    @Body() dto: SubmitPaymentProofDto,
    @UploadedFile() file: UploadedPaymentProof | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: PaymentRequest,
  ): Promise<PaymentProofResult> {
    this.assertIdempotencyKey(idempotencyKey);
    return this.payments.submitProof({
      publicNumber,
      authorization,
      principal: request.principal,
      idempotencyKey,
      dto,
      ...(file ? { file } : {}),
      ...(request.correlationId ? { correlationId: request.correlationId } : {}),
    });
  }

  @Get('invoice')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async invoice(
    @Param('number') publicNumber: string,
    @Headers('authorization') authorization: string | undefined,
    @Req() request: PaymentRequest,
  ): Promise<StreamableFile> {
    const invoice = await this.payments.invoice(publicNumber, authorization, request.principal);
    return new StreamableFile(invoice.bytes, {
      type: invoice.mimeType,
      disposition: `attachment; filename="${invoice.filename}"`,
      length: invoice.bytes.length,
    });
  }

  private assertIdempotencyKey(value: string | undefined): asserts value is string {
    if (!value || !/^[A-Za-z0-9._:-]{8,128}$/.test(value)) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Передайте Idempotency-Key длиной от 8 до 128 символов.',
      });
    }
  }
}
