import argon2 from 'argon2';
import { AttributeDataType, PrismaClient, Role } from '@prisma/client';
import {
  demoBrands,
  demoCategories,
  demoProducts,
  demoSynonyms,
  type DemoProductSeed,
} from './catalog-seed-data';

const prisma = new PrismaClient();

const uuid = (namespace: number, index: number): string =>
  `${namespace}0000000-0000-4000-8000-${index.toString().padStart(12, '0')}`;

const transliteration: Readonly<Record<string, string>> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

const slugify = (value: string): string =>
  [...value.normalize('NFKC').toLowerCase()]
    .map((character) => transliteration[character] ?? character)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 260);

function catalogImage(category: string): string {
  if (['chocolate-couverture', 'cocoa-products', 'chocolate-cocoa'].includes(category)) {
    return '/images/catalog/chocolate-couverture.webp';
  }
  if (['molds', 'tools', 'equipment', 'hygiene', 'books-training'].includes(category)) {
    return '/images/catalog/molds-tools.webp';
  }
  if (
    ['packaging', 'bases-capsules', 'storage-transport', 'business-supplies'].includes(category)
  ) {
    return '/images/catalog/pastry-packaging.webp';
  }
  return '/images/catalog/pro-ingredients.webp';
}

function storageFor(product: DemoProductSeed): string {
  if (product.category === 'frozen' || product.name.toLowerCase().includes('заморож')) {
    return 'Хранить при температуре не выше −18 °C. Повторно не замораживать.';
  }
  if (product.category === 'dairy-cream') {
    return 'Хранить по маркировке производителя; после вскрытия соблюдать холодовую цепь.';
  }
  return 'Хранить в сухом прохладном месте, защищённом от света и посторонних запахов.';
}

function normalizedProductCategory(product: DemoProductSeed): string {
  const name = product.name.toLowerCase();
  if (product.category === 'gelling-thickeners') {
    if (name.includes('пектин')) return 'pectin';
    if (name.includes('желатин')) return 'gelatin';
    if (name.includes('агар')) return 'agar';
    return 'thickeners';
  }
  if (product.category === 'sugars-syrups') {
    return name.includes('сироп') || name.includes('инверт') ? 'syrups' : 'baking-mixes';
  }
  if (product.category === 'nuts-pastes') return 'nut-pastes';
  if (product.category === 'glazes-fillings') return 'fillings';
  if (name.includes('трансферный') || name.includes('пищевая печать')) return 'food-printing';
  return product.category;
}

interface SeedAttributeInput {
  code: string;
  value: string;
}

function inferredTaste(product: DemoProductSeed): string | null {
  const name = product.name.toLowerCase();
  const tastes: readonly (readonly [string, string])[] = [
    ['ванил', 'Ваниль'],
    ['манго', 'Манго'],
    ['малин', 'Малина'],
    ['маракуй', 'Маракуйя'],
    ['апельсин', 'Апельсин'],
    ['лимон', 'Лимон'],
    ['фисташ', 'Фисташка'],
    ['фундук', 'Фундук'],
    ['миндал', 'Миндаль'],
    ['кофе', 'Кофе'],
    ['шоколад', 'Шоколад'],
  ];
  return tastes.find(([needle]) => name.includes(needle))?.[1] ?? null;
}

function dairyFatPercentage(product: DemoProductSeed): string | null {
  if (product.category !== 'dairy-cream') return null;
  const name = product.name.toLowerCase();
  if (name.includes('35%')) return '35%';
  if (name.includes('cremette') || name.includes('сливочный сыр')) return '65%';
  if (name.includes('растительн')) return '27%';
  if (name.includes('обезжир')) return '1,5%';
  if (name.includes('сыворот')) return '1,5%';
  return null;
}

