import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { CatalogPublicController } from './catalog.controller';

describe('CatalogPublicController route aliases', () => {
  it('exposes the stable public search suggestions alias', () => {
    const handler = CatalogPublicController.prototype.suggestions;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('search/suggestions');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });
});
