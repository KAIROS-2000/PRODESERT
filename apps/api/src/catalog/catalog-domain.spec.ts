import {
  classifyAvailability,
  buildSearchTermVariants,
  normalizeCatalogQuery,
  parseAttributeFilters,
} from './catalog-domain';

describe('catalog domain', () => {
  it.each([
    [12, false, 'IN_STOCK'],
    [5, false, 'LOW_STOCK'],
    [0.25, false, 'LOW_STOCK'],
    [0, true, 'BACKORDER'],
    [0, false, 'OUT_OF_STOCK'],
  ])('classifies availability without exposing stock quantity', (quantity, backorder, expected) => {
    expect(classifyAvailability(quantity, backorder)).toBe(expected);
  });

  it('normalizes and de-duplicates structured attribute filters', () => {
    expect(
      parseAttributeFilters(['FORM: Каллеты ', 'form:каллеты', 'invalid', '../bad:value']),
    ).toEqual([{ code: 'form', value: 'каллеты' }]);
  });

  it('normalizes Unicode and whitespace for search', () => {
    expect(normalizeCatalogQuery('  БЕЛЫЙ   шоколад  ')).toBe('белый шоколад');
  });

  it('builds generic no-space and RU/EN transliteration variants', () => {
    expect(buildSearchTermVariants('тёмный шоколад')).toEqual(
      expect.arrayContaining(['тёмныйшоколад', 'tyomnyy shokolad', 'tyomnyyshokolad']),
    );
    expect(buildSearchTermVariants('shokolad')).toContain('шоколад');
  });
});
