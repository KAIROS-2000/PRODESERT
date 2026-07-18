'use client';

import type { CartItemView, CatalogProductSummary } from '@pro-dessert/contracts';
import { AlertCircle, ArrowRight, RefreshCw, ShoppingBasket, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { ProductImage } from '@/components/catalog/product-image';
import { ProductCard } from '@/components/catalog/product-card';
import type { ProductSummary } from '@/lib/catalog-types';

import { useCart } from './cart-provider';
import { QuantityControl } from './quantity-control';

const money = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 2,
});

const availabilityLabels: Record<CartItemView['availability'], string> = {
  IN_STOCK: 'В наличии',
  LOW_STOCK: 'Осталось мало',
  BACKORDER: 'Доступно под заказ',
  OUT_OF_STOCK: 'Временно отсутствует',
};

function formatMoney(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? money.format(parsed) : value;
}

function discountPercent(item: CartItemView): number | null {
  const current = Number(item.unitPrice);
  const old = Number(item.oldUnitPrice);
  if (!Number.isFinite(current) || !Number.isFinite(old) || old <= current || old <= 0) return null;
  return Math.round(((old - current) / old) * 100);
}

function normalizeRecommendation(product: CatalogProductSummary): ProductSummary {
  const price = product.price ? Number(product.price.amount) : null;
  const oldPrice = product.price?.oldAmount ? Number(product.price.oldAmount) : null;
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    sku: product.sku,
    brand: product.brand,
    primaryImage: product.image,
    packagingLabel:
      product.packDescription ??
      (product.variantCount > 1 ? `${product.variantCount} варианта` : null),
    unit: product.unit,
    price: Number.isFinite(price) ? price : null,
    oldPrice: Number.isFinite(oldPrice) ? oldPrice : null,
    discountPercent: product.discountPercent,
    availability: product.availability,
    isNew: product.isNew,
    isHit: product.isHit,
    isSale: product.isSale,
    variantCount: product.variantCount,
    defaultVariant: product.defaultVariant ? { ...product.defaultVariant } : null,
  };
}

