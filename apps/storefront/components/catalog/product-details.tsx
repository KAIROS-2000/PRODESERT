import {
  AlertTriangle,
  BookOpen,
  Factory,
  FileCheck2,
  FlaskConical,
  Globe2,
  PackageCheck,
  Snowflake,
} from 'lucide-react';

import type { ProductDetail, ProductVariant } from '@/lib/catalog-types';

export function ProductDetails({
  product,
  selectedVariant,
}: {
  product: ProductDetail;
  selectedVariant: ProductVariant | undefined;
}) {
  const availableInfo = [
    {
      key: 'storage-description',
      label: 'Рекомендации по хранению',
      value: product.storageDescription,
      icon: Snowflake,
    },
    {
      key: 'variant-storage',
      label: 'Условия хранения фасовки',
      value:
        selectedVariant?.storageConditions === product.storageDescription
          ? null
          : selectedVariant?.storageConditions,
      icon: Snowflake,
    },
    { key: 'country', label: 'Страна', value: selectedVariant?.country, icon: Globe2 },
    {
      key: 'manufacturer',
      label: 'Производитель',
      value: selectedVariant?.manufacturer,
      icon: Factory,
    },
    { key: 'usage', label: 'Применение', value: product.usage, icon: BookOpen },
    { key: 'composition', label: 'Состав', value: product.composition, icon: FlaskConical },
    {
      key: 'restrictions',
      label: 'Ограничения',
      value: product.restrictions,
      icon: AlertTriangle,
    },
  ].filter((item): item is typeof item & { value: string } => Boolean(item.value));

  return (
    <div className="product-information">
      {product.description ? (
        <section className="product-description" aria-labelledby="product-description-title">
          <span className="icon-tile">
            <PackageCheck aria-hidden="true" size={23} />
          </span>
          <div>
            <h2 id="product-description-title">О товаре</h2>
            <p>{product.description}</p>
          </div>
        </section>
      ) : null}

      {availableInfo.length > 0 ? (
        <section aria-labelledby="product-info-title">
          <h2 id="product-info-title">Важная информация</h2>
          <dl className="product-info-grid">
            {availableInfo.map(({ key, label, value, icon: Icon }) => (
              <div key={key}>
                <dt>
                  <Icon aria-hidden="true" size={18} /> {label}
                </dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {product.specifications.length > 0 ? (
        <section aria-labelledby="product-specifications-title">
          <h2 id="product-specifications-title">Характеристики</h2>
          <dl className="specification-list">
            {product.specifications.map((specification) => (
              <div key={`${specification.group ?? ''}-${specification.name}`}>
                <dt>{specification.name}</dt>
                <dd>{specification.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {product.documents.length > 0 ? (
        <section aria-labelledby="product-documents-title">
          <h2 id="product-documents-title">Документы</h2>
          <ul className="product-documents">
            {product.documents.map((document) => (
              <li key={`${document.kind}-${document.url}`}>
                <a href={document.url}>
                  <FileCheck2 aria-hidden="true" size={19} />
                  <span>{document.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
