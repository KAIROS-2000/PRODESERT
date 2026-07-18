import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CheckoutOrganizationDto {
  @IsString()
  @MaxLength(300)
  @Matches(/\S/u, { message: 'organization name must not be blank' })
  name!: string;

  @IsString()
  @Matches(/^(?:\d{10}|\d{12})$/, { message: 'inn must contain 10 or 12 digits' })
  inn!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{9}$/, { message: 'kpp must contain 9 digits' })
  kpp?: string;
}

export class CheckoutDto {
  @IsISO8601({ strict: true, strictSeparator: true })
  @MaxLength(40)
  cartUpdatedAt!: string;

  @IsString()
  @MaxLength(120)
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsString()
  @MaxLength(32)
  phone!: string;

  @IsString()
  @MaxLength(320)
  email!: string;

  @IsBoolean()
  privacyConsent!: boolean;

  @IsBoolean()
  orderTermsConsent!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  comment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  desiredPickupAt?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutOrganizationDto)
  organization?: CheckoutOrganizationDto;
}
