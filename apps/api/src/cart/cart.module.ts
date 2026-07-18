import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { OpaqueTokenService } from '../common/security/opaque-token.service';
import { CartCookieService } from './cart-cookie.service';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { OptionalSessionGuard } from './optional-session.guard';

@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [CartController],
  providers: [CartService, CartCookieService, OptionalSessionGuard, OpaqueTokenService],
  exports: [CartService, CartCookieService, OptionalSessionGuard],
})
export class CartModule {}
