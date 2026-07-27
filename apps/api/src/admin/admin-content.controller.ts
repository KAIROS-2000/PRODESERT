import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { type AuthenticatedPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RequestCorrelationId } from '../common/request/request-correlation-id.decorator';
import { AdminContentService } from './admin-content.service';
import {
  CreateBannerDto,
  CreateContentPageDto,
  CreatePromotionDto,
  ProductCatalogQueryDto,
  ReplaceProductImagesDto,
  ReplaceRelatedProductsDto,
  SearchSynonymDto,
  UpdateBannerDto,
  UpdateContentPageDto,
  UpdateProductContentDto,
  UpdatePromotionDto,
} from './dto/admin.dto';

const PRIVATE_CACHE = 'private, no-store, max-age=0';

@Controller('admin')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.CONTENT_MANAGER, Role.ADMIN)
export class AdminContentController {
  constructor(private readonly content: AdminContentService) {}

  @Get('catalog/products')
  @Header('Cache-Control', PRIVATE_CACHE)
  products(@Query() query: ProductCatalogQueryDto): Promise<Record<string, unknown>> {
    return this.content.products(query);
  }

  @Get('catalog/products/:id')
  @Header('Cache-Control', PRIVATE_CACHE)
  product(@Param('id', new ParseUUIDPipe()) id: string): Promise<Record<string, unknown>> {
    return this.content.product(id);
  }

  @Patch('catalog/products/:id/content')
  updateProductContent(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductContentDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @RequestCorrelationId() correlationId?: string,
  ): Promise<Record<string, unknown>> {
    return this.content.updateProductContent(id, dto, principal, correlationId);
  }

  @Put('catalog/products/:id/images')
  replaceImages(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplaceProductImagesDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @RequestCorrelationId() correlationId?: string,
  ): Promise<Record<string, unknown>> {
    return this.content.replaceImages(id, dto, principal, correlationId);
  }

  @Put('catalog/products/:id/relations')
  replaceRelations(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplaceRelatedProductsDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @RequestCorrelationId() correlationId?: string,
  ): Promise<Record<string, unknown>> {
    return this.content.replaceRelations(id, dto, principal, correlationId);
  }

  @Get('catalog/taxonomy')
  @Header('Cache-Control', PRIVATE_CACHE)
  taxonomy(): Promise<Record<string, unknown>> {
    return this.content.catalogTaxonomy();
  }

  @Get('catalog/synonyms')
  @Header('Cache-Control', PRIVATE_CACHE)
  synonyms(): Promise<Record<string, unknown>> {
    return this.content.synonyms();
  }

  @Post('catalog/synonyms')
  @HttpCode(HttpStatus.CREATED)
  createSynonym(
    @Body() dto: SearchSynonymDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @RequestCorrelationId() correlationId?: string,
  ): Promise<Record<string, unknown>> {
    return this.content.createSynonym(dto, principal, correlationId);
  }

  @Patch('catalog/synonyms/:id')
  updateSynonym(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SearchSynonymDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @RequestCorrelationId() correlationId?: string,
  ): Promise<Record<string, unknown>> {
    return this.content.updateSynonym(id, dto, principal, correlationId);
  }

  @Delete('catalog/synonyms/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSynonym(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @RequestCorrelationId() correlationId?: string,
  ): Promise<void> {
    await this.content.deleteSynonym(id, principal, correlationId);
  }

  @Get('promotions')
  @Header('Cache-Control', PRIVATE_CACHE)
  promotions(): Promise<Record<string, unknown>> {
    return this.content.promotions();
  }

  @Post('promotions')
  @HttpCode(HttpStatus.CREATED)
  createPromotion(
    @Body() dto: CreatePromotionDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @RequestCorrelationId() correlationId?: string,
  ): Promise<Record<string, unknown>> {
    return this.content.createPromotion(dto, principal, correlationId);
  }

  @Patch('promotions/:id')
  updatePromotion(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePromotionDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @RequestCorrelationId() correlationId?: string,
  ): Promise<Record<string, unknown>> {
    return this.content.updatePromotion(id, dto, principal, correlationId);
  }

  @Get('content/banners')
  @Header('Cache-Control', PRIVATE_CACHE)
  banners(): Promise<Record<string, unknown>> {
    return this.content.banners();
  }

  @Post('content/banners')
  @HttpCode(HttpStatus.CREATED)
  createBanner(
    @Body() dto: CreateBannerDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @RequestCorrelationId() correlationId?: string,
  ): Promise<Record<string, unknown>> {
    return this.content.createBanner(dto, principal, correlationId);
  }

  @Patch('content/banners/:id')
  updateBanner(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBannerDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @RequestCorrelationId() correlationId?: string,
  ): Promise<Record<string, unknown>> {
    return this.content.updateBanner(id, dto, principal, correlationId);
  }

  @Get('content/pages')
  @Header('Cache-Control', PRIVATE_CACHE)
  pages(): Promise<Record<string, unknown>> {
    return this.content.pages();
  }

  @Post('content/pages')
  @HttpCode(HttpStatus.CREATED)
  createPage(
    @Body() dto: CreateContentPageDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @RequestCorrelationId() correlationId?: string,
  ): Promise<Record<string, unknown>> {
    return this.content.createPage(dto, principal, correlationId);
  }

  @Patch('content/pages/:id')
  updatePage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateContentPageDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @RequestCorrelationId() correlationId?: string,
  ): Promise<Record<string, unknown>> {
    return this.content.updatePage(id, dto, principal, correlationId);
  }
}