function packagingAttributes(product: DemoProductSeed): SeedAttributeInput[] {
  const name = product.name.toLowerCase();
  const result: SeedAttributeInput[] = [{ code: 'product_type', value: product.form }];
  const dimensions = name.match(/(\d+)[×x](\d+)(?:[×x](\d+))?\s*(см|мм)/i);
  if (dimensions) {
    const [, length, width, height, unit] = dimensions;
    if (length && unit) result.push({ code: 'length', value: `${length} ${unit}` });
    if (width && unit) result.push({ code: 'width', value: `${width} ${unit}` });
    if (height && unit) result.push({ code: 'height', value: `${height} ${unit}` });
  } else if (name.includes('капкейк')) {
    result.push(
      { code: 'length', value: '25 см' },
      { code: 'width', value: '17 см' },
      { code: 'height', value: '10 см' },
    );
  } else if (name.includes('контейнер')) {
    result.push(
      { code: 'length', value: '40 см' },
      { code: 'width', value: '30 см' },
      { code: 'height', value: '20 см' },
    );
  }

  if (name.includes('подложк')) {
    const diameter = name.match(/(\d+)\s*см/)?.[1];
    if (diameter) result.push({ code: 'diameter', value: `${diameter} см` });
    result.push(
      { code: 'material', value: 'Переплётный картон' },
      { code: 'color', value: 'Золотой' },
    );
  } else if (name.includes('контейнер')) {
    result.push(
      { code: 'material', value: 'Пищевой пластик' },
      { code: 'color', value: 'Прозрачный' },
    );
  } else if (name.includes('этикет')) {
    result.push({ code: 'material', value: 'Термобумага' }, { code: 'color', value: 'Белый' });
  } else {
    result.push({ code: 'material', value: 'Картон' }, { code: 'color', value: 'Белый' });
  }
  result.push({ code: 'package_quantity', value: product.pack });
  return result;
}

function moldAttributes(product: DemoProductSeed): SeedAttributeInput[] {
  const name = product.name.toLowerCase();
  if (name.includes('18 см')) {
    return [
      { code: 'material', value: 'Нержавеющая сталь' },
      { code: 'diameter', value: '18 см' },
      { code: 'height', value: '4 см' },
      { code: 'shape', value: 'Круг' },
    ];
  }
  if (name.includes('сфера')) {
    return [
      { code: 'material', value: 'Поликарбонат' },
      { code: 'diameter', value: '30 мм' },
      { code: 'height', value: '30 мм' },
      { code: 'shape', value: 'Сфера' },
    ];
  }
  return [
    { code: 'material', value: 'Пищевой силикон' },
    { code: 'diameter', value: '80 мм' },
    { code: 'height', value: '45 мм' },
    { code: 'shape', value: 'Порционная' },
  ];
}

