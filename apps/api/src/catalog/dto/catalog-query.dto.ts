import { Transform, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

const toInteger = ({ value }: TransformFnParams): unknown => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return value;
  return Number.parseInt(value, 10);
};

const toNumber = ({ value }: TransformFnParams): unknown => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value)) return value;
  return Number.parseFloat(value);
};

const toBoolean = ({ value }: TransformFnParams): unknown => {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
};

const toUniqueStringArray = (
  { value }: TransformFnParams,
  normalize: (entry: string) => string = (entry) => entry.trim().normalize('NFKC'),
): unknown => {
  const entries = Array.isArray(value) ? value : typeof value === 'string' ? [value] : null;
  if (!entries || entries.some((entry) => typeof entry !== 'string')) return value;
  return [...new Set(entries.map((entry) => normalize(entry)))];
};

const toBrandArray = (params: TransformFnParams): unknown =>
  toUniqueStringArray(params, (entry) => entry.trim().normalize('NFKC').toLowerCase());

const toAvailabilityArray = (params: TransformFnParams): unknown => toUniqueStringArray(params);

const toAttributeArray = (params: TransformFnParams): unknown =>
  toUniqueStringArray(params, (entry) => {
    const normalized = entry.trim().normalize('NFKC');
    const separator = normalized.indexOf(':');
    if (separator < 0) return normalized;
    const code = normalized.slice(0, separator).trim().toLowerCase();
    const value = normalized
      .slice(separator + 1)
      .trim()
      .toLowerCase();
    return `${code}:${value}`;
  });

function IsValidPriceRange(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isValidPriceRange',
      target: target.constructor,
      propertyName: propertyName.toString(),
      options: validationOptions,
      validator: {
        validate(value: unknown, arguments_: ValidationArguments): boolean {
          const object = arguments_.object as { priceMin?: unknown };
          return (
            value === undefined ||
            object.priceMin === undefined ||
            (typeof value === 'number' &&
              typeof object.priceMin === 'number' &&
              object.priceMin <= value)
          );
        },
        defaultMessage(): string {
          return 'priceMin must not be greater than priceMax';
        },
      },
    });
  };
}

export const catalogSorts = [
  'relevance',
  'price_asc',
  'price_desc',
  'newest',
  'popular',
  'discount_desc',
  'availability',
  'name_asc',
] as const;

export const catalogAvailabilities = [
  'IN_STOCK',
  'LOW_STOCK',
  'BACKORDER',
  'OUT_OF_STOCK',
] as const;

export type CatalogSortValue = (typeof catalogSorts)[number];
export type CatalogAvailabilityValue = (typeof catalogAvailabilities)[number];

export class CatalogProductsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  category?: string;

  @IsOptional()
  @Transform(toBrandArray)
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(220, { each: true })
  brand?: string[];

  @IsOptional()
  @Transform(toNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  priceMin?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  @IsValidPriceRange()
  priceMax?: number;

  @IsOptional()
  @Transform(toAvailabilityArray)
  @IsArray()
  @ArrayMaxSize(catalogAvailabilities.length)
  @IsIn(catalogAvailabilities, { each: true })
  availability?: CatalogAvailabilityValue[];

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  sale?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isNew?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isHit?: boolean;

  /** Repeated query parameter: attribute=code:value&attribute=other:value. */
  @IsOptional()
  @Transform(toAttributeArray)
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  @MaxLength(400, { each: true })
  @Matches(/^[a-z0-9][a-z0-9_-]{0,98}:.{1,300}$/u, {
    each: true,
    message: 'attribute must use code:value format',
  })
  attribute?: string[];

  @IsOptional()
  @IsIn(catalogSorts)
  sort?: CatalogSortValue;

  @IsOptional()
  @Transform(toInteger)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page = 1;

  @IsOptional()
  @Transform(toInteger)
  @IsInt()
  @Min(1)
  @Max(60)
  limit = 24;
}

export class CatalogSuggestionsQueryDto {
  @IsString()
  @MaxLength(120)
  q!: string;

  @IsOptional()
  @Transform(toInteger)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 8;
}

export class MockCatalogImportDto {
  @IsOptional()
  @IsIn(['BASELINE', 'PRICE_STOCK_UPDATE'])
  scenario: 'BASELINE' | 'PRICE_STOCK_UPDATE' = 'BASELINE';
}
