import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { ProductCard } from '@/components/catalog/product-card';
import { ProductInteractiveContent } from '@/components/catalog/product-interactive-content';
import { absoluteSiteUrl, breadcrumbJsonLd, StructuredData } from '@/components/structured-data';
import { CatalogApiError, getProduct } from '@/lib/catalog-api';
import type { Availability } from '@/lib/catalog-types';

export const dynamic = 'force-dynamic';

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

const schemaAvailability: Record<Availability, string> = {
  IN_STOCK: 'https://schema.org/InStock',
  LOW_STOCK: 'https://schema.org/LimitedAvailability',
  BACKORDER: 'https://schema.org/BackOrder',
  OUT_OF_STOCK: 'https://schema.org/OutOfStock',
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const product = await getProduct(slug);
    const image = product.images[0] ?? product.primaryImage;
    return {
      title: product.seoTitle ?? product.name,
      description:
        product.seoDescription ??
        product.shortDescription ??
        product.description?.slice(0, 155) ??
        `${product.name} — профессиональный товар для кондитеров в Pro Dessert.`,
      alternates: { canonical: product.canonicalUrl ?? `/product/${product.slug}` },
      openGraph: image ? { images: [{ url: image.url, alt: image.alt }] } : undefined,
    };
  } catch {
    return { title: 'Товар не найден', robots: { index: false, follow: true } };
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  let product;
  try {
    product = await getProduct(slug);
  } catch (error) {
    if (error instanceof CatalogApiError && error.status === 404) notFound();
    throw error;
  }
  const images =
    product.images.length > 0 ? product.images : product.primaryImage ? [product.primaryImage] : [];
  const productUrl = product.canonicalUrl ?? `/product/${product.slug}`;
  const offers = product.variants.flatMap((variant) =>
    variant.price === null
      ? []
      : [
          {
            '@type': 'Offer',
            sku: variant.sku,
            price: variant.price.toFixed(2),
            priceCurrency: 'RUB',
            availability: schemaAvailability[variant.availability],
            url: absoluteSiteUrl(productUrl),
          },
        ],
  );
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description ?? product.shortDescription ?? undefined,
    sku: product.variants[0]?.sku ?? product.sku ?? undefined,
    image: images.map((image) => absoluteSiteUrl(image.url)),
    brand: product.brand ? { '@type': 'Brand', name: product.brand.name } : undefined,
    offers: offers.length > 0 ? offers : undefined,
  };
  const breadcrumbItems = [
    { name: 'Главная', path: '/' },
    { name: 'Каталог', path: '/catalog' },
    ...product.breadcrumbs.map((item) => ({
      name: item.name,
      path: `/catalog${item.path?.startsWith('/') ? '' : '/'}${item.path ?? item.slug}`,
    })),
    { name: product.name, path: productUrl },
  ];

  return (
    <div className="product-page">
      <StructuredData data={productJsonLd} />
      <StructuredData data={breadcrumbJsonLd(breadcrumbItems)} />
      <div className="shell">
        <Breadcrumbs items={product.breadcrumbs} current={product.name} />
        <ProductInteractiveContent images={images} product={product} />

        {product.relatedProducts.length > 0 ? (
          <section className="related-products" aria-labelledby="related-products-title">
            <div className="catalog-section-heading">
              <div>
                <span className="eyebrow">Дополните набор</span>
                <h2 id="related-products-title">С этим товаром выбирают</h2>
              </div>
            </div>
            <div className="product-grid product-grid--related">
              {product.relatedProducts.slice(0, 4).map((related) => (
                <ProductCard key={related.id} product={related} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