function CartLoading() {
  return (
    <div className="cart-loading" aria-label="Загружаем корзину" aria-busy="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export function CartPage() {
  const {
    cart,
    isLoading,
    isMutating,
    error,
    refresh,
    validate,
    updateItem,
    removeItem,
    clearCart,
  } = useCart();
  const [actionError, setActionError] = useState<string | null>(null);
  const visibleError = actionError ?? error;

  const update = async (item: CartItemView, quantity: string) => {
    setActionError(null);
    try {
      await updateItem(item.id, quantity);
    } catch (requestError) {
      setActionError(
        requestError instanceof Error ? requestError.message : 'Не удалось изменить количество.',
      );
      throw requestError;
    }
  };

  const remove = async (item: CartItemView) => {
    setActionError(null);
    try {
      await removeItem(item.id);
    } catch (requestError) {
      setActionError(
        requestError instanceof Error ? requestError.message : 'Не удалось удалить товар.',
      );
    }
  };

  const clear = async () => {
    if (!window.confirm('Очистить корзину? Это действие удалит все выбранные товары.')) return;
    setActionError(null);
    try {
      await clearCart();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error ? requestError.message : 'Не удалось очистить корзину.',
      );
    }
  };

  if (isLoading && !cart) {
    return (
      <section className="shell cart-page">
        <div className="cart-page__heading">
          <span className="eyebrow">Ваш выбор</span>
          <h1>Корзина</h1>
        </div>
        <CartLoading />
      </section>
    );
  }

  if (error && !cart) {
    return (
      <section className="shell cart-page">
        <div className="cart-state cart-state--error">
          <AlertCircle aria-hidden="true" size={34} />
          <h1>Не удалось открыть корзину</h1>
          <p>{error}</p>
          <button className="button button--primary" type="button" onClick={() => void refresh()}>
            <RefreshCw aria-hidden="true" size={18} />
            Повторить
          </button>
        </div>
      </section>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <section className="shell cart-page">
        <div className="cart-state">
          <ShoppingBasket aria-hidden="true" size={39} />
          <span className="eyebrow">Пока пусто</span>
          <h1>Добавьте товары для будущего заказа</h1>
          <p>В каталоге собраны профессиональные ингредиенты, инвентарь и упаковка.</p>
          <Link className="button button--primary" href="/catalog">
            Перейти в каталог
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="shell cart-page" aria-busy={isMutating}>
      <div className="cart-page__heading">
        <div>
          <span className="eyebrow">Ваш выбор</span>
          <h1>Корзина</h1>
          <p>
            {cart.itemCount.toLocaleString('ru-RU')} поз. · итог пересчитывается после каждого
            изменения
          </p>
        </div>
        <button className="cart-clear" type="button" disabled={isMutating} onClick={clear}>
          <Trash2 aria-hidden="true" size={17} />
          Очистить
        </button>
      </div>

      {cart.notices.length > 0 ? (
        <div className="cart-notices" aria-live="polite">
          {cart.notices.map((notice, index) => (
            <div key={`${notice.code}-${notice.itemId ?? index}`}>
              <AlertCircle aria-hidden="true" size={18} />
              <span>{notice.message}</span>
            </div>
          ))}
        </div>
      ) : null}

      {visibleError ? (
        <div className="cart-action-error" role="alert">
          <AlertCircle aria-hidden="true" size={18} />
          <span>{visibleError}</span>
          <button
            type="button"
            onClick={() => {
              setActionError(null);
              void refresh();
            }}
          >
            Обновить
          </button>
        </div>
      ) : null}

      <div className="cart-layout">
        <div className="cart-items" aria-label="Товары в корзине">
          {cart.items.map((item) => {
            const discount = discountPercent(item);
            const blocked =
              !item.active || item.issues.some((issue) => issue.severity === 'BLOCKING');
            return (
              <article className={`cart-item${blocked ? ' cart-item--blocked' : ''}`} key={item.id}>
                <Link className="cart-item__media" href={`/product/${item.productSlug}`}>
                  <ProductImage image={item.image} productName={item.productName} />
                  {discount ? <span className="cart-item__discount">−{discount}%</span> : null}
                </Link>

                <div className="cart-item__description">
                  {item.brand ? <span className="cart-item__brand">{item.brand}</span> : null}
                  <h2>
                    <Link href={`/product/${item.productSlug}`}>{item.productName}</Link>
                  </h2>
                  <dl>
                    <div>
                      <dt>Артикул</dt>
                      <dd>{item.sku}</dd>
                    </div>
                    {item.packDescription ? (
                      <div>
                        <dt>Фасовка</dt>
                        <dd>{item.packDescription}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <span className={`stock stock--${item.availability.toLowerCase()}`}>
                    <span aria-hidden="true" /> {availabilityLabels[item.availability]}
                  </span>
                  {item.issues.length > 0 ? (
                    <div className="cart-item__issues">
                      {item.issues.map((issue) => (
                        <p
                          className={`cart-item__issue cart-item__issue--${issue.severity.toLowerCase()}`}
                          key={issue.code}
                        >
                          {issue.message}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="cart-item__price">
                  <strong>{formatMoney(item.unitPrice)}</strong>
                  {item.oldUnitPrice ? <del>{formatMoney(item.oldUnitPrice)}</del> : null}
                  <small>за {item.unit}</small>
                </div>

                <div className="cart-item__actions">
                  <QuantityControl
                    value={item.quantity}
                    minimum={item.minOrderQuantity}
                    multiple={item.salesMultiple}
                    disabled={isMutating || !item.active}
                    label={item.productName}
                    onChange={(quantity) => update(item, quantity)}
                  />
                  <button
                    className="cart-item__remove"
                    type="button"
                    disabled={isMutating}
                    aria-label={`Удалить ${item.productName}`}
                    onClick={() => void remove(item)}
                  >
                    <Trash2 aria-hidden="true" size={17} />
                    <span>Удалить</span>
                  </button>
                </div>

                <div className="cart-item__total">
                  <span>Сумма</span>
                  <strong>{formatMoney(item.lineTotal)}</strong>
                  {Number(item.lineDiscount) > 0 ? (
                    <small>скидка {formatMoney(item.lineDiscount)}</small>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        <aside className="cart-summary" aria-label="Итоги корзины">
          <h2>Итог</h2>
          <dl>
            <div>
              <dt>Товары</dt>
              <dd>{formatMoney(cart.totals.products)}</dd>
            </div>
            <div className="cart-summary__discount">
              <dt>Скидка</dt>
              <dd>
                {Number(cart.totals.discount) > 0
                  ? `−${formatMoney(cart.totals.discount)}`
                  : formatMoney('0')}
              </dd>
            </div>
            <div className="cart-summary__grand-total">
              <dt>Итого к оплате</dt>
              <dd>{formatMoney(cart.totals.grandTotal)}</dd>
            </div>
          </dl>

          {cart.canCheckout ? (
            <Link className="button button--primary button--wide" href="/checkout">
              Перейти к оформлению
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
          ) : (
            <button className="button button--primary button--wide" type="button" disabled>
              Проверьте позиции
            </button>
          )}
          <p>Оформление доступно без регистрации. Получение — в магазине на Липовой, 20.</p>
          {!cart.canCheckout ? (
            <button
              className="button button--secondary button--wide"
              type="button"
              disabled={isMutating}
              onClick={() => {
                setActionError(null);
                void validate().catch((requestError: unknown) => {
                  setActionError(
                    requestError instanceof Error
                      ? requestError.message
                      : 'Не удалось проверить корзину.',
                  );
                });
              }}
            >
              <RefreshCw aria-hidden="true" size={17} />
              Проверить снова
            </button>
          ) : null}
        </aside>
      </div>

      {cart.recommendations.length > 0 ? (
        <section className="cart-recommendations" aria-labelledby="cart-recommendations-title">
          <div className="catalog-section-heading">
            <div>
              <span className="eyebrow">Дополните заказ</span>
              <h2 id="cart-recommendations-title">С этим заказом выбирают</h2>
            </div>
          </div>
          <div className="product-grid product-grid--related">
            {cart.recommendations.slice(0, 4).map((recommendation) => (
              <ProductCard
                key={recommendation.id}
                product={normalizeRecommendation(recommendation)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
