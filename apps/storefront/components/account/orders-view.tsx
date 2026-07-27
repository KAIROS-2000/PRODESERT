'use client';

import type { AccountOrdersPage } from '@pro-dessert/contracts';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { getAccountOrders } from '@/lib/account-api';

import { accountDate, accountMoney, accountStatusLabel } from './account-format';
import { AccountError, AccountLoading } from './account-state';
import styles from './account.module.css';

export function AccountOrdersView() {
  const [result, setResult] = useState<AccountOrdersPage | null>(null);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    void getAccountOrders(page, 15)
      .then((orders) => {
        if (!cancelled) {
          setResult(orders);
          setError(null);
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(requestError);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, page]);

  const changePage = (nextPage: number) => {
    setResult(null);
    setError(null);
    setPage(nextPage);
  };

  if (error) {
    return (
      <AccountError
        error={error}
        onRetry={() => {
          setResult(null);
          setError(null);
          setAttempt((value) => value + 1);
        }}
      />
    );
  }
  if (!result) return <AccountLoading label="Загружаем историю заказов…" />;

  return (
    <section className={styles.stack} aria-labelledby="account-orders-title">
      <header className={styles.sectionHeader}>
        <div>
          <h1 id="account-orders-title">История заказов</h1>
          <p>{result.total > 0 ? `Всего заказов: ${result.total}` : 'Заказов пока нет.'}</p>
        </div>
      </header>

      {result.items.length > 0 ? (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Заказ</th>
                  <th scope="col">Дата</th>
                  <th scope="col">Статус</th>
                  <th scope="col">Позиций</th>
                  <th scope="col">Получение</th>
                  <th scope="col">Сумма</th>
                  <th scope="col">
                    <span className="sr-only">Действия</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((order) => (
                  <tr key={order.publicNumber}>
                    <td>
                      <strong>{order.publicNumber}</strong>
                    </td>
                    <td>{accountDate(order.createdAt)}</td>
                    <td>
                      <span className={styles.badge}>{accountStatusLabel(order.status)}</span>
                    </td>
                    <td>{order.itemCount}</td>
                    <td>Самовывоз</td>
                    <td>{accountMoney(order.grandTotal)}</td>
                    <td>
                      <div className={styles.inlineActions}>
                        <Link
                          className="button button--secondary"
                          href={`/account/orders/${order.publicNumber}`}
                        >
                          Открыть
                        </Link>
                        {order.canRepeat ? (
                          <Link
                            aria-label={`Повторить заказ ${order.publicNumber}`}
                            className="button button--quiet"
                            href={`/account/orders/${order.publicNumber}/repeat`}
                          >
                            <RotateCcw aria-hidden="true" size={16} />
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.totalPages > 1 ? (
            <nav className={styles.pagination} aria-label="Страницы истории заказов">
              <button
                className="button button--secondary"
                disabled={result.page <= 1}
                type="button"
                onClick={() => changePage(result.page - 1)}
              >
                <ChevronLeft aria-hidden="true" size={17} /> Назад
              </button>
              <span>
                Страница {result.page} из {result.totalPages}
              </span>
              <button
                className="button button--secondary"
                disabled={result.page >= result.totalPages}
                type="button"
                onClick={() => changePage(result.page + 1)}
              >
                Вперёд <ChevronRight aria-hidden="true" size={17} />
              </button>
            </nav>
          ) : null}
        </>
      ) : (
        <div className={`${styles.card} ${styles.empty}`}>
          <p>После первого оформления заказ появится здесь.</p>
          <Link className="button button--primary" href="/catalog">
            Перейти в каталог
          </Link>
        </div>
      )}
    </section>
  );
}
