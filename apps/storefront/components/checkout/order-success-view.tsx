'use client';

import { CheckCircle2, Clock3, Info, MapPin, PackageSearch, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';

import {
  parseCreatedOrderSnapshot,
  readLastCreatedOrderSnapshot,
  type StoredOrderSummary,
} from '@/lib/order-session';

import styles from './order-flow.module.css';

const money = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 2,
});

const serverPendingSnapshot = '__PRO_DESSERT_SERVER_PENDING__';

function subscribeToSessionOrder(): () => void {
  return () => undefined;
}

export function OrderSuccessView() {
  const snapshot = useSyncExternalStore(
    subscribeToSessionOrder,
    readLastCreatedOrderSnapshot,
    () => serverPendingSnapshot,
  );

  if (snapshot === serverPendingSnapshot) {
    return (
      <div className={`${styles.narrowPage} shell`}>
        <div className={styles.loadingCard} role="status">
          Проверяем данные заказа…
        </div>
      </div>
    );
  }

  const order: StoredOrderSummary | null = parseCreatedOrderSnapshot(snapshot);

  if (order === null) {
    return (
      <div className={`${styles.narrowPage} shell`}>
        <section className={styles.emptyCard}>
          <PackageSearch aria-hidden="true" size={42} />
          <h1>Подтверждение не найдено в этой вкладке</h1>
          <p>
            Если заказ уже создан, откройте ссылку на его статус из той же вкладки или используйте
            номер из сообщения магазина. Повторно оформлять заказ сразу не нужно.
          </p>
          <div className={styles.actions}>
            <Link className="button button--primary" href="/catalog">
              Вернуться в каталог
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`${styles.narrowPage} shell`}>
      <article className={styles.successCard}>
        <div className={styles.successIcon}>
          <CheckCircle2 aria-hidden="true" size={34} />
        </div>
        <p className={styles.eyebrow}>Заказ принят</p>
        <h1>Спасибо! Начинаем проверку наличия</h1>
        <div className={styles.orderNumber}>
          <span>Номер заказа</span>
          <strong>{order.publicNumber}</strong>
        </div>
        <div className={styles.statusBadge}>
          <Clock3 aria-hidden="true" size={15} /> AWAITING_STOCK_CONFIRMATION
        </div>
        <p className={styles.successLead}>
          Магазин проверит фактические остатки и подтвердит резерв. Сейчас заказ ещё не готов к
          получению.
        </p>

        <ol className={styles.nextSteps}>
          <li>
            <span className={styles.stepNumber}>1</span>
            <div>
              <strong>Проверим наличие</strong>
              <span>Сверим позиции с фактическими остатками магазина.</span>
            </div>
          </li>
          <li>
            <span className={styles.stepNumber}>2</span>
            <div>
              <strong>Зарезервируем товары</strong>
              <span>После подтверждения наличия заказ перейдёт к оплате.</span>
            </div>
          </li>
          <li>
            <span className={styles.stepNumber}>3</span>
            <div>
              <strong>Отправим реквизиты</strong>
              <span>
                Реквизиты для банковского перевода появятся только после проверки и резерва.
              </span>
            </div>
          </li>
        </ol>

        <div className={styles.statusGrid}>
          <dl className={styles.statusDatum}>
            <dt>Сумма заказа</dt>
            <dd>{money.format(Number(order.grandTotal))}</dd>
          </dl>
          <dl className={styles.statusDatum}>
            <dt>Получение</dt>
            <dd>Самовывоз</dd>
          </dl>
        </div>

        <div className={styles.infoBox}>
          <MapPin aria-hidden="true" size={20} />
          <span>
            {order.pickup.name}, {order.pickup.addressText}. Забирайте заказ только после
            уведомления «Заказ готов к самовывозу».
          </span>
        </div>
        <div className={styles.warningBox}>
          <Info aria-hidden="true" size={20} />
          <span>
            Для гостевого заказа защищённый доступ к статусу хранится только в этой вкладке
            браузера. Сохраните номер заказа.
          </span>
        </div>
        {order.guest ? (
          <div className={styles.infoBox}>
            <UserPlus aria-hidden="true" size={20} />
            <span>
              Создайте профиль с тем же email после оформления. После подтверждения адреса этот
              заказ появится в личном кабинете.
            </span>
          </div>
        ) : null}

        <div className={styles.actions}>
          <Link
            className="button button--primary"
            href={`/order/${encodeURIComponent(order.publicNumber)}`}
          >
            Проверить статус
          </Link>
          <Link className="button button--secondary" href="/pickup">
            Правила самовывоза
          </Link>
          {order.guest ? (
            <Link className="button button--secondary" href="/register?from=order">
              Создать профиль
            </Link>
          ) : null}
        </div>
      </article>
    </div>
  );
}
