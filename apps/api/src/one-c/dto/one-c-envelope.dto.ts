import { Equals, IsISO8601, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export const ONE_C_SCHEMA_VERSION = '1.0' as const;
export const ONE_C_SOURCE = 'ONE_C' as const;

const UTC_INSTANT_PATTERN = /Z$/;

export abstract class OneCEnvelopeDto {
  @Equals(ONE_C_SCHEMA_VERSION)
  schemaVersion!: typeof ONE_C_SCHEMA_VERSION;

  @IsUUID()
  messageId!: string;

  @IsString()
  @MaxLength(120)
  eventType!: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(UTC_INSTANT_PATTERN, { message: 'occurredAt must be an RFC 3339 UTC instant' })
  occurredAt!: string;

  @Equals(ONE_C_SOURCE)
  source!: typeof ONE_C_SOURCE;

  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9._:-]+$/, {
    message: 'correlationId contains unsupported characters',
  })
  correlationId!: string;

  @IsString()
  @MaxLength(200)
  @Matches(/\S/u, { message: 'idempotencyKey must not be blank' })
  idempotencyKey!: string;

  @IsString()
  @MaxLength(120)
  @Matches(/\S/u, { message: 'sourceRevision must not be blank' })
  sourceRevision!: string;
}

export interface OneCInboxItemResult {
  readonly externalId: string;
  readonly status: 'QUEUED';
}

export interface OneCInboxReceipt {
  readonly messageId: string;
  readonly correlationId: string;
  readonly status: 'ACCEPTED';
  readonly receivedAt: string;
  readonly results: readonly OneCInboxItemResult[];
}
