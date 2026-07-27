'use client';

import type { AccountOrdersOverview } from '@pro-dessert/contracts';
import { ShoppingBasket } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { getAccountOverview } from '@/lib/account-api';

import { AccountError, AccountLoading } from './account-state';
import styles from './account.module.css';
import { OrderSummaryCard } from './order-summary-card';

export function AccountOverviewView() {
  const [overview, setOverview] = useState<AccountOrdersOverview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getAccountOverview()
      .then((result) => {
        if (!cancelled) {
          setOverview(result);
          setError(null);
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(requestError);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (error) {
    return (
      <AccountError
        error={error}
        onRetry={() => {
          setOverview(null);
          setError(null);
          setAttempt((value) => value + 1);
        }}
      />
    );
  }
  if (!overview) return <AccountLoading label="Собираем обзор заказов…" />;

  return (
    <div className={styles.stack}>
      <header className={styles.sectionHeader}>
        <div>
          <h2>Обзор</h2>
          <p>Самое важное по вашим заказам и повторным покупкам.</p>
        </div>
        <Link className="button button--secondary" href="/account/orders">
          Все заказы
        </Link>
      </header>

      {overview.activeOrder || overview.lastOrder ? (
        <div className={styles.grid}>
          {overview.activeOrder ? (
            <OrderSummaryCard order={overview.activeOrder} title="Активный заказ" />
          ) : null}
          {overview.lastOrder &&
          overview.lastOrder.publicNumber !== overview.activeOrder?.publicNumber ? (
            <OrderSummaryCard order={overview.lastOrder} title="Последний заказ" />
          ) : null}
        </div>
      ) : (
        <section className={`${styles.card} ${styles.empty}`}>
          <ShoppingBasket aria-hidden="true" size={34} />
          <h2>Заказов пока нет</h2>
          <p>Добавьте товары в корзину и оформите самовывоз.</p>
          <Link className="button button--primary" href="/catalog">
            Открыть каталог
          </Link>
        </section>
      )}

      <section className={styles.card} aria-labelledby="frequent-title">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="frequent-title">Частые покупки</h2>
            <p>Товары, которые встречаются в ваших заказах чаще остальных.</p>
          </div>
        </div>
        {overview.frequentItems.length > 0 ? (
          <ul className={styles.list}>
            {overview.frequentItems.map((item) => (
              <li className={styles.listItem} key={`${item.sku}-${item.variantId ?? 'snapshot'}`}>
                <div>
                  <h3>{item.productName}</h3>
                  <p>
                    {item.offerName} · {item.orderCount} заказ(а) · {item.totalQuantity} {item.unit}
                  </p>
                </div>
                {item.productSlug ? (
                  <Link className="button button--secondary" href={`/product/${item.productSlug}`}>
                    Посмотреть
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>Частые позиции появятся после нескольких заказов.</p>
        )}
      </section>
    </div>
  );
}
