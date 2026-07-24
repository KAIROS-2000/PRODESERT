'use client';

import {
  PAYMENT_PROOF_MAX_BYTES,
  PaymentStatus,
  type PaymentInstructionsView,
} from '@pro-dessert/contracts';
import { AlertTriangle, Check, Copy, FileText, FileUp, LoaderCircle } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';

import {
  CheckoutApiError,
  downloadInvoice,
  getCheckoutErrorMessage,
  getPaymentInstructions,
  submitPaymentProof,
} from '@/lib/checkout-api';
import { readOrderAccessToken } from '@/lib/order-session';

import styles from './order-flow.module.css';

const bankRows = [
  ['recipient', 'Получатель'],
  ['inn', 'ИНН'],
  ['kpp', 'КПП'],
  ['settlementAccount', 'Расчётный счёт'],
  ['correspondentAccount', 'Корреспондентский счёт'],
  ['bik', 'БИК'],
  ['bankName', 'Банк'],
  ['paymentPurpose', 'Назначение платежа'],
] as const satisfies ReadonlyArray<readonly [keyof PaymentInstructionsView['bankDetails'], string]>;

export function PaymentPanel({
  publicNumber,
  onOrderChanged,
}: {
  publicNumber: string;
  onOrderChanged: () => void;
}) {
  const [payment, setPayment] = useState<PaymentInstructionsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [comment, setComment] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const requestKey = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = readOrderAccessToken(publicNumber);
    void getPaymentInstructions(publicNumber, token)
      .then((result) => {
        if (!cancelled) {
          setPayment(result);
          setError(null);
        }
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setPayment(null);
        if (!(requestError instanceof CheckoutApiError) || requestError.status !== 409) {
          setError(getCheckoutErrorMessage(requestError));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publicNumber]);

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setError('Не удалось скопировать. Выделите значение вручную.');
    }
  };

  const copyAll = () => {
    if (!payment) return;
    const value = [
      ...bankRows.flatMap(([key, label]) => {
        const content = payment.bankDetails[key];
        return typeof content === 'string' && content ? [`${label}: ${content}`] : [];
      }),
      `Сумма: ${payment.amount} ₽`,
      `Заказ: ${publicNumber}`,
      `Резерв до: ${payment.reservationExpiresAt}`,
    ].join('\n');
    void copyText('all', value);
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setSuccess(null);
    setError(null);
    if (selected && selected.size > PAYMENT_PROOF_MAX_BYTES) {
      setFile(null);
      setError('Размер файла не должен превышать 8 МБ.');
      event.target.value = '';
      return;
    }
    setFile(selected);
    requestKey.current = null;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!payment || (!file && !reference.trim())) {
      setError('Укажите номер платежа или прикрепите подтверждение.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    requestKey.current ??= `proof-${crypto.randomUUID()}`;
    try {
      await submitPaymentProof(
        publicNumber,
        readOrderAccessToken(publicNumber),
        {
          expectedPaymentVersion: payment.paymentVersion,
          ...(reference.trim() ? { paymentReference: reference.trim() } : {}),
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        },
        file,
        requestKey.current,
      );
      requestKey.current = null;
      setSuccess('Подтверждение принято. Менеджер проверит поступление на расчётный счёт.');
      setReference('');
      setComment('');
      setFile(null);
      onOrderChanged();
      const refreshed = await getPaymentInstructions(
        publicNumber,
        readOrderAccessToken(publicNumber),
      );
      setPayment(refreshed);
    } catch (requestError: unknown) {
      setError(getCheckoutErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  const invoice = async () => {
    setDownloading(true);
    setError(null);
    try {
      const result = await downloadInvoice(publicNumber, readOrderAccessToken(publicNumber));
      const url = URL.createObjectURL(result.bytes);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError: unknown) {
      setError(getCheckoutErrorMessage(requestError));
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <section className={styles.paymentCard} aria-label="Информация об оплате">
        <div className={styles.inlineLoading} role="status">
          <LoaderCircle className={styles.spin} aria-hidden="true" size={20} />
          Проверяем публикацию реквизитов…
        </div>
      </section>
    );
  }
  if (!payment) {
    return (
      <section className={styles.paymentCard} aria-labelledby="payment-wait-title">
        <h2 id="payment-wait-title">Банковский перевод</h2>
        <div className={styles.warningBox}>
          <AlertTriangle aria-hidden="true" size={20} />
          <span>
            Менеджер ещё не опубликовал реквизиты. Не выполняйте перевод до их появления на этой
            защищённой странице.
          </span>
        </div>
        {error ? (
          <p className={styles.formStatus} role="alert">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className={styles.paymentCard} aria-labelledby="payment-title">
      <div className={styles.paymentHeading}>
        <div>
          <p className={styles.eyebrow}>Оплата на расчётный счёт</p>
          <h2 id="payment-title">Реквизиты для перевода</h2>
        </div>
        <strong>{Number(payment.amount).toLocaleString('ru-RU')} ₽</strong>
      </div>

      {payment.bankDetails.isDemo ? (
        <div className={styles.demoWarning} role="alert">
          ДЕМОНСТРАЦИОННЫЕ ДАННЫЕ — НЕ ДЛЯ ОПЛАТЫ
        </div>
      ) : null}

      <dl className={styles.bankDetails}>
        {bankRows.map(([key, label]) => {
          const value = payment.bankDetails[key];
          if (typeof value !== 'string' || !value) return null;
          return (
            <div key={key}>
              <dt>{label}</dt>
              <dd>
                <span>{value}</span>
                <button
                  aria-label={`Скопировать: ${label}`}
                  className={styles.copyButton}
                  type="button"
                  onClick={() => void copyText(key, value)}
                >
                  {copied === key ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </dd>
            </div>
          );
        })}
      </dl>

      <div className={styles.paymentMeta}>
        <span>
          Резерв действует до{' '}
          <strong>{new Date(payment.reservationExpiresAt).toLocaleString('ru-RU')}</strong>
        </span>
        <span>Укажите номер заказа {publicNumber} в назначении платежа.</span>
      </div>

      <div className={styles.actions}>
        <button className="button button--secondary" type="button" onClick={copyAll}>
          {copied === 'all' ? <Check size={17} /> : <Copy size={17} />}
          Скопировать всё
        </button>
        {payment.invoiceAvailable ? (
          <button
            className="button button--secondary"
            disabled={downloading}
            type="button"
            onClick={() => void invoice()}
          >
            {downloading ? (
              <LoaderCircle className={styles.spin} size={17} />
            ) : (
              <FileText size={17} />
            )}
            Скачать PDF-счёт
          </button>
        ) : null}
      </div>

      <div className={styles.paymentNotice}>
        <AlertTriangle aria-hidden="true" size={20} />
        <p>
          Обработка начинается после фактического поступления денег. Приложенный чек не означает
          автоматическое подтверждение оплаты.
        </p>
      </div>

      {payment.status !== PaymentStatus.CONFIRMED ? (
        <form className={styles.proofForm} onSubmit={submit}>
          <div className={styles.paymentHeading}>
            <div>
              <h3>Сообщить о переводе</h3>
              <p>Достаточно номера платежа или файла. Менеджер всё равно проверит выписку.</p>
            </div>
            <FileUp aria-hidden="true" size={24} />
          </div>
          <label>
            <span>Номер или ссылка на платёж</span>
            <input
              maxLength={160}
              placeholder="Например, № 12345 от 25.07.2026"
              value={reference}
              onChange={(event) => {
                setReference(event.target.value);
                requestKey.current = null;
              }}
            />
          </label>
          <label>
            <span>Подтверждение PDF, JPEG или PNG до 8 МБ</span>
            <input
              accept="application/pdf,image/jpeg,image/png"
              type="file"
              onChange={chooseFile}
            />
          </label>
          <label>
            <span>
              Комментарий <small>(необязательно)</small>
            </span>
            <textarea
              maxLength={1000}
              rows={3}
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
                requestKey.current = null;
              }}
            />
          </label>
          {error ? (
            <p className={styles.formStatus} role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className={styles.successStatus} role="status">
              <Check aria-hidden="true" size={18} /> {success}
            </p>
          ) : null}
          <button className="button button--primary" disabled={submitting} type="submit">
            {submitting ? <LoaderCircle className={styles.spin} size={17} /> : <FileUp size={17} />}
            Отправить на проверку
          </button>
        </form>
      ) : null}
    </section>
  );
}
