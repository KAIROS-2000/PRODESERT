import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  type CatalogBrand,
  type CatalogCategoryNode,
  type CatalogImportResult,
  type CatalogProductDetail,
  type CatalogProductsPage,
  type CatalogSearchSuggestion,
} from '@pro-dessert/contracts';
import { type AuthenticatedPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CatalogService } from './catalog.service';
import {
  CatalogProductsQueryDto,
  CatalogSuggestionsQueryDto,
  MockCatalogImportDto,
} from './dto/catalog-query.dto';
import { CatalogImportService } from './import/catalog-import.service';

@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly catalogImport: CatalogImportService,
  ) {}

  @Get('categories')
  categories(): Promise<readonly CatalogCategoryNode[]> {
    return this.catalog.categories();
  }

  @Get('products')
  products(@Query() query: CatalogProductsQueryDto): Promise<CatalogProductsPage> {
    return this.catalog.products(query);
  }

  @Get('products/:slug')
  product(@Param('slug') slug: string): Promise<CatalogProductDetail> {
    return this.catalog.productBySlug(slug);
  }

  @Get('search/suggestions')
  suggestions(
    @Query() query: CatalogSuggestionsQueryDto,
  ): Promise<readonly CatalogSearchSuggestion[]> {
    return this.catalog.suggestions(query);
  }

  @Post('import/mock')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SYSTEM)
  importMock(
    @Body() dto: MockCatalogImportDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<CatalogImportResult> {
    return this.catalogImport.runMockImport(dto.scenario, principal);
  }
}

/** Stable resource-oriented aliases retained alongside the /catalog namespace. */
@Controller()
export class CatalogPublicController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  categories(): Promise<readonly CatalogCategoryNode[]> {
    return this.catalog.categories();
  }

  @Get('categories/:slug')
  category(@Param('slug') slug: string): Promise<CatalogCategoryNode> {
    return this.catalog.categoryBySlug(slug);
  }

  @Get('brands')
  brands(): Promise<readonly CatalogBrand[]> {
    return this.catalog.brands();
  }

  @Get('products')
  products(@Query() query: CatalogProductsQueryDto): Promise<CatalogProductsPage> {
    return this.catalog.products(query);
  }

  @Get('products/:slug')
  product(@Param('slug') slug: string): Promise<CatalogProductDetail> {
    return this.catalog.productBySlug(slug);
  }

  @Get('search')
  search(@Query() query: CatalogProductsQueryDto): Promise<CatalogProductsPage> {
    return this.catalog.products(query);
  }

  @Get('search/suggestions')
  suggestions(
    @Query() query: CatalogSuggestionsQueryDto,
  ): Promise<readonly CatalogSearchSuggestion[]> {
    return this.catalog.suggestions(query);
  }
}
