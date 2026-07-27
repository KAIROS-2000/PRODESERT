type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonLdValue[]
  | { readonly [key: string]: JsonLdValue | undefined };

function serializeJsonLd(data: JsonLdValue): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function StructuredData({ data }: { data: JsonLdValue }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}

export function absoluteSiteUrl(pathOrUrl: string): string {
  return new URL(pathOrUrl, process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').toString();
}

export function breadcrumbJsonLd(
  items: readonly { readonly name: string; readonly path: string }[],
): JsonLdValue {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteSiteUrl(item.path),
    })),
  };
}

export function organizationAndLocalBusinessJsonLd(): JsonLdValue {
  const siteUrl = absoluteSiteUrl('/');
  const address = {
    '@type': 'PostalAddress',
    addressCountry: 'RU',
    addressLocality: 'Оренбург',
    streetAddress: 'Липовая улица, 20',
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteUrl}#organization`,
        name: 'Pro Dessert',
        url: siteUrl,
        description: 'Магазин профессиональных товаров для кондитеров в Оренбурге.',
      },
      {
        '@type': 'LocalBusiness',
        '@id': `${siteUrl}#local-business`,
        name: 'Pro Dessert',
        url: siteUrl,
        parentOrganization: { '@id': `${siteUrl}#organization` },
        address,
        areaServed: { '@type': 'City', name: 'Оренбург' },
        description:
          'Ингредиенты, кондитерский инвентарь и упаковка для тортов с самовывозом в Оренбурге.',
      },
    ],
  };
}
