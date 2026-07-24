import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { OneCEnvelopeDto } from './one-c-envelope.dto';
import {
  IsOneCPaymentConsistent,
  IsOneCReservationConsistent,
} from './one-c-order-status.validators';

export const ONE_C_ORDER_STATUS_EVENT = 'order.status.updated' as const;

export const ONE_C_ORDER_STATUSES = [
  'DRAFT',
  'CREATED',
  'AWAITING_STOCK_CONFIRMATION',
  'AWAITING_PAYMENT',
  'PAYMENT_VERIFICATION',
  'PAID',
  'ASSEMBLING',
  'READY_FOR_PICKUP',
  'COMPLETED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_STORE',
  'RESERVATION_EXPIRED',
  'RETURN_REQUESTED',
  'RETURNED',
] as const;

export type OneCOrderStatus = (typeof ONE_C_ORDER_STATUSES)[number];

const MONEY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const POSITIVE_QUANTITY_PATTERN = /^(?=.*[1-9])(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;
const UTC_INSTANT_PATTERN = /Z$/;

export class OneCReservationStatusDto {
  @IsString()
  @MaxLength(120)
  @Matches(/\S/u, { message: 'externalReservationId must not be blank' })
  externalReservationId!: string;

  @IsIn(['PENDING', 'ACTIVE', 'RELEASED', 'EXPIRED', 'FAILED'])
  @IsOneCReservationConsistent({
    message: 'expiresAt is required while a reservation is ACTIVE',
  })
  status!: 'PENDING' | 'ACTIVE' | 'RELEASED' | 'EXPIRED' | 'FAILED';

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(UTC_INSTANT_PATTERN, { message: 'expiresAt must be an RFC 3339 UTC instant' })
  expiresAt?: string | null;
}

export class OneCPaymentStatusDto {
  @IsIn(['NOT_PAID', 'CONFIRMED'])
  @IsOneCPaymentConsistent({
    message:
      'confirmed payment requires confirmedAt/externalPaymentId; NOT_PAID requires explicit nulls',
  })
  status!: 'NOT_PAID' | 'CONFIRMED';

  @ValidateIf((_object, value: unknown) => value !== null)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(UTC_INSTANT_PATTERN, { message: 'confirmedAt must be an RFC 3339 UTC instant' })
  confirmedAt!: string | null;

  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @MaxLength(120)
  @Matches(/\S/u, { message: 'externalPaymentId must not be blank' })
  externalPaymentId!: string | null;
}

export class OneCOrderStatusLineDto {
  @IsString()
  @MaxLength(120)
  @Matches(/\S/u, { message: 'externalVariantId must not be blank' })
  externalVariantId!: string;

  @IsString()
  @Matches(POSITIVE_QUANTITY_PATTERN)
  quantity!: string;

  @IsString()
  @Matches(MONEY_PATTERN)
  confirmedUnitPrice!: string;

  @IsString()
  @Matches(MONEY_PATTERN)
  confirmedLineTotal!: string;

  @IsString()
  @MaxLength(120)
  @Matches(/\S/u, { message: 'stockSourceVersion must not be blank' })
  stockSourceVersion!: string;
}

export class OneCOrderStatusPayloadDto {
  @IsString()
  @MaxLength(120)
  @Matches(/\S/u, { message: 'externalOrderId must not be blank' })
  externalOrderId!: string;

  @IsString()
  @MaxLength(40)
  @Matches(/\S/u, { message: 'publicNumber must not be blank' })
  publicNumber!: string;

  @IsString()
  @MaxLength(180)
  @Matches(/\S/u, { message: 'eventId must not be blank' })
  eventId!: string;

  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  orderVersion!: number;

  @IsIn(ONE_C_ORDER_STATUSES)
  status!: OneCOrderStatus;

  @IsString()
  @Matches(MONEY_PATTERN)
  confirmedTotal!: string;

  @Equals('RUB')
  currency!: 'RUB';

  @IsOptional()
  @ValidateNested()
  @Type(() => OneCReservationStatusDto)
  reservation?: OneCReservationStatusDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OneCPaymentStatusDto)
  payment?: OneCPaymentStatusDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((line: OneCOrderStatusLineDto) => line.externalVariantId)
  @ValidateNested({ each: true })
  @Type(() => OneCOrderStatusLineDto)
  lines!: OneCOrderStatusLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  comment?: string;
}

export class OneCOrderStatusEnvelopeDto extends OneCEnvelopeDto {
  @Equals(ONE_C_ORDER_STATUS_EVENT)
  declare eventType: typeof ONE_C_ORDER_STATUS_EVENT;

  @ValidateNested()
  @Type(() => OneCOrderStatusPayloadDto)
  payload!: OneCOrderStatusPayloadDto;
}
