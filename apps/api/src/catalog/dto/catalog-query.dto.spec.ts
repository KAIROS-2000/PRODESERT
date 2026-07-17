import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CatalogProductsQueryDto } from './catalog-query.dto';

async function validationProperties(input: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(CatalogProductsQueryDto, input);
  const errors = await validate(dto);
  return errors.map((error) => error.property);
}

describe('CatalogProductsQueryDto', () => {
  it('normalizes and de-duplicates repeated multi-value filters', async () => {
    const dto = plainToInstance(CatalogProductsQueryDto, {
      brand: ['Callebaut', 'callebaut', 'IRCA'],
      availability: ['IN_STOCK', 'IN_STOCK', 'LOW_STOCK'],
      attribute: ['FORM: Каллеты ', 'form:каллеты', 'country: Бельгия'],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.brand).toEqual(['callebaut', 'irca']);
    expect(dto.availability).toEqual(['IN_STOCK', 'LOW_STOCK']);
    expect(dto.attribute).toEqual(['form:каллеты', 'country:бельгия']);
  });

  it('rejects an inverted price range', async () => {
    await expect(
      validationProperties({ priceMin: '1500.00', priceMax: '999.99' }),
    ).resolves.toContain('priceMax');
  });

  it.each(['missing-separator', ':value', 'bad code:value', 'code:'])(
    'rejects malformed attribute filter %s',
    async (attribute) => {
      await expect(validationProperties({ attribute })).resolves.toContain('attribute');
    },
  );

  it('limits repeated brand and attribute filters after de-duplication', async () => {
    const brands = Array.from({ length: 31 }, (_, index) => `brand-${index}`);
    const attributes = Array.from({ length: 61 }, (_, index) => `taste:value-${index}`);

    await expect(validationProperties({ brand: brands })).resolves.toContain('brand');
    await expect(validationProperties({ attribute: attributes })).resolves.toContain('attribute');
  });
});
