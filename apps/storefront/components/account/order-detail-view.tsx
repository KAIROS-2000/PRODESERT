'use client';

import { PaymentStatus, type AccountOrderDetail } from '@pro-dessert/contracts';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { getAccountOrder } from '@/lib/account-api';

import { accountDate, accountMoney, accountStatusLabel } from './account-format';
import { AccountError, AccountLoading } from './account-state';
import styles from './account.module.css';

const paymentLabels: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]: 'Ожидает перевода',
  [PaymentStatus.PROOF_UPLOADED]: 'Подтверждение загружено',
  [PaymentStatus.VERIFYING]: 'Проверяем поступление',
  [PaymentStatus.CONFIRMED]: 'Оплата подтверждена',
  [PaymentStatus.REJECTED]: 'Подтверждение отклонено',
  [PaymentStatus.REFUNDED]: 'Возврат выполнен',
};

export function AccountOrderDetailView({ publicNumber }: { publicNumber: string }) {
  const [order, setOrder] = useState<AccountOrderDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getAccountOrder(publicNumber)
      .then((result) => {
        if (!cancelled) {
          setOrder(result);
          setError(null);
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(requestError);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, publicNumber]);

  if (error) {
    return (
      <AccountError
        error={error}
        onRetry={() => {
          setOrder(null);
          setError(null);
          setAttempt((value) => value + 1);
        }}
      />
    );
  }
  if (!order) return <AccountLoading label="Открываем заказ…" />;

  return (
    <article className={styles.stack}>
      <header className={styles.sectionHeader}>
        <div>
          <Link href="/account/orders">
            <ArrowLeft aria-hidden="true" size={16} /> К истории
          </Link>
          <h1>{order.publicNumber}</h1>
          <p>
            {accountDate(order.createdAt)} ·{' '}
            <span className={styles.badge}>{accountStatusLabel(order.status)}</span>
          </p>
        </div>
        {order.canRepeat ? (
          <Link
            className="button button--primary"
            href={`/account/orders/${order.publicNumber}/repeat`}
          >
            <RotateCcw aria-hidden="true" size={17} /> Повторить заказ
          </Link>
        ) : null}
      </header>

      <section className={styles.card} aria-labelledby="account-order-summary">
        <h2 id="account-order-summary">Получение и оплата</h2>
        <dl className={styles.definitionList}>
          <div>
            <dt>Получение</dt>
            <dd>Самовывоз</dd>
          </div>
          <div>
            <dt>Пункт выдачи</dt>
            <dd>{order.pickup.name}</dd>
          </div>
          <div>
            <dt>Адрес</dt>
            <dd>{order.pickup.addressText}</dd>
          </div>
          <div>
            <dt>Способ оплаты</dt>
            <dd>Банковский перевод</dd>
          </div>
          <div>
            <dt>Статус оплаты</dt>
            <dd>{order.paymentStatus ? paymentLabels[order.paymentStatus] : 'Ещё не создана'}</dd>
          </div>
          <div>
            <dt>Резерв</dt>
            <dd>
              {order.reservationExpiresAt
                ? `до ${accountDate(order.reservationExpiresAt)}`
                : 'Срок ещё не назначен'}
            </dd>
          </div>
        </dl>
      </section>

      {order.organization ? (
        <section className={styles.card} aria-labelledby="account-order-organization">
          <h2 id="account-order-organization">Организация в заказе</h2>
          <p>
            <strong>{order.organization.name}</strong>
            <br />
            ИНН {order.organization.inn}
            {order.organization.kpp ? ` · КПП ${order.organization.kpp}` : ''}
          </p>
        </section>
      ) : null}

      <section className={styles.card} aria-labelledby="account-order-items">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="account-order-items">Состав заказа</h2>
            <p>{order.items.length} позиций</p>
          </div>
        </div>
        <ul className={styles.list}>
          {order.items.map((item) => (
            <li className={styles.listItem} key={item.id}>
              <div>
                <h3>{item.productName}</h3>
                <p>
                  {item.offerName} · {item.quantity} {item.unit} × {accountMoney(item.unitPrice)}
                </p>
              </div>
              <strong>{accountMoney(item.lineTotal)}</strong>
            </li>
          ))}
        </ul>
        <dl className={styles.definitionList}>
          <div>
            <dt>Товары</dt>
            <dd>{accountMoney(order.totals.products)}</dd>
          </div>
          <div>
            <dt>Скидка</dt>
            <dd>{accountMoney(order.totals.discount)}</dd>
          </div>
          <div>
            <dt>Итого</dt>
            <dd>{accountMoney(order.totals.grandTotal)}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.card} aria-labelledby="account-order-history">
        <h2 id="account-order-history">История статуса</h2>
        <ol className={styles.list}>
          {order.history.map((event, index) => (
            <li className={styles.listItem} key={`${event.status}-${event.createdAt}-${index}`}>
              <div>
                <h3>{accountStatusLabel(event.status)}</h3>
                <p>{accountDate(event.createdAt)}</p>
              </div>
              <span className={styles.badge}>{index + 1}</span>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
