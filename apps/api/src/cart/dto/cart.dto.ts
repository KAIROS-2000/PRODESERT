import { IsUUID, Matches } from 'class-validator';

const QUANTITY_PATTERN = /^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/;

export class AddCartItemDto {
  @IsUUID()
  variantId!: string;

  @Matches(QUANTITY_PATTERN, { message: 'quantity must be a positive decimal string' })
  quantity!: string;
}

export class UpdateCartItemDto {
  @Matches(QUANTITY_PATTERN, { message: 'quantity must be a positive decimal string' })
  quantity!: string;
}