async function upsertCatalogVariant(input: {
  productId: string;
  productIndex: number;
  variantIndex: number;
  product: DemoProductSeed;
  warehouseId: string;
  price: number;
  pack: string;
  sourceVersion: string;
  available: number;
  allowBackorder: boolean;
  oldAmount: number | null;
}): Promise<string> {
  const variantOrdinal = input.productIndex * 10 + input.variantIndex;
  const oneCId = uuid(2, variantOrdinal);
  const skuCategory = input.product.category
    .replace(/[^a-z]/g, '')
    .slice(0, 5)
    .toUpperCase();
  const sku = `PD-${skuCategory}-${input.productIndex.toString().padStart(3, '0')}-${input.variantIndex}`;
  const reserved = input.available > 0 ? input.productIndex % 3 : 0;
  const now = new Date();
  const variant = await prisma.productVariant.upsert({
    where: { oneCId },
    update: {
      productId: input.productId,
      sku,
      offerName: `${input.product.name}, ${input.pack}`,
      packDescription: input.pack,
      unit: 'упак',
      vatRate: 20,
      minOrderQuantity: 1,
      salesMultiple: 1,
      countryOfOrigin: input.product.country ?? 'Россия',
      manufacturer: demoBrands[input.product.brand],
      shelfLifeDays: input.product.category === 'frozen' ? 180 : 365,
      storageConditions: storageFor(input.product),
      allowBackorder: input.allowBackorder,
      active: true,
      sortOrder: input.variantIndex - 1,
      oneCSourceVersion: input.sourceVersion,
      oneCLastSyncedAt: now,
    },
    create: {
      productId: input.productId,
      oneCId,
      sku,
      offerName: `${input.product.name}, ${input.pack}`,
      packDescription: input.pack,
      unit: 'упак',
      vatRate: 20,
      minOrderQuantity: 1,
      salesMultiple: 1,
      countryOfOrigin: input.product.country ?? 'Россия',
      manufacturer: demoBrands[input.product.brand],
      shelfLifeDays: input.product.category === 'frozen' ? 180 : 365,
      storageConditions: storageFor(input.product),
      allowBackorder: input.allowBackorder,
      active: true,
      sortOrder: input.variantIndex - 1,
      oneCSourceVersion: input.sourceVersion,
      oneCLastSyncedAt: now,
    },
  });

  await prisma.price.upsert({
    where: { variantId_priceType: { variantId: variant.id, priceType: 'RETAIL' } },
    update: {
      amount: input.price,
      oldAmount: input.oldAmount,
      currency: 'RUB',
      vatIncluded: true,
      sourceVersion: input.sourceVersion,
      lastSyncedAt: now,
    },
    create: {
      variantId: variant.id,
      priceType: 'RETAIL',
      amount: input.price,
      oldAmount: input.oldAmount,
      currency: 'RUB',
      vatIncluded: true,
      sourceVersion: input.sourceVersion,
      lastSyncedAt: now,
    },
  });
  await prisma.stockBalance.upsert({
    where: { variantId_warehouseId: { variantId: variant.id, warehouseId: input.warehouseId } },
    update: {
      onHand: input.available + reserved,
      reserved,
      available: input.available,
      sourceVersion: input.sourceVersion,
      asOf: now,
    },
    create: {
      variantId: variant.id,
      warehouseId: input.warehouseId,
      onHand: input.available + reserved,
      reserved,
      available: input.available,
      sourceVersion: input.sourceVersion,
      asOf: now,
    },
  });
  return variant.id;
}

async function assignAttribute(
  productId: string,
  definitionId: string,
  valueId: string,
  sourceVersion: string,
): Promise<void> {
  const existing = await prisma.productAttributeValue.findFirst({
    where: { productId, definitionId },
    select: { id: true },
  });
  if (existing) {
    await prisma.productAttributeValue.update({
      where: { id: existing.id },
      data: {
        valueId,
        textValue: null,
        numericValue: null,
        booleanValue: null,
        oneCSourceVersion: sourceVersion,
      },
    });
  } else {
    await prisma.productAttributeValue.create({
      data: { productId, definitionId, valueId, oneCSourceVersion: sourceVersion },
    });
  }
}

