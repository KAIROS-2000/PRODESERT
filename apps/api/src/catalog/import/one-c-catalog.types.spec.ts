import { commercialProductUpdate, type OneCProduct } from './one-c-catalog.types';
import { compareCatalogSourceVersions } from './catalog-import.service';
import { MockOneCCatalogAdapter } from './mock-one-c.adapter';

describe('1C catalog ownership boundary', () => {
  it('does not place site-owned content into the commercial update payload', () => {
    const product = {
      oneCId: '10000000-0000-4000-8000-000000000001',
      baseName: 'Какао-порошок алкализованный',
      active: true,
      oneCGroupId: '1c-cocoa',
      brand: {
        oneCId: '30000000-0000-4000-8000-000000000001',
        name: 'Demo Brand',
        active: true,
      },
      attributes: [],
      variants: [],
    } satisfies OneCProduct;

    const update = commercialProductUpdate(product, 'test-v2');
    expect(update).toMatchObject({ baseName: product.baseName, active: true });
    expect(update).not.toHaveProperty('slug');
    expect(update).not.toHaveProperty('description');
    expect(update).not.toHaveProperty('seoTitle');
    expect(update).not.toHaveProperty('isHit');
    expect(update).not.toHaveProperty('images');
  });
});

describe('1C catalog version ordering', () => {
  it('compares numeric source revisions monotonically', () => {
    expect(compareCatalogSourceVersions('mock-catalog-v2', 'mock-catalog-v10')).toBeLessThan(0);
    expect(compareCatalogSourceVersions('mock-catalog-v11', 'mock-catalog-v10')).toBeGreaterThan(0);
    expect(compareCatalogSourceVersions('mock-catalog-v10', 'mock-catalog-v10')).toBe(0);
  });
});

describe('1C typed attributes', () => {
  it('keeps all four discriminated representations from the adapter contract', () => {
    const batch = new MockOneCCatalogAdapter().load('BASELINE');
    const cocoa = batch.products[0]?.attributes.find(
      (attribute) => attribute.code === 'cocoa_percent',
    );
    const form = batch.products[0]?.attributes.find((attribute) => attribute.code === 'form');
    const usage = batch.products[0]?.attributes.find(
      (attribute) => attribute.code === 'professional_usage',
    );
    const tempering = batch.products[0]?.attributes.find(
      (attribute) => attribute.code === 'requires_tempering',
    );

    expect(cocoa).toMatchObject({ dataType: 'NUMBER', value: 54.5 });
    expect(form).toMatchObject({ dataType: 'ENUM', value: 'callets' });
    expect(usage).toMatchObject({
      dataType: 'TEXT',
      value: 'Темперирование, корпусные конфеты и ганаш',
    });
    expect(tempering).toMatchObject({ dataType: 'BOOLEAN', value: true });
  });
});
