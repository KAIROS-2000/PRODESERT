import { type Prisma } from '@prisma/client';
import { type CartView } from '@pro-dessert/contracts';
import { type AuthenticatedPrincipal } from '../auth/auth.types';

export interface CartAccess {
  cartId: string;
  scopeHash: string;
  principal?: AuthenticatedPrincipal;
  guestTokenRaw?: string;
}

export interface ValidatedCartLine {
  itemId: string;
  productId: string;
  variantId: string;
  oneCProductId: string;
  oneCVariantId: string;
  sku: string;
  productName: string;
  brandName: string | null;
  offerName: string;
  packDescription: string | null;
  unit: string;
  vatRate: Prisma.Decimal;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  oldUnitPrice: Prisma.Decimal | null;
  unitDiscount: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
  lineDiscount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  imageUrl: string | null;
  imageAlt: string | null;
}

export interface ValidatedCart {
  view: CartView;
  productIds: readonly string[];
  lines: readonly ValidatedCartLine[];
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
  materiallyChanged: boolean;
}
