import type { AccountOrderSummary } from '@pro-dessert/contracts';
import { RotateCcw } from 'lucide-react';
import Link from 'next/link';

import { accountDate, accountStatusLabel, orderSummaryText } from './account-format';
import styles from './account.module.css';

export function OrderSummaryCard({ order, title }: { order: AccountOrderSummary; title?: string }) {
  return (
    <article className={styles.metric}>
      <span>{title ?? accountDate(order.createdAt)}</span>
      <strong>{order.publicNumber}</strong>
      <span className={styles.badge}>{accountStatusLabel(order.status)}</span>
      <span>{orderSummaryText(order)}</span>
      <div className={styles.inlineActions}>
        <Link href={`/account/orders/${order.publicNumber}`}>Открыть</Link>
        {order.canRepeat ? (
          <Link href={`/account/orders/${order.publicNumber}/repeat`}>
            <RotateCcw aria-hidden="true" size={15} /> Повторить
          </Link>
        ) : null}
      </div>
    </article>
  );
}
