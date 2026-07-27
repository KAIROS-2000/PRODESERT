import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type {
  ChangePasswordInput,
  ConfirmEmailChangeInput,
  CreateOrganizationInput,
  RequestEmailChangeInput,
  UpdateAccountProfileInput,
  UpdateNotificationPreferencesInput,
  UpdateOrganizationInput,
} from '@pro-dessert/contracts';

const normalizeEmail = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().normalize('NFKC').toLowerCase() : value;

const validateNullableString = (_object: unknown, value: unknown): boolean =>
  value !== undefined && value !== null;

export class UpdateAccountProfileDto implements UpdateAccountProfileInput {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ValidateIf(validateNullableString)
  @IsString()
  @MaxLength(120)
  @Matches(/\S/u, { message: 'firstName must not be blank' })
  firstName?: string | null;

  @ValidateIf(validateNullableString)
  @IsString()
  @MaxLength(120)
  @Matches(/\S/u, { message: 'lastName must not be blank' })
  lastName?: string | null;

  @ValidateIf(validateNullableString)
  @IsString()
  @MaxLength(32)
  @Matches(/^\+?[0-9 ()-]{7,32}$/, { message: 'phone has an invalid format' })
  phone?: string | null;
}

export class RequestEmailChangeDto implements RequestEmailChangeInput {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(320)
  newEmail!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ConfirmEmailChangeDto implements ConfirmEmailChangeInput {
  @IsString()
  @MinLength(40)
  @MaxLength(256)
  token!: string;
}

export class ChangePasswordDto implements ChangePasswordInput {
  @IsString()
  @MinLength(1)
  @MaxLength(1_024)
  currentPassword!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1_024)
  newPassword!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class CreateOrganizationDto implements CreateOrganizationInput {
  @IsString()
  @MaxLength(300)
  @Matches(/\S/u, { message: 'name must not be blank' })
  name!: string;

  @IsString()
  @Matches(/^(?:\d{10}|\d{12})$/, { message: 'inn must contain 10 or 12 digits' })
  inn!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{9}$/, { message: 'kpp must contain 9 digits' })
  kpp?: string | null;
}

export class UpdateOrganizationDto implements UpdateOrganizationInput {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Matches(/\S/u, { message: 'name must not be blank' })
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?:\d{10}|\d{12})$/, { message: 'inn must contain 10 or 12 digits' })
  inn?: string;

  @ValidateIf(validateNullableString)
  @IsString()
  @Matches(/^\d{9}$/, { message: 'kpp must contain 9 digits' })
  kpp?: string | null;
}

export class DeleteOrganizationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class UpdateNotificationPreferencesDto implements UpdateNotificationPreferencesInput {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsOptional()
  @IsBoolean()
  orderUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  paymentUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  reservationReminders?: boolean;

  @IsOptional()
  @IsBoolean()
  marketingEmails?: boolean;
}
