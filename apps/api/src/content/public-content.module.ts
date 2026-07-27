import { Module } from '@nestjs/common';
import { PublicContentController } from './public-content.controller';
import { PublicContentService } from './public-content.service';

@Module({
  controllers: [PublicContentController],
  providers: [PublicContentService],
})
export class PublicContentModule {}
