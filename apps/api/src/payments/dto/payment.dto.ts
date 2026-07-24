import { Type } from 'class-transformer';
import type {
  ConfirmPaymentInput,
  PaymentProofInput,
  RejectPaymentInput,
  SendPaymentDetailsInput,
} from '@pro-dessert/contracts';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

export class SubmitPaymentProofDto implements PaymentProofInput {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedPaymentVersion!: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  @Matches(/^[\p{L}\p{N} ._:/№#+-]+$/u)
  paymentReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class PublishPaymentDetailsDto implements SendPaymentDetailsInput {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedOrderVersion!: number;
}

export class ConfirmPaymentDto extends PublishPaymentDetailsDto implements ConfirmPaymentInput {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedPaymentVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class RejectPaymentDto implements RejectPaymentInput {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedOrderVersion!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedPaymentVersion!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  comment!: string;
}
