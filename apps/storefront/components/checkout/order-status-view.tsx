'use client';

import { OrderStatus, type PublicOrderView } from '@pro-dessert/contracts';
import {
  AlertTriangle,
  Clock3,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  PackageSearch,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { CheckoutApiError, getCheckoutErrorMessage, getPublicOrder } from '@/lib/checkout-api';
import { captureOrderAccessFromFragment, readOrderAccessToken } from '@/lib/order-session';

import styles from './order-flow.module.css';
import { PaymentPanel } from './payment-panel';

const money = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 2,
});

const dateTime = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'long',
  timeStyle: 'short',
});

const dateOnly = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeZone: 'UTC' });

const statusCopy: Record<OrderStatus, { title: string; description: string }> = {
  DRAFT: { title: 'Черновик', description: 'Оформление заказа ещё не завершено.' },
  CREATED: { title: 'Заказ создан', description: 'Заказ зарегистрирован в системе.' },
  AWAITING_STOCK_CONFIRMATION: {
    title: 'Проверяем наличие',
    description: 'Магазин сверяет фактические остатки перед резервом и оплатой.',
  },
  AWAITING_PAYMENT: {
    title: 'Товары зарезервированы',
    description: 'Наличие подтверждено. Реквизиты для банковского перевода ещё не опубликованы.',
  },
  PAYMENT_VERIFICATION: {
    title: 'Проверяем оплату',
    description: 'Магазин проверяет поступление средств на расчётный счёт.',
  },
  PAID: { title: 'Оплата подтверждена', description: 'Заказ оплачен и будет передан в сборку.' },
  ASSEMBLING: { title: 'Собираем заказ', description: 'Сотрудники магазина готовят позиции.' },
  READY_FOR_PICKUP: {
    title: 'Готов к самовывозу',
    description: 'Заказ можно получить в магазине по указанному адресу.',
  },
  COMPLETED: { title: 'Заказ получен', description: 'Выдача заказа завершена.' },
  CANCELLED_BY_CUSTOMER: {
    title: 'Отменён покупателем',
    description: 'Заказ отменён по запросу покупателя.',
  },
  CANCELLED_BY_STORE: {
    title: 'Отменён магазином',
    description: 'Магазин отменил заказ. Подробности указаны в сообщении по заказу.',
  },
  RESERVATION_EXPIRED: {
    title: 'Срок резерва истёк',
    description:
      'Товары освобождены. Не переводите деньги; для нового резерва свяжитесь с магазином.',
  },
  RETURN_REQUESTED: {
    title: 'Возврат запрошен',
    description: 'Магазин рассматривает запрос на возврат.',
  },
  RETURNED: { title: 'Возврат завершён', description: 'Возврат по заказу завершён.' },
};

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateTime.format(parsed);
}

function formatPickupDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? value : dateOnly.format(parsed);
}

