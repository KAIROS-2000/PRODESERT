import {
  assertCatalogProjectionRevision,
  EqualCatalogVersionConflictError,
  StaleCatalogVersionError,
  toAttributeAssignmentColumns,
  type OneCAttribute,
} from './catalog-import-domain';

function attribute(overrides: Partial<OneCAttribute>): OneCAttribute {
  return {
    code: 'test_attribute',
    name: 'Тестовый атрибут',
    dataType: 'TEXT',
    value: 'значение',
    displayValue: 'Значение',
    ...overrides,
  } as OneCAttribute;
}

describe('1C typed attribute persistence', () => {
  it.each([
    {
      dataType: 'ENUM' as const,
      source: attribute({ dataType: 'ENUM', value: 'callets' }),
      enumValueId: '90000000-0000-4000-8000-000000000001',
      expected: {
        valueId: '90000000-0000-4000-8000-000000000001',
        textValue: null,
        numericValue: null,
        booleanValue: null,
      },
    },
    {
      dataType: 'TEXT' as const,
      source: attribute({ dataType: 'TEXT', value: 'Хранить в сухом месте' }),
      enumValueId: null,
      expected: {
        valueId: null,
        textValue: 'Хранить в сухом месте',
        numericValue: null,
        booleanValue: null,
      },
    },
    {
      dataType: 'NUMBER' as const,
      source: attribute({ dataType: 'NUMBER', value: 54.5 }),
      enumValueId: null,
      expected: {
        valueId: null,
        textValue: null,
        numericValue: 54.5,
        booleanValue: null,
      },
    },
    {
      dataType: 'BOOLEAN' as const,
      source: attribute({ dataType: 'BOOLEAN', value: false }),
      enumValueId: null,
      expected: {
        valueId: null,
        textValue: null,
        numericValue: null,
        booleanValue: false,
      },
    },
  ])('stores $dataType in exactly one typed value column', ({ source, enumValueId, expected }) => {
    const columns = toAttributeAssignmentColumns(source, enumValueId);

    expect(columns).toEqual(expected);
    expect(Object.values(columns).filter((value) => value !== null)).toHaveLength(1);
  });

  it('requires a dictionary value id for ENUM assignments', () => {
    expect(() =>
      toAttributeAssignmentColumns(attribute({ dataType: 'ENUM', value: 'callets' })),
    ).toThrow('enum_value_id_required:test_attribute');
  });
});

describe('1C projection revision semantics', () => {
  const base = {
    incomingVersion: 'catalog-v2',
    projectionKey: 'price:variant-1:RETAIL',
    incomingProjection: { amount: '150', currency: 'RUB' },
    currentProjection: { currency: 'RUB', amount: '150' },
  } as const;

  it('rejects a stale revision', () => {
    expect(() =>
      assertCatalogProjectionRevision({ ...base, currentVersion: 'catalog-v3' }),
    ).toThrow(StaleCatalogVersionError);
  });

  it('accepts an equal revision with the same canonical payload', () => {
    expect(() =>
      assertCatalogProjectionRevision({ ...base, currentVersion: 'catalog-v2' }),
    ).not.toThrow();
  });

  it('rejects an equal revision with a different payload', () => {
    expect(() =>
      assertCatalogProjectionRevision({
        ...base,
        currentVersion: 'catalog-v2',
        currentProjection: { amount: '149', currency: 'RUB' },
      }),
    ).toThrow(EqualCatalogVersionConflictError);
  });

  it('accepts a newer revision', () => {
    expect(() =>
      assertCatalogProjectionRevision({ ...base, currentVersion: 'catalog-v1' }),
    ).not.toThrow();
  });
});