async function seed(): Promise<void> {
  const staffPassword = process.env.SEED_STAFF_PASSWORD ?? 'Local-Only-Change-Me-2026!';
  const staffPasswordHash = await argon2.hash(staffPassword, { type: argon2.argon2id });
  const staffAccounts: readonly { email: string; role: Role; firstName: string; lastName: string }[] = [
    {
      email: 'manager.local@pro-dessert.test',
      role: Role.MANAGER,
      firstName: 'Мария',
      lastName: 'Менеджер',
    },
    {
      email: 'content.local@pro-dessert.test',
      role: Role.CONTENT_MANAGER,
      firstName: 'Ксения',
      lastName: 'Контент',
    },
    {
      email: 'admin.local@pro-dessert.test',
      role: Role.ADMIN,
      firstName: 'Алексей',
      lastName: 'Администратор',
    },
  ];
  for (const staff of staffAccounts) {
    await prisma.user.upsert({
      where: { emailNormalized: staff.email },
      update: {
        email: staff.email,
        passwordHash: staffPasswordHash,
        firstName: staff.firstName,
        lastName: staff.lastName,
        role: staff.role,
        isActive: true,
        emailVerifiedAt: new Date(),
        failedLoginAttempts: 0,
        loginLockedUntil: null,
      },
      create: {
        email: staff.email,
        emailNormalized: staff.email,
        passwordHash: staffPasswordHash,
        firstName: staff.firstName,
        lastName: staff.lastName,
        role: staff.role,
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    });
  }

  const pickupLocation = await prisma.pickupLocation.upsert({
    where: { code: 'orenburg-lipovaya-20' },
    update: {
      name: 'Магазин Pro Dessert',
      addressText: 'Оренбург, улица Липовая, 20',
      active: true,
    },
    create: {
      code: 'orenburg-lipovaya-20',
      name: 'Магазин Pro Dessert',
      addressText: 'Оренбург, улица Липовая, 20',
      timezone: 'Asia/Yekaterinburg',
      active: true,
    },
  });

  await prisma.setting.upsert({
    where: { scope_key: { scope: 'STORE', key: 'defaultReservationHours' } },
    update: { value: 24, version: { increment: 1 } },
    create: { scope: 'STORE', key: 'defaultReservationHours', value: 24 },
  });

  const categories = new Map<string, { id: string; path: string }>();
  for (const [sortOrder, categorySeed] of demoCategories.entries()) {
    const parent = categorySeed.parentSlug ? categories.get(categorySeed.parentSlug) : undefined;
    if (categorySeed.parentSlug && !parent) {
      throw new Error(`catalog_seed_parent_missing:${categorySeed.parentSlug}`);
    }
    const path = parent ? `${parent.path}/${categorySeed.slug}` : `/${categorySeed.slug}`;
    const imageUrl = catalogImage(categorySeed.slug);
    const category = await prisma.category.upsert({
      where: { slug: categorySeed.slug },
      update: {
        parentId: parent?.id ?? null,
        name: categorySeed.name,
        path,
        description: categorySeed.description,
        imageUrl,
        imageAlt: `Раздел каталога «${categorySeed.name}»`,
        seoTitle: `${categorySeed.name} — купить в Pro Dessert`,
        seoDescription: `${categorySeed.description} Самовывоз в Оренбурге с улицы Липовой, 20.`,
        sortOrder,
        active: true,
        hidden: false,
      },
      create: {
        parentId: parent?.id,
        name: categorySeed.name,
        slug: categorySeed.slug,
        path,
        description: categorySeed.description,
        imageUrl,
        imageAlt: `Раздел каталога «${categorySeed.name}»`,
        seoTitle: `${categorySeed.name} — купить в Pro Dessert`,
        seoDescription: `${categorySeed.description} Самовывоз в Оренбурге с улицы Липовой, 20.`,
        sortOrder,
      },
    });
    categories.set(categorySeed.slug, { id: category.id, path: category.path });
    await prisma.categoryNormalizationMapping.upsert({
      where: { oneCGroupId: `1c-${categorySeed.slug}` },
      update: {
        categoryId: category.id,
        sourceName: `Демо-группа 1С: ${categorySeed.name}`,
        sourcePath: category.path,
        active: true,
        lastSeenAt: new Date(),
      },
      create: {
        categoryId: category.id,
        oneCGroupId: `1c-${categorySeed.slug}`,
        sourceName: `Демо-группа 1С: ${categorySeed.name}`,
        sourcePath: category.path,
      },
    });
  }

  const brands = [];
  for (const [index, name] of demoBrands.entries()) {
    const oneCId = uuid(3, index + 1);
    brands.push(
      await prisma.brand.upsert({
        where: { oneCId },
        update: { name, active: true, sortOrder: index },
        create: {
          oneCId,
          name,
          slug: `${slugify(name)}-${index + 1}`,
          description: `Демонстрационная страница профессионального бренда ${name}.`,
          seoTitle: `${name} в каталоге Pro Dessert`,
          seoDescription: `Демонстрационные товары ${name} для кондитеров.`,
          active: true,
          sortOrder: index,
        },
      }),
    );
  }

  const warehouse = await prisma.warehouse.upsert({
    where: { oneCId: uuid(4, 1) },
    update: {
      code: 'ORENBURG-LIPOVAYA',
      name: 'Основной склад магазина на Липовой',
      pickupLocationId: pickupLocation.id,
      active: true,
    },
    create: {
      oneCId: uuid(4, 1),
      code: 'ORENBURG-LIPOVAYA',
      name: 'Основной склад магазина на Липовой',
      pickupLocationId: pickupLocation.id,
      active: true,
    },
  });

  const attributeDefinitions = new Map<string, string>();
  for (const [index, definition] of [
    { code: 'form', name: 'Форма выпуска' },
    { code: 'purpose', name: 'Назначение' },
    { code: 'storage_mode', name: 'Режим хранения' },
    { code: 'packaging', name: 'Фасовка' },
    { code: 'country', name: 'Страна производства' },
    { code: 'weight_volume', name: 'Вес или объём' },
    { code: 'product_type', name: 'Тип продукта' },
    { code: 'taste', name: 'Вкус' },
    { code: 'fat_percentage', name: 'Процент жирности' },
    { code: 'storage_temperature', name: 'Температура хранения' },
    { code: 'cocoa_percent', name: 'Содержание какао' },
    { code: 'flow', name: 'Текучесть шоколада' },
    { code: 'material', name: 'Материал' },
    { code: 'length', name: 'Длина' },
    { code: 'width', name: 'Ширина' },
    { code: 'color', name: 'Цвет' },
    { code: 'package_quantity', name: 'Количество в упаковке' },
    { code: 'diameter', name: 'Диаметр' },
    { code: 'height', name: 'Высота' },
    { code: 'shape', name: 'Форма изделия' },
  ].entries()) {
    const record = await prisma.attributeDefinition.upsert({
      where: { code: definition.code },
      update: {
        name: definition.name,
        dataType: AttributeDataType.ENUM,
        filterable: true,
        active: true,
      },
      create: {
        code: definition.code,
        name: definition.name,
        dataType: AttributeDataType.ENUM,
        filterable: true,
        sortOrder: index,
      },
    });
    attributeDefinitions.set(definition.code, record.id);
  }
  const legacyDimensionsDefinition = await prisma.attributeDefinition.findUnique({
    where: { code: 'dimensions' },
    select: { id: true },
  });

  const productIds: string[] = [];
  for (const [zeroIndex, productSeed] of demoProducts.entries()) {
    const productIndex = zeroIndex + 1;
    const sourceVersion = 'mock-catalog-v1';
    const oneCId = uuid(1, productIndex);
    const categorySlug = normalizedProductCategory(productSeed);
    const category = categories.get(categorySlug);
    const brand = brands[productSeed.brand];
    if (!category || !brand) throw new Error(`catalog_seed_reference_missing:${productSeed.name}`);
    const productSlug = `${slugify(productSeed.name)}-demo-${productIndex}`;
    const isFrozen =
      productSeed.category === 'frozen' || productSeed.name.toLowerCase().includes('заморож');
    const product = await prisma.product.upsert({
      where: { oneCId },
      update: {
        brandId: brand.id,
        baseName: productSeed.name,
        active: true,
        oneCSourceVersion: sourceVersion,
        oneCLastSyncedAt: new Date(),
      },
      create: {
        oneCId,
        brandId: brand.id,
        baseName: productSeed.name,
        slug: productSlug,
        shortDescription: `Демонстрационная карточка: ${productSeed.purpose.toLowerCase()}, фасовка ${productSeed.pack}.`,
        description: `Демонстрационный товар профессионального каталога Pro Dessert. Характеристики и цена созданы для проверки интерфейса и не являются публичной офертой.`,
        composition:
          'Демонстрационный состав. Перед реальным использованием необходимо сверить маркировку и документы производителя.',
        application: productSeed.purpose,
        restrictions:
          'Только для пищевого производства согласно инструкции производителя. Данные демонстрационные.',
        storageDescription: storageFor(productSeed),
        documentLinks: [
          {
            title: 'Декларация соответствия (демо)',
            url: '/documents/demo-declaration',
            kind: 'DECLARATION',
          },
        ],
        seoTitle: `${productSeed.name} — Pro Dessert`,
        seoDescription: `Демонстрационная карточка ${productSeed.name}. Профессиональные товары для кондитеров.`,
        canonicalUrl: `/product/${productSlug}`,
        isHit: productIndex % 5 === 0,
        isNew: productIndex <= 12,
        popularityScore: Math.max(1, 1000 - productIndex * 11),
        sortOrder: productIndex,
        active: true,
        oneCSourceVersion: sourceVersion,
        oneCLastSyncedAt: new Date(),
      },
    });
    productIds.push(product.id);

    await prisma.productCategory.updateMany({
      where: { productId: product.id, isPrimary: true, categoryId: { not: category.id } },
      data: { isPrimary: false },
    });
    await prisma.productCategory.upsert({
      where: { productId_categoryId: { productId: product.id, categoryId: category.id } },
      update: { isPrimary: true, sortOrder: productIndex },
      create: {
        productId: product.id,
        categoryId: category.id,
        isPrimary: true,
        sortOrder: productIndex,
      },
    });
    const saleCategory = categories.get('sale');
    const newCategory = categories.get('new');
    if (productIndex % 7 === 0 && saleCategory) {
      await prisma.productCategory.upsert({
        where: { productId_categoryId: { productId: product.id, categoryId: saleCategory.id } },
        update: { isPrimary: false },
        create: { productId: product.id, categoryId: saleCategory.id, isPrimary: false },
      });
    }
    if (productIndex <= 12 && newCategory) {
      await prisma.productCategory.upsert({
        where: { productId_categoryId: { productId: product.id, categoryId: newCategory.id } },
        update: { isPrimary: false },
        create: { productId: product.id, categoryId: newCategory.id, isPrimary: false },
      });
    }

    const imageUrl = catalogImage(productSeed.category);
    const seededImage = await prisma.productImage.findFirst({
      where: { productId: product.id, publicUrl: imageUrl },
      select: { id: true },
    });
    if (!seededImage) {
      const hasPrimaryImage = await prisma.productImage.findFirst({
        where: { productId: product.id, isPrimary: true, published: true },
        select: { id: true },
      });
      await prisma.productImage.create({
        data: {
          productId: product.id,
          objectKey: imageUrl.replace(/^\//, ''),
          publicUrl: imageUrl,
          alt: `Демонстрационное изображение: ${productSeed.name}`,
          sortOrder: 0,
          isPrimary: hasPrimaryImage === null,
          published: true,
        },
      });
    }

    const isBackorder = productIndex % 13 === 0;
    const isOut = !isBackorder && productIndex % 11 === 0;
    const isLow = !isBackorder && !isOut && productIndex % 9 === 0;
    const available = isBackorder || isOut ? 0 : isLow ? 3 : 10 + (productIndex % 17);
    const hasDiscount = productIndex % 7 === 0;
    await upsertCatalogVariant({
      productId: product.id,
      productIndex,
      variantIndex: 1,
      product: productSeed,
      warehouseId: warehouse.id,
      price: productSeed.price,
      pack: productSeed.pack,
      sourceVersion,
      available,
      allowBackorder: isBackorder,
      oldAmount: hasDiscount ? Math.ceil(productSeed.price * 1.12) : null,
    });
    if (productIndex <= 43 && productIndex % 8 === 0) {
      await upsertCatalogVariant({
        productId: product.id,
        productIndex,
        variantIndex: 2,
        product: productSeed,
        warehouseId: warehouse.id,
        price: Math.ceil(productSeed.price * 1.78),
        pack: 'увеличенная профессиональная фасовка',
        sourceVersion,
        available: Math.max(0, available - 2),
        allowBackorder: isBackorder,
        oldAmount: hasDiscount ? Math.ceil(productSeed.price * 2.02) : null,
      });
    }

    const attributeInputs: SeedAttributeInput[] = [
      { code: 'form', value: productSeed.form },
      { code: 'purpose', value: productSeed.purpose },
      { code: 'storage_mode', value: isFrozen ? 'Замороженный режим −18 °C' : 'Сухое хранение' },
      { code: 'packaging', value: productSeed.pack },
      { code: 'country', value: productSeed.country ?? 'Россия' },
    ];
    const taste = inferredTaste(productSeed);
    if (taste) attributeInputs.push({ code: 'taste', value: taste });
    const fatPercentage = dairyFatPercentage(productSeed);
    if (fatPercentage) {
      attributeInputs.push({ code: 'fat_percentage', value: fatPercentage });
    }
    const ingredientCategories = new Set([
      'gelatin',
      'agar',
      'pectin',
      'starch',
      'thickeners',
      'albumin',
      'powdered-sugar',
      'isomalt',
      'syrups',
      'nut-pastes',
      'fillings',
      'freeze-dried-berries',
      'fondant',
      'baking-mixes',
      'glazes-fillings',
      'nuts-pastes',
      'gelling-thickeners',
      'sugars-syrups',
      'ice-cream',
    ]);
    if (ingredientCategories.has(categorySlug)) {
      attributeInputs.push(
        { code: 'weight_volume', value: productSeed.pack },
        { code: 'product_type', value: productSeed.form },
        { code: 'storage_temperature', value: isFrozen ? '−18 °C' : '+5…+22 °C' },
      );
    }
    if (['chocolate-couverture', 'cocoa-products'].includes(categorySlug)) {
      const cocoaValues = ['54,5%', '70%', '33,6%', '28%', '35%', '47%', '55%', '30%'];
      attributeInputs.push(
        { code: 'cocoa_percent', value: cocoaValues[zeroIndex % cocoaValues.length] ?? '54,5%' },
        { code: 'flow', value: productIndex % 3 === 0 ? 'Высокая' : 'Средняя' },
      );
    }
    if (
      ['packaging', 'bases-capsules', 'storage-transport', 'business-supplies'].includes(
        categorySlug,
      )
    ) {
      attributeInputs.push(...packagingAttributes(productSeed));
      if (legacyDimensionsDefinition) {
        await prisma.productAttributeValue.deleteMany({
          where: { productId: product.id, definitionId: legacyDimensionsDefinition.id },
        });
      }
    }
    if (categorySlug === 'molds') {
      attributeInputs.push(...moldAttributes(productSeed));
    }
    for (const [attributeIndex, attribute] of attributeInputs.entries()) {
      const definitionId = attributeDefinitions.get(attribute.code);
      if (!definitionId) continue;
      const normalizedValue = attribute.value.normalize('NFKC').toLowerCase();
      const value = await prisma.attributeValue.upsert({
        where: { definitionId_normalizedValue: { definitionId, normalizedValue } },
        update: { displayValue: attribute.value, sortOrder: attributeIndex },
        create: {
          definitionId,
          normalizedValue,
          displayValue: attribute.value,
          sortOrder: attributeIndex,
        },
      });
      await assignAttribute(product.id, definitionId, value.id, sourceVersion);
    }
  }

  for (const [index, productId] of productIds.entries()) {
    const targetProductId = productIds[(index + 1) % productIds.length];
    if (!targetProductId || targetProductId === productId) continue;
    await prisma.relatedProduct.upsert({
      where: {
        sourceProductId_targetProductId_relationType: {
          sourceProductId: productId,
          targetProductId,
          relationType: 'RELATED',
        },
      },
      update: { sortOrder: 0 },
      create: {
        sourceProductId: productId,
        targetProductId,
        relationType: 'RELATED',
        sortOrder: 0,
      },
    });
  }

  const allSynonyms = [
    ...demoSynonyms,
    ['шоколадкаллеты', 'шоколад каллеты'],
    ['shokolad', 'шоколад'],
    ['kakao', 'какао'],
    ['pektin', 'пектин'],
    ['konditerskiimeshok', 'кондитерские мешки'],
    ['фисташкавая паста', 'паста фисташковая'],
    ['каллебаут', 'Callebaut'],
    ['креметте', 'Cremette'],
    ['сыр хохланд', 'Hochland'],
    ['коробка бенто', 'упаковка для бенто-тортов'],
    ['пектин nh', 'Pectin NH'],
  ] as const;
  for (const [index, [normalizedTerm, canonicalTerm]] of allSynonyms.entries()) {
    await prisma.searchSynonym.upsert({
      where: {
        normalizedTerm_canonicalTerm_locale: { normalizedTerm, canonicalTerm, locale: 'ru' },
      },
      update: { active: true, weight: Math.max(1, 3 - index / 10) },
      create: {
        normalizedTerm,
        canonicalTerm,
        locale: 'ru',
        weight: Math.max(1, 3 - index / 10),
        active: true,
      },
    });
  }

  const existingPromotion = await prisma.promotion.findFirst({
    where: { title: 'Сезон профессионального шоколада' },
    select: { id: true },
  });
  const promotionData = {
    title: 'Сезон профессионального шоколада',
    body: 'Подборка ингредиентов и инвентаря для шоколатье. Цена остаётся источником 1С.',
    imageUrl: '/images/catalog/chocolate-couverture.webp',
    imageAlt: 'Профессиональный шоколад для кондитеров',
    linkUrl: '/catalog?category=chocolate-couverture',
    active: true,
    priority: 10,
    badgeColor: '#872746',
    textColor: '#FFFFFF',
  };
  const promotion = existingPromotion
    ? await prisma.promotion.update({ where: { id: existingPromotion.id }, data: promotionData })
    : await prisma.promotion.create({ data: promotionData });
  await prisma.promotionProduct.deleteMany({ where: { promotionId: promotion.id } });
  await prisma.promotionProduct.createMany({
    data: productIds.slice(0, 4).map((productId) => ({ promotionId: promotion.id, productId })),
    skipDuplicates: true,
  });

  const existingBanner = await prisma.banner.findFirst({
    where: { title: 'Профессиональный каталог для кондитеров' },
    select: { id: true },
  });
  const bannerData = {
    title: 'Профессиональный каталог для кондитеров',
    body: 'Ингредиенты, упаковка и инвентарь с самовывозом в Оренбурге.',
    imageUrl: '/images/catalog/pro-ingredients.webp',
    imageAlt: 'Ингредиенты для кондитеров',
    linkUrl: '/catalog',
    active: true,
    priority: 10,
  };
  if (existingBanner) await prisma.banner.update({ where: { id: existingBanner.id }, data: bannerData });
  else await prisma.banner.create({ data: bannerData });

  await prisma.contentPage.upsert({
    where: { slug: 'o-pro-dessert' },
    update: {
      title: 'О Pro Dessert',
      body: 'Pro Dessert — профессиональный каталог товаров для кондитеров. Заказы выдаются только самовывозом.',
      seoTitle: 'О Pro Dessert',
      seoDescription: 'Профессиональные товары для кондитеров с самовывозом.',
      published: true,
      publishedAt: new Date(),
    },
    create: {
      slug: 'o-pro-dessert',
      title: 'О Pro Dessert',
      body: 'Pro Dessert — профессиональный каталог товаров для кондитеров. Заказы выдаются только самовывозом.',
      seoTitle: 'О Pro Dessert',
      seoDescription: 'Профессиональные товары для кондитеров с самовывозом.',
      published: true,
      publishedAt: new Date(),
    },
  });
}

seed()
  .catch((error: unknown) => {
    console.error('catalog_seed_failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
