'use client';

import {
  RepeatOrderItemState,
  type RepeatOrderPreview,
  type RepeatOrderResult,
} from '@pro-dessert/contracts';
import { AlertTriangle, ArrowLeft, CheckCircle2, RotateCcw, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { getAccountErrorMessage, previewRepeatOrder, repeatOrder } from '@/lib/account-api';

import { accountMoney } from './account-format';
import { AccountError, AccountLoading } from './account-state';
import styles from './account.module.css';

const stateLabels: Record<RepeatOrderItemState, string> = {
  [RepeatOrderItemState.READY]: 'Готово к добавлению',
  [RepeatOrderItemState.PRICE_CHANGED]: 'Цена изменилась',
  [RepeatOrderItemState.QUANTITY_ADJUSTED]: 'Количество скорректировано',
  [RepeatOrderItemState.UNAVAILABLE]: 'Недоступно',
};

const reasonLabels: Record<string, string> = {
  PRODUCT_INACTIVE: 'товар снят с публикации',
  VARIANT_INACTIVE: 'вариант больше не продаётся',
  PRICE_UNAVAILABLE: 'актуальная цена отсутствует',
  OUT_OF_STOCK: 'нет доступного остатка',
  INSUFFICIENT_STOCK: 'доступно меньше исходного количества',
  MINIMUM_APPLIED: 'применено минимальное количество',
  SALES_MULTIPLE_APPLIED: 'количество приведено к кратности продажи',
  PRICE_CHANGED: 'используется текущая цена',
};

export function RepeatOrderView({ publicNumber }: { publicNumber: string }) {
  const [preview, setPreview] = useState<RepeatOrderPreview | null>(null);
  const [result, setResult] = useState<RepeatOrderResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void previewRepeatOrder(publicNumber)
      .then((value) => {
        if (!cancelled) {
          setPreview(value);
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

  const execute = async () => {
    if (!preview?.canExecute) return;
    setSubmitting(true);
    setMutationError(null);
    idempotencyKey.current ??= `repeat-${crypto.randomUUID()}`;
    try {
      const value = await repeatOrder(publicNumber, idempotencyKey.current);
      setResult(value);
      setPreview(value.preview);
      idempotencyKey.current = null;
    } catch (requestError: unknown) {
      setMutationError(getAccountErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <AccountError
        error={error}
        onRetry={() => {
          setPreview(null);
          setError(null);
          setAttempt((value) => value + 1);
        }}
      />
    );
  }
  if (!preview) return <AccountLoading label="Проверяем товары и актуальные цены…" />;

  return (
    <section className={styles.stack} aria-labelledby="repeat-order-title">
      <header className={styles.sectionHeader}>
        <div>
          <Link href={`/account/orders/${publicNumber}`}>
            <ArrowLeft aria-hidden="true" size={16} /> К заказу
          </Link>
          <h1 id="repeat-order-title">Повторить {publicNumber}</h1>
          <p>
            Проверка выполнена сейчас. Старые цены не копируются — корзина получит только
            актуальные.
          </p>
        </div>
      </header>

      {preview.hasChanges ? (
        <div className={styles.status} data-tone="error" role="status">
          <AlertTriangle aria-hidden="true" size={18} /> Часть цен, количества или доступности
          изменилась. Проверьте каждую позицию.
        </div>
      ) : (
        <div className={styles.status} data-tone="success" role="status">
          <CheckCircle2 aria-hidden="true" size={18} /> Все позиции доступны без изменений.
        </div>
      )}

      <div className={styles.stack}>
        {preview.items.map((item) => (
          <article className={styles.repeatItem} data-state={item.state} key={item.orderItemId}>
            <header>
              <div>
                <h3>{item.productName}</h3>
                <p>{item.offerName}</p>
              </div>
              <span className={styles.badge}>{stateLabels[item.state]}</span>
            </header>
            <p>
              Было: {item.requestedQuantity} {item.unit} по {accountMoney(item.sourceUnitPrice)}
            </p>
            {item.currentUnitPrice && item.quantityToAdd ? (
              <p>
                В корзину: {item.quantityToAdd} {item.unit} по{' '}
                <strong>{accountMoney(item.currentUnitPrice)}</strong>
                {item.currentLineTotal ? ` · ${accountMoney(item.currentLineTotal)}` : ''}
              </p>
            ) : null}
            {item.reasonCodes.length > 0 ? (
              <p>
                {item.reasonCodes
                  .map((code) => reasonLabels[code] ?? code.toLocaleLowerCase('ru-RU'))
                  .join('; ')}
              </p>
            ) : null}
            {item.alternatives.length > 0 ? (
              <div className={styles.alternativeList} aria-label="Доступные аналоги">
                {item.alternatives.map((alternative) => (
                  <Link href={`/product/${alternative.productSlug}`} key={alternative.variantId}>
                    Аналог: {alternative.productName} · {accountMoney(alternative.unitPrice)}
                  </Link>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <section className={styles.card}>
        <dl className={styles.definitionList}>
          <div>
            <dt>Предварительный итог</dt>
            <dd>{accountMoney(preview.estimatedTotal)}</dd>
          </div>
          <div>
            <dt>Доступно к добавлению</dt>
            <dd>{preview.items.filter((item) => item.quantityToAdd !== null).length} поз.</dd>
          </div>
        </dl>
        {mutationError ? (
          <p className={styles.status} data-tone="error" role="alert">
            {mutationError}
          </p>
        ) : null}
        {result ? (
          <div className={styles.status} data-tone="success" role="status">
            Добавлено: {result.addedItemCount}; пропущено: {result.skippedItemCount}. Повторный
            запрос не создаст дубликаты.
          </div>
        ) : null}
        <div className={styles.formActions}>
          <button
            className="button button--primary"
            disabled={!preview.canExecute || submitting || Boolean(result)}
            type="button"
            onClick={() => void execute()}
          >
            <RotateCcw aria-hidden="true" size={17} />
            {submitting ? 'Добавляем…' : 'Добавить доступное в корзину'}
          </button>
          {result ? (
            <Link className="button button--secondary" href="/cart">
              <ShoppingCart aria-hidden="true" size={17} /> Открыть корзину
            </Link>
          ) : null}
        </div>
      </section>
    </section>
  );
}
