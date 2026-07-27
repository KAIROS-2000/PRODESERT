import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  OrderStatus,
  PaymentStatus,
  RelatedProductType,
  ReservationStatus,
  SyncJobStatus,
} from '@prisma/client';

export class PaginationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export class AdminOrdersQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsEnum(['createdAt', 'grandTotal', 'status'] as const)
  sort: 'createdAt' | 'grandTotal' | 'status' = 'createdAt';

  @IsOptional()
  @IsEnum(['asc', 'desc'] as const)
  direction: 'asc' | 'desc' = 'desc';
}

export class AdminPaymentsQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;
}

export class AdminReservationsQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  expiringOnly?: boolean;
}

export class AdminAuditQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  correlationId?: string;
}

export class AdminSyncJobsQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(SyncJobStatus)
  status?: SyncJobStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  eventType?: string;
}

export class ExpectedOrderVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class CancelOrderDto extends ExpectedOrderVersionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class AddInternalNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

export class RetryDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class UpdateProductContentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedContentVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  shortDescription?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30_000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30_000)
  composition?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30_000)
  application?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30_000)
  restrictions?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30_000)
  storageDescription?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  seoTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  seoDescription?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Matches(/^(?:\/(?!\/)|https?:\/\/)/i)
  canonicalUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  isHit?: boolean;

  @IsOptional()
  @IsBoolean()
  isNew?: boolean;
}

export class ProductImageInputDto {
  @IsString()
  @MaxLength(1000)
  objectKey!: string;

  @IsString()
  @MaxLength(1000)
  @Matches(/^(?:\/(?!\/)|https?:\/\/)/i)
  publicUrl!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  alt!: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder = 0;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class ReplaceProductImagesDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedContentVersion!: number;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ProductImageInputDto)
  images!: ProductImageInputDto[];
}

export class RelatedProductInputDto {
  @IsUUID()
  targetProductId!: string;

  @IsEnum(RelatedProductType)
  relationType!: RelatedProductType;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder = 0;
}

export class ReplaceRelatedProductsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedContentVersion!: number;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RelatedProductInputDto)
  relations!: RelatedProductInputDto[];
}

export class SearchSynonymDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  normalizedTerm!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  canonicalTerm!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;

  @Type(() => Number)
  @IsOptional()
  @Min(0.1)
  @Max(10)
  weight?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class ScheduledContentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30_000)
  body?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Matches(/^(?:\/(?!\/)|https?:\/\/)/i)
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  imageAlt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Matches(/^(?:\/(?!\/)|https?:\/\/)/i)
  linkUrl?: string | null;

  @IsOptional()
  @IsISO8601()
  startsAt?: string | null;

  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(-10_000)
  @Max(10_000)
  priority?: number;
}

export class CreatePromotionDto extends ScheduledContentDto {
  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Matches(/^#[0-9a-f]{6}$/i)
  badgeColor?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Matches(/^#[0-9a-f]{6}$/i)
  textColor?: string | null;

  @IsOptional()
  @Type(() => Number)
  @Min(0.01)
  @Max(100)
  discountPercent?: number | null;

  @IsOptional()
  @IsBoolean()
  discountManagedBySite?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  productIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  categoryIds?: string[];
}

export class UpdatePromotionDto extends CreatePromotionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class CreateBannerDto extends ScheduledContentDto {}

export class UpdateBannerDto extends CreateBannerDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class CreateContentPageDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{0,218}$/)
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  seoTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  seoDescription?: string | null;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class UpdateContentPageDto extends CreateContentPageDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class PublishContentPageDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsBoolean()
  published!: boolean;
}

export class ProductCatalogQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;
}