export function OrderStatusView({ publicNumber }: { publicNumber: string }) {
  const [order, setOrder] = useState<PublicOrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessMissing, setAccessMissing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const accessToken =
      captureOrderAccessFromFragment(publicNumber) ?? readOrderAccessToken(publicNumber);

    void getPublicOrder(publicNumber, accessToken)
      .then((result) => {
        if (cancelled) return;
        setOrder(result);
        setError(null);
        setAccessMissing(false);
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setOrder(null);
        setAccessMissing(
          requestError instanceof CheckoutApiError &&
            (requestError.status === 401 ||
              requestError.status === 403 ||
              requestError.status === 404),
        );
        setError(getCheckoutErrorMessage(requestError));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, publicNumber]);

  const retry = () => {
    setIsLoading(true);
    setError(null);
    setAccessMissing(false);
    setAttempt((value) => value + 1);
  };

  if (isLoading) {
    return (
      <div className={`${styles.narrowPage} shell`}>
        <div className={styles.loadingCard} role="status">
          <LoaderCircle className={styles.spin} aria-hidden="true" size={28} />
          <span>Загружаем статус заказа…</span>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className={`${styles.narrowPage} shell`}>
        <section className={styles.emptyCard}>
          {accessMissing ? (
            <LockKeyhole aria-hidden="true" size={42} />
          ) : (
            <PackageSearch aria-hidden="true" size={42} />
          )}
          <h1>
            {accessMissing
              ? 'Заказ не найден или защищённый доступ недействителен'
              : 'Не удалось открыть заказ'}
          </h1>
          <p>
            {accessMissing
              ? 'Проверьте номер заказа. Для гостевого заказа ключ хранится только во вкладке оформления и может истечь; сам номер заказа не открывает персональные данные.'
              : error}
          </p>
          <div className={styles.actions}>
            {!accessMissing ? (
              <button className="button button--primary" type="button" onClick={retry}>
                Повторить
              </button>
            ) : null}
            <Link className="button button--secondary" href="/catalog">
              В каталог
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const copy = statusCopy[order.status];

  return (
    <div className={`${styles.narrowPage} shell`}>
      <article className={styles.statusCard}>
        <header className={styles.statusHeader}>
          <p className={styles.eyebrow}>Статус заказа</p>
          <h1>{order.publicNumber}</h1>
          <div className={styles.statusBadge}>
            <Clock3 aria-hidden="true" size={15} /> {copy.title}
          </div>
          <p className={styles.statusLead}>{copy.description}</p>
        </header>

        <dl className={styles.statusGrid}>
          <div className={styles.statusDatum}>
            <dt>Заказ создан</dt>
            <dd>{formatDateTime(order.createdAt)}</dd>
          </div>
          <div className={styles.statusDatum}>
            <dt>Итого</dt>
            <dd>{money.format(Number(order.totals.grandTotal))}</dd>
          </div>
          <div className={styles.statusDatum}>
            <dt>Получение</dt>
            <dd>Самовывоз</dd>
          </div>
          <div className={styles.statusDatum}>
            <dt>Оплата</dt>
            <dd>Банковский перевод</dd>
          </div>
          {order.desiredPickupAt ? (
            <div className={styles.statusDatum}>
              <dt>Желаемая дата</dt>
              <dd>{formatPickupDate(order.desiredPickupAt)}</dd>
            </div>
          ) : null}
          {order.reservationExpiresAt && order.status === OrderStatus.AWAITING_PAYMENT ? (
            <div className={styles.statusDatum}>
              <dt>Резерв действует до</dt>
              <dd>{formatDateTime(order.reservationExpiresAt)}</dd>
            </div>
          ) : null}
        </dl>

        <div className={styles.infoBox}>
          <MapPin aria-hidden="true" size={20} />
          <span>
            {order.pickup.name}, {order.pickup.addressText}. Приезжайте только после статуса «Готов
            к самовывозу».
          </span>
        </div>

        {order.status === OrderStatus.AWAITING_STOCK_CONFIRMATION ? (
          <div className={styles.warningBox}>
            <AlertTriangle aria-hidden="true" size={20} />
            <span>
              Реквизиты для банковского перевода будут доступны только после подтверждения наличия и
              резерва товаров.
            </span>
          </div>
        ) : null}

        {order.status === OrderStatus.RESERVATION_EXPIRED ? (
          <div className={styles.warningBox}>
            <AlertTriangle aria-hidden="true" size={20} />
            <span>
              Срок резерва истёк, товары снова доступны для продажи. Перевод по этому заказу
              выполнять нельзя.
            </span>
          </div>
        ) : null}

        {order.status === OrderStatus.AWAITING_PAYMENT ||
        order.status === OrderStatus.PAYMENT_VERIFICATION ? (
          <PaymentPanel
            key={order.publicNumber}
            publicNumber={order.publicNumber}
            onOrderChanged={retry}
          />
        ) : null}

        <section className={styles.statusDetails} aria-labelledby="order-items-title">
          <h2 id="order-items-title">Состав заказа</h2>
          <dl>
            {order.items.map((item) => (
              <div key={item.sku}>
                <dt>
                  {item.productName} · {item.offerName} × {item.quantity} {item.unit}
                </dt>
                <dd>{money.format(Number(item.lineTotal))}</dd>
              </div>
            ))}
            {Number(order.totals.discount) > 0 ? (
              <div>
                <dt>Скидка</dt>
                <dd>−{money.format(Number(order.totals.discount))}</dd>
              </div>
            ) : null}
            <div>
              <dt>Итого</dt>
              <dd>{money.format(Number(order.totals.grandTotal))}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.statusDetails} aria-labelledby="order-history-title">
          <h2 id="order-history-title">История статуса</h2>
          <ol className={styles.nextSteps}>
            {order.history.map((entry, index) => (
              <li key={`${entry.status}-${entry.createdAt}`}>
                <span className={styles.stepNumber}>{index + 1}</span>
                <div>
                  <strong>{statusCopy[entry.status].title}</strong>
                  <span>{formatDateTime(entry.createdAt)}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className={styles.actions}>
          <button className="button button--primary" type="button" onClick={retry}>
            Обновить статус
          </button>
          <Link className="button button--secondary" href="/pickup">
            Правила самовывоза
          </Link>
        </div>
      </article>
    </div>
  );
}
