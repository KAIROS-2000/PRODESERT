import { Controller, Get, Header, Param } from '@nestjs/common';
import { PublicContentService } from './public-content.service';

const PUBLIC_CACHE = 'public, s-maxage=60, stale-while-revalidate=300';

@Controller('content')
export class PublicContentController {
  constructor(private readonly content: PublicContentService) {}

  @Get('banners')
  @Header('Cache-Control', PUBLIC_CACHE)
  banners(): Promise<Record<string, unknown>> {
    return this.content.banners();
  }

  @Get('promotions')
  @Header('Cache-Control', PUBLIC_CACHE)
  promotions(): Promise<Record<string, unknown>> {
    return this.content.promotions();
  }

  @Get('pages')
  @Header('Cache-Control', PUBLIC_CACHE)
  pages(): Promise<Record<string, unknown>> {
    return this.content.pages();
  }

  @Get('pages/:slug')
  @Header('Cache-Control', PUBLIC_CACHE)
  page(@Param('slug') slug: string): Promise<Record<string, unknown>> {
    return this.content.page(slug);
  }
}
