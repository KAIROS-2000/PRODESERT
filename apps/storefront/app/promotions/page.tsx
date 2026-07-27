import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { ContentApiError, getPromotions } from '@/lib/content-api';

export const metadata: Metadata = {
  title: 'Акции и подборки',
  description: 'Актуальные акции и тематические подборки товаров для кондитеров в Pro Dessert.',
  alternates: { canonical: '/promotions' },
};

export const dynamic = 'force-dynamic';

function PromotionLink({ href, children }: Readonly<{ href: string; children: ReactNode }>) {
  const external = /^https?:\/\//i.test(href);
  return external ? (
    <a className="button button--primary" href={href} rel="noreferrer" target="_blank">
      {children}
    </a>
  ) : (
    <Link className="button button--primary" href={href}>
      {children}
    </Link>
  );
}

export default async function PromotionsPage() {
  let promotions: Awaited<ReturnType<typeof getPromotions>> = [];
  let message: string | null = null;
  try {
    promotions = await getPromotions();
  } catch (error) {
    message = error instanceof ContentApiError ? error.message : 'Не удалось загрузить акции.';
  }

  return (
    <section className="shell information-page" aria-labelledby="promotions-title">
      <header className="information-page__header">
        <p className="eyebrow">Подборки Pro Dessert</p>
        <h1 id="promotions-title">Акции и профессиональные подборки</h1>
        <p>
          Условия и доступность товара подтверждаются при оформлении: источник цен и остатков —
          учётная система магазина.
        </p>
      </header>

      {message ? (
        <p className="information-page__notice" role="alert">
          {message}
        </p>
      ) : null}
      {!message && promotions.length === 0 ? (
        <section className="information-page__empty">
          <h2>Сейчас нет активных акций</h2>
          <p>Посмотрите весь профессиональный ассортимент в каталоге.</p>
          <Link className="button button--primary" href="/catalog">
            Перейти в каталог
          </Link>
        </section>
      ) : null}
      <div className="promotion-grid">
        {promotions.map((promotion) => (
          <article className="promotion-card" key={promotion.id}>
            {promotion.imageUrl ? (
              <div className="promotion-card__image">
                <Image
                  alt={promotion.imageAlt ?? promotion.title}
                  fill
                  sizes="(max-width: 760px) 100vw, 50vw"
                  src={promotion.imageUrl}
                  unoptimized={/^https?:\/\//.test(promotion.imageUrl)}
                />
              </div>
            ) : null}
            <div className="promotion-card__body">
              {promotion.discountPercent ? (
                <span
                  className="promotion-card__badge"
                  style={{
                    backgroundColor: promotion.badgeColor ?? undefined,
                    color: promotion.textColor ?? undefined,
                  }}
                >
                  До {promotion.discountPercent}%
                </span>
              ) : null}
              <h2>{promotion.title}</h2>
              {promotion.body ? <p>{promotion.body}</p> : null}
              {promotion.products.length > 0 ? (
                <ul aria-label="Товары в подборке">
                  {promotion.products.slice(0, 4).map((product) => (
                    <li key={product.id}>
                      <Link href={`/product/${product.slug}`}>{product.name}</Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              <PromotionLink href={promotion.linkUrl ?? '/catalog'}>
                Посмотреть подборку
              </PromotionLink>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
