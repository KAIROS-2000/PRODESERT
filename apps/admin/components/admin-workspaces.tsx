'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
} from 'lucide-react';
import {
  adminGet,
  adminMutation,
  dateTime,
  record,
  records,
  text,
  type ApiRecord,
} from '@/lib/admin-api';

type EndpointState = {
  data: ApiRecord | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
};

function useEndpoint(path: string | null): EndpointState {
  const [data, setData] = useState<ApiRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!path) return;
    let mounted = true;
    void Promise.resolve().then(async () => {
      if (!mounted) return;
      setLoading(true);
      setError(null);
      try {
        const payload = await adminGet<ApiRecord>(path);
        if (mounted) setData(payload);
      } catch (reason: unknown) {
        if (mounted)
          setError(reason instanceof Error ? reason.message : 'Не удалось загрузить данные.');
      } finally {
        if (mounted) setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [path, revision]);

  return { data, error, loading, reload };
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function arrayFrom(data: ApiRecord | null, key = 'items'): ApiRecord[] {
  return records(data?.[key]);
}

function Notice({ children, kind = 'error' }: { children: string; kind?: 'error' | 'success' }) {
  return (
    <p className={`notice notice--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

function LoadingState() {
  return (
    <p className="loading-line" role="status">
      <LoaderCircle className="spin" aria-hidden size={18} /> Загрузка…
    </p>
  );
}

function EmptyState({ children }: { children: string }) {
  return <p className="empty-state">{children}</p>;
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="content-header">
      <div>
        <span className="section-label">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

function RefreshButton({ onClick, busy = false }: { onClick: () => void; busy?: boolean }) {
  return (
    <button className="secondary-button" type="button" onClick={onClick} disabled={busy}>
      <RefreshCw className={busy ? 'spin' : ''} aria-hidden size={17} /> Обновить
    </button>
  );
}

function StatusPill({ value }: { value: unknown }) {
  const normalized = text(value);
  return (
    <span className={`status-pill status-pill--${normalized.toLowerCase().replaceAll('_', '-')}`}>
      {normalized}
    </span>
  );
}

function FormButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button className="primary-button" type="submit" disabled={pending}>
      {pending ? (
        <LoaderCircle className="spin" aria-hidden size={18} />
      ) : (
        <Save aria-hidden size={18} />
      )}
      {children}
    </button>
  );
}

export function DashboardWorkspace() {
  const { data, error, loading, reload } = useEndpoint('/api/v1/admin/dashboard');
  const metrics = record(data?.metrics);
  const integration = record(data?.integration);
  const cards: readonly [string, unknown][] = [
    ['Новые заказы', metrics?.newOrders],
    ['Ожидают наличия', metrics?.awaitingStock],
    ['Ожидают оплату', metrics?.awaitingPayment],
    ['Проверка оплаты', metrics?.paymentVerification],
    ['На сборке', metrics?.assembling],
    ['Готовы к выдаче', metrics?.readyForPickup],
    ['Истекают резервы', metrics?.expiringReservations],
    ['Ошибки 1С', metrics?.integrationErrors],
    ['Расхождения остатков', metrics?.stockDiscrepancies],
  ];
  return (
    <>
      <PageHeader
        eyebrow="Операции"
        title="Панель управления"
        description="Операционные показатели заказов, оплат, резервов и интеграции с 1С."
        action={<RefreshButton onClick={reload} busy={loading} />}
      />
      {error ? <Notice>{error}</Notice> : null}
      {loading && !data ? <LoadingState /> : null}
      <section className="metric-grid" aria-label="Ключевые показатели">
        {cards.map(([label, value]) => (
          <article className="metric-card" key={label}>
            <span>{label}</span>
            <strong>{text(value, '0')}</strong>
          </article>
        ))}
      </section>
      <section className="workspace-grid workspace-grid--two">
        <article className="panel-card">
          <h2>За выбранный период</h2>
          <dl className="definition-list">
            <div>
              <dt>Сумма заказов</dt>
              <dd>{text(metrics?.orderTotal, '0.00')} ₽</dd>
            </div>
            <div>
              <dt>Конверсия в оплату</dt>
              <dd>{text(metrics?.conversionOrdersToPayment, '0')}%</dd>
            </div>
          </dl>
        </article>
        <article className="panel-card">
          <h2>Интеграция</h2>
          <p>Последний успешный обмен: {dateTime(record(integration?.lastSuccessful)?.at)}</p>
          <p>Последняя попытка: {dateTime(record(integration?.lastAttempt)?.at)}</p>
          <Link className="text-link" href="/integration">
            Открыть журнал интеграции <ExternalLink aria-hidden size={15} />
          </Link>
        </article>
      </section>
    </>
  );
}

export function OrdersWorkspace() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const url = useMemo(() => {
    const params = new URLSearchParams({ page: '1', limit: '25' });
    if (query) params.set('q', query);
    if (status) params.set('status', status);
    return `/api/v1/admin/orders?${params.toString()}`;
  }, [query, status]);
  const { data, error, loading, reload } = useEndpoint(url);
  const items = arrayFrom(data);
  const submit = (event: FormEvent<HTMLFormElement>) => event.preventDefault();
  return (
    <>
      <PageHeader
        eyebrow="Операции"
        title="Заказы"
        description="Поиск, фильтрация, просмотр снимков цен, резерва, оплаты и истории статусов."
        action={
          <a className="secondary-button" href="/api/v1/admin/orders/export">
            <Download aria-hidden size={17} /> Экспорт CSV
          </a>
        }
      />
      <form className="filter-bar" onSubmit={submit}>
        <label className="sr-only" htmlFor="order-search">
          Поиск заказа
        </label>
        <input
          id="order-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Номер, email, телефон или имя"
        />
        <label className="sr-only" htmlFor="order-status">
          Статус заказа
        </label>
        <select
          id="order-status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">Все статусы</option>
          <option value="AWAITING_STOCK_CONFIRMATION">Ожидает наличия</option>
          <option value="AWAITING_PAYMENT">Ожидает оплаты</option>
          <option value="PAYMENT_VERIFICATION">Проверка оплаты</option>
          <option value="PAID">Оплачен</option>
          <option value="ASSEMBLING">На сборке</option>
          <option value="READY_FOR_PICKUP">Готов к выдаче</option>
          <option value="COMPLETED">Завершён</option>
        </select>
        <RefreshButton onClick={reload} busy={loading} />
      </form>
      {error ? <Notice>{error}</Notice> : null}
      {loading && !data ? <LoadingState /> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Заказ</th>
              <th>Клиент</th>
              <th>Статус</th>
              <th>Оплата</th>
              <th>Сумма</th>
              <th>Создан</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const customer = record(item.customer);
              const payment = record(item.payment);
              const id = text(item.id, '');
              return (
                <tr key={id}>
                  <td>
                    <Link className="table-link" href={`/orders/${id}`}>
                      {text(item.publicNumber)}
                    </Link>
                  </td>
                  <td>
                    <strong>{text(customer?.name)}</strong>
                    <small>{text(customer?.email)}</small>
                  </td>
                  <td>
                    <StatusPill value={item.status} />
                  </td>
                  <td>{payment ? <StatusPill value={payment.status} /> : '—'}</td>
                  <td>{text(item.grandTotal)} ₽</td>
                  <td>{dateTime(item.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!loading && items.length === 0 ? (
        <EmptyState>Заказы по заданным условиям не найдены.</EmptyState>
      ) : null}
      <p className="table-summary">Всего: {text(data?.total, '0')}</p>
    </>
  );
}

export function PaymentsWorkspace() {
  const { data, error, loading, reload } = useEndpoint('/api/v1/admin/payments?limit=50');
  const items = arrayFrom(data);
  return (
    <>
      <PageHeader
        eyebrow="Финансы"
        title="Проверка оплат"
        description="Банковские реквизиты, референс платежа, документы и решения менеджера."
        action={<RefreshButton onClick={reload} busy={loading} />}
      />
      {error ? <Notice>{error}</Notice> : null}
      {loading && !data ? <LoadingState /> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Заказ</th>
              <th>Сумма</th>
              <th>Статус</th>
              <th>Референс</th>
              <th>Документы</th>
              <th>Получен</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const order = record(item.order);
              const id = text(order?.id, '');
              return (
                <tr key={text(item.id)}>
                  <td>
                    <Link className="table-link" href={`/orders/${id}`}>
                      {text(order?.publicNumber)}
                    </Link>
                  </td>
                  <td>{text(item.amount)} ₽</td>
                  <td>
                    <StatusPill value={item.status} />
                  </td>
                  <td>{text(item.paymentReference)}</td>
                  <td>{records(item.documents).length}</td>
                  <td>{dateTime(item.proofSubmittedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!loading && items.length === 0 ? (
        <EmptyState>Оплаты пока не опубликованы.</EmptyState>
      ) : null}
    </>
  );
}

export function ReservationsWorkspace() {
  const { data, error, loading, reload } = useEndpoint('/api/v1/admin/reservations?limit=50');
  const items = arrayFrom(data);
  return (
    <>
      <PageHeader
        eyebrow="Склад"
        title="Резервы"
        description="Состояние резервов, срок действия, склад и связь с заказом. Продление направляется в 1С."
        action={<RefreshButton onClick={reload} busy={loading} />}
      />
      {error ? <Notice>{error}</Notice> : null}
      {loading && !data ? <LoadingState /> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Заказ</th>
              <th>Товар</th>
              <th>Склад</th>
              <th>Количество</th>
              <th>Статус</th>
              <th>Истекает</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const order = record(item.order);
              const product = record(item.item);
              const warehouse = record(item.warehouse);
              return (
                <tr key={text(item.id)}>
                  <td>
                    <Link className="table-link" href={`/orders/${text(order?.id, '')}`}>
                      {text(order?.publicNumber)}
                    </Link>
                  </td>
                  <td>
                    {text(product?.productName)}
                    <small>{text(product?.sku)}</small>
                  </td>
                  <td>{text(warehouse?.name)}</td>
                  <td>{text(item.quantity)}</td>
                  <td>
                    <StatusPill value={item.status} />
                  </td>
                  <td>{dateTime(item.expiresAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!loading && items.length === 0 ? (
        <EmptyState>Активных резервов не найдено.</EmptyState>
      ) : null}
    </>
  );
}

export function OrderDetailWorkspace({ id }: { id: string }) {
  const { data, error, loading, reload } = useEndpoint(`/api/v1/admin/orders/${id}`);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const payment = record(data?.payment);
  const actions = record(data?.allowedActions);
  const version = numberValue(data?.version, 1);
  const paymentVersion = numberValue(payment?.version, 1);

  async function run(name: string, path: string, body: ApiRecord): Promise<void> {
    setPending(name);
    setMessage(null);
    try {
      await adminMutation(path, 'POST', body);
      setMessage('Операция выполнена. Карточка обновлена.');
      reload();
    } catch (reason: unknown) {
      setMessage(reason instanceof Error ? reason.message : 'Операция не выполнена.');
    } finally {
      setPending(null);
    }
  }

  async function reasoned(
    name: string,
    path: string,
    extra: ApiRecord = {},
    reasonField: 'reason' | 'comment' = 'reason',
  ): Promise<void> {
    const reason = window.prompt('Укажите причину для журнала действий:');
    if (!reason?.trim()) return;
    await run(name, path, { ...extra, [reasonField]: reason.trim() });
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = String(form.get('body') ?? '').trim();
    if (!body) return;
    await run('note', `/api/v1/admin/orders/${id}/notes`, { body });
    event.currentTarget.reset();
  }

  const documents = records(payment?.documents);
  return (
    <>
      <Link className="back-link" href="/orders">
        <ChevronLeft aria-hidden size={17} /> К списку заказов
      </Link>
      <PageHeader
        eyebrow="Заказ"
        title={text(data?.publicNumber, 'Заказ')}
        description={`Создан ${dateTime(data?.createdAt)} · ${text(data?.grandTotal)} ₽ · только самовывоз`}
        action={<RefreshButton onClick={reload} busy={loading || pending !== null} />}
      />
      {error ? <Notice>{error}</Notice> : null}
      {message ? (
        <Notice kind={message.startsWith('Операция') ? 'success' : 'error'}>{message}</Notice>
      ) : null}
      {loading && !data ? <LoadingState /> : null}
      {data ? (
        <div className="detail-grid">
          <section className="panel-card detail-wide">
            <div className="panel-heading">
              <h2>Действия</h2>
              <StatusPill value={data.status} />
            </div>
            <div className="action-row">
              {actions?.confirmStock === true ? (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={pending !== null}
                  onClick={() =>
                    run('stock', `/api/v1/admin/orders/${id}/confirm-stock`, {
                      expectedVersion: version,
                    })
                  }
                >
                  Подтвердить наличие в 1С
                </button>
              ) : null}
              {actions?.sendPaymentDetails === true ? (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={pending !== null}
                  onClick={() =>
                    run('details', `/api/v1/admin/orders/${id}/send-payment-details`, {
                      expectedOrderVersion: version,
                    })
                  }
                >
                  Отправить реквизиты
                </button>
              ) : null}
              {actions?.confirmPayment === true ? (
                <button
                  type="button"
                  className="primary-button"
                  disabled={pending !== null}
                  onClick={() =>
                    run('confirm', `/api/v1/admin/orders/${id}/confirm-payment`, {
                      expectedOrderVersion: version,
                      expectedPaymentVersion: paymentVersion,
                    })
                  }
                >
                  Подтвердить оплату
                </button>
              ) : null}
              {actions?.rejectPayment === true ? (
                <button
                  type="button"
                  className="danger-button"
                  disabled={pending !== null}
                  onClick={() =>
                    reasoned(
                      'reject',
                      `/api/v1/admin/orders/${id}/reject-payment`,
                      { expectedOrderVersion: version, expectedPaymentVersion: paymentVersion },
                      'comment',
                    )
                  }
                >
                  Отклонить оплату
                </button>
              ) : null}
              {actions?.extendReservation === true ? (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={pending !== null}
                  onClick={() =>
                    reasoned('extend', `/api/v1/admin/orders/${id}/extend-reservation`, {
                      expectedVersion: version,
                    })
                  }
                >
                  Запросить продление
                </button>
              ) : null}
              {actions?.startAssembly === true ? (
                <button
                  type="button"
                  className="primary-button"
                  disabled={pending !== null}
                  onClick={() =>
                    run('assembly', `/api/v1/admin/orders/${id}/start-assembly`, {
                      expectedVersion: version,
                    })
                  }
                >
                  Начать сборку
                </button>
              ) : null}
              {actions?.markReady === true ? (
                <button
                  type="button"
                  className="primary-button"
                  disabled={pending !== null}
                  onClick={() =>
                    run('ready', `/api/v1/admin/orders/${id}/mark-ready`, {
                      expectedVersion: version,
                    })
                  }
                >
                  Готов к выдаче
                </button>
              ) : null}
              {actions?.complete === true ? (
                <button
                  type="button"
                  className="primary-button"
                  disabled={pending !== null}
                  onClick={() =>
                    run('complete', `/api/v1/admin/orders/${id}/complete`, {
                      expectedVersion: version,
                    })
                  }
                >
                  Выдача завершена
                </button>
              ) : null}
              {actions?.cancel === true ? (
                <button
                  type="button"
                  className="danger-button"
                  disabled={pending !== null}
                  onClick={() =>
                    reasoned('cancel', `/api/v1/admin/orders/${id}/cancel`, {
                      expectedVersion: version,
                    })
                  }
                >
                  Отменить заказ
                </button>
              ) : null}
              {pending ? (
                <span className="inline-loading">
                  <LoaderCircle className="spin" aria-hidden size={16} /> Выполняется…
                </span>
              ) : null}
            </div>
          </section>
          <section className="panel-card">
            <h2>Клиент и самовывоз</h2>
            {(() => {
              const customer = record(data.customer);
              const pickup = record(data.pickupLocation);
              return (
                <dl className="definition-list">
                  <div>
                    <dt>Клиент</dt>
                    <dd>{text(customer?.name)}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{text(customer?.email)}</dd>
                  </div>
                  <div>
                    <dt>Телефон</dt>
                    <dd>{text(customer?.phone)}</dd>
                  </div>
                  <div>
                    <dt>Пункт</dt>
                    <dd>{text(pickup?.name)}</dd>
                  </div>
                  <div>
                    <dt>Адрес</dt>
                    <dd>{text(pickup?.address)}</dd>
                  </div>
                  <div>
                    <dt>Резерв до</dt>
                    <dd>{dateTime(data.reservationExpiresAt)}</dd>
                  </div>
                </dl>
              );
            })()}
          </section>
          <section className="panel-card">
            <h2>Оплата банковским переводом</h2>
            {payment ? (
              <dl className="definition-list">
                <div>
                  <dt>Статус</dt>
                  <dd>
                    <StatusPill value={payment.status} />
                  </dd>
                </div>
                <div>
                  <dt>Сумма</dt>
                  <dd>{text(payment.amount)} ₽</dd>
                </div>
                <div>
                  <dt>Референс</dt>
                  <dd>{text(payment.paymentReference)}</dd>
                </div>
                <div>
                  <dt>Банк</dt>
                  <dd>{text(record(payment.bankDetails)?.bankName)}</dd>
                </div>
                <div>
                  <dt>Назначение</dt>
                  <dd>{text(record(payment.bankDetails)?.paymentPurpose)}</dd>
                </div>
              </dl>
            ) : (
              <EmptyState>Реквизиты ещё не опубликованы.</EmptyState>
            )}
            {documents.length > 0 ? (
              <ul className="document-list">
                {documents.map((document) => (
                  <li key={text(document.id)}>
                    <FileText aria-hidden size={16} />
                    <a href={`/api/v1/admin/payment-documents/${text(document.id)}/download`}>
                      {text(document.originalFilename)}
                    </a>
                    <small>{text(document.scanStatus)}</small>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
          <section className="panel-card detail-wide">
            <h2>Состав и снимки цен</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Товар</th>
                    <th>SKU</th>
                    <th>Количество</th>
                    <th>Цена</th>
                    <th>Скидка</th>
                    <th>Итого</th>
                  </tr>
                </thead>
                <tbody>
                  {records(data.items).map((item) => (
                    <tr key={text(item.id)}>
                      <td>
                        {text(item.productName)}
                        <small>{text(item.offerName)}</small>
                      </td>
                      <td>{text(item.sku)}</td>
                      <td>{text(item.quantity)}</td>
                      <td>{text(item.unitPrice)} ₽</td>
                      <td>{text(item.lineDiscount)} ₽</td>
                      <td>{text(item.lineTotal)} ₽</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel-card">
            <h2>Резервы</h2>
            <ul className="stack-list">
              {records(data.reservations).map((reservation) => {
                const warehouse = record(reservation.warehouse);
                const variant = record(reservation.variant);
                return (
                  <li key={text(reservation.id)}>
                    <strong>{text(variant?.sku)}</strong>
                    <span>
                      {text(warehouse?.name)} · {text(reservation.quantity)}
                    </span>
                    <small>
                      <StatusPill value={reservation.status} /> до {dateTime(reservation.expiresAt)}
                    </small>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="panel-card">
            <h2>История статусов</h2>
            <ol className="timeline">
              {records(data.timeline).map((event) => (
                <li key={text(event.id)}>
                  <strong>
                    {text(event.fromStatus)} → {text(event.toStatus)}
                  </strong>
                  <span>{dateTime(event.createdAt)}</span>
                  <small>{text(event.reason)}</small>
                </li>
              ))}
            </ol>
          </section>
          <section className="panel-card detail-wide">
            <h2>Внутренние комментарии</h2>
            <form className="inline-form" onSubmit={addNote}>
              <label className="sr-only" htmlFor="internal-note">
                Новый внутренний комментарий
              </label>
              <textarea
                id="internal-note"
                name="body"
                maxLength={4000}
                required
                placeholder="Комментарий для сотрудников"
              />
              <FormButton pending={pending === 'note'}>Добавить</FormButton>
            </form>
            <ul className="stack-list">
              {records(data.internalNotes).map((note) => {
                const author = record(note.author);
                return (
                  <li key={text(note.id)}>
                    <strong>{text(author?.name, text(author?.email))}</strong>
                    <span>{text(note.body)}</span>
                    <small>{dateTime(note.createdAt)}</small>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      ) : null}
    </>
  );
}

type ImageDraft = {
  objectKey: string;
  publicUrl: string;
  alt: string;
  variantId: string;
  sortOrder: number;
  isPrimary: boolean;
  published: boolean;
};

type RelationDraft = { targetProductId: string; relationType: string; sortOrder: number };

export function CatalogWorkspace() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useEndpoint(
    `/api/v1/admin/catalog/products?limit=30${search ? `&q=${encodeURIComponent(search)}` : ''}`,
  );
  const detail = useEndpoint(selectedId ? `/api/v1/admin/catalog/products/${selectedId}` : null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [imagesOverride, setImagesOverride] = useState<ImageDraft[] | null>(null);
  const [relationsOverride, setRelationsOverride] = useState<RelationDraft[] | null>(null);
  const synonymData = useEndpoint('/api/v1/admin/catalog/synonyms');

  const initialImages = useMemo(
    () =>
      records(detail.data?.images).map((image) => ({
        objectKey: stringValue(image.objectKey),
        publicUrl: stringValue(image.publicUrl),
        alt: stringValue(image.alt),
        variantId: stringValue(image.variantId),
        sortOrder: numberValue(image.sortOrder),
        isPrimary: image.isPrimary === true,
        published: image.published !== false,
      })),
    [detail.data],
  );
  const initialRelations = useMemo(
    () =>
      records(detail.data?.relations).map((relation) => ({
        targetProductId: stringValue(record(relation.target)?.id),
        relationType: stringValue(relation.relationType) || 'RELATED',
        sortOrder: numberValue(relation.sortOrder),
      })),
    [detail.data],
  );
  const images = imagesOverride ?? initialImages;
  const relations = relationsOverride ?? initialRelations;

  async function saveContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !detail.data) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setMessage(null);
    try {
      await adminMutation(`/api/v1/admin/catalog/products/${selectedId}/content`, 'PATCH', {
        expectedContentVersion: numberValue(detail.data.contentVersion, 1),
        description: String(form.get('description') ?? ''),
        seoTitle: String(form.get('seoTitle') ?? ''),
        seoDescription: String(form.get('seoDescription') ?? ''),
        isHit: form.get('isHit') === 'on',
        isNew: form.get('isNew') === 'on',
      });
      setMessage('Контент товара сохранён. Коммерческие поля 1С не изменялись.');
      detail.reload();
      list.reload();
    } catch (reason: unknown) {
      setMessage(reason instanceof Error ? reason.message : 'Не удалось сохранить контент.');
    } finally {
      setPending(false);
    }
  }

  async function saveImages() {
    if (!selectedId || !detail.data) return;
    setPending(true);
    setMessage(null);
    try {
      await adminMutation(`/api/v1/admin/catalog/products/${selectedId}/images`, 'PUT', {
        expectedContentVersion: numberValue(detail.data.contentVersion, 1),
        images: images.map((image, index) => ({
          ...image,
          variantId: image.variantId || undefined,
          isPrimary: image.isPrimary || index === 0,
        })),
      });
      setMessage('Изображения, alt-тексты и порядок сохранены.');
      detail.reload();
    } catch (reason: unknown) {
      setMessage(reason instanceof Error ? reason.message : 'Не удалось сохранить изображения.');
    } finally {
      setPending(false);
    }
  }

  async function saveRelations() {
    if (!selectedId || !detail.data) return;
    setPending(true);
    setMessage(null);
    try {
      await adminMutation(`/api/v1/admin/catalog/products/${selectedId}/relations`, 'PUT', {
        expectedContentVersion: numberValue(detail.data.contentVersion, 1),
        relations: relations.filter((relation) => relation.targetProductId),
      });
      setMessage('Связанные и альтернативные товары сохранены.');
      detail.reload();
    } catch (reason: unknown) {
      setMessage(reason instanceof Error ? reason.message : 'Не удалось сохранить связи.');
    } finally {
      setPending(false);
    }
  }

  async function addSynonym(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const normalizedTerm = String(form.get('normalizedTerm') ?? '').trim();
    const canonicalTerm = String(form.get('canonicalTerm') ?? '').trim();
    if (!normalizedTerm || !canonicalTerm) return;
    setPending(true);
    try {
      await adminMutation('/api/v1/admin/catalog/synonyms', 'POST', {
        normalizedTerm,
        canonicalTerm,
      });
      event.currentTarget.reset();
      synonymData.reload();
      setMessage('Поисковый синоним добавлен.');
    } catch (reason: unknown) {
      setMessage(reason instanceof Error ? reason.message : 'Не удалось добавить синоним.');
    } finally {
      setPending(false);
    }
  }

  const products = arrayFrom(list.data);
  return (
    <>
      <PageHeader
        eyebrow="Контент каталога"
        title="Каталог"
        description="Контент-менеджер редактирует описания, SEO, изображения и связи — без доступа к SKU, ценам, остаткам и данным 1С."
        action={<RefreshButton onClick={list.reload} busy={list.loading} />}
      />
      {message ? (
        <Notice
          kind={message.includes('сохран') || message.includes('добавлен') ? 'success' : 'error'}
        >
          {message}
        </Notice>
      ) : null}
      <div className="catalog-layout">
        <section className="panel-card catalog-list">
          <label className="sr-only" htmlFor="catalog-search">
            Поиск товара
          </label>
          <input
            id="catalog-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по названию или SKU"
          />
          {list.error ? <Notice>{list.error}</Notice> : null}
          {list.loading && !list.data ? <LoadingState /> : null}
          <ul className="selectable-list">
            {products.map((product) => (
              <li key={text(product.id)}>
                <button
                  type="button"
                  className={selectedId === text(product.id) ? 'is-selected' : ''}
                  onClick={() => {
                    setSelectedId(text(product.id));
                    setImagesOverride(null);
                    setRelationsOverride(null);
                  }}
                >
                  <strong>{text(product.baseName)}</strong>
                  <small>
                    {text(product.slug)} · версия контента {text(product.contentVersion)}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="catalog-editor">
          {!selectedId ? (
            <section className="panel-card">
              <EmptyState>Выберите товар из списка, чтобы редактировать контент.</EmptyState>
            </section>
          ) : null}
          {detail.loading ? <LoadingState /> : null}
          {detail.error ? <Notice>{detail.error}</Notice> : null}
          {detail.data ? (
            <>
              <form className="panel-card form-grid" onSubmit={saveContent}>
                <div className="panel-heading">
                  <div>
                    <h2>{text(detail.data.baseName)}</h2>
                    <p>
                      1С ID: {text(detail.data.oneCId)} · {text(detail.data.active)}
                    </p>
                  </div>
                  <span className="version-chip">v{text(detail.data.contentVersion)}</span>
                </div>
                <label className="field">
                  <span>Описание</span>
                  <textarea
                    name="description"
                    defaultValue={stringValue(detail.data.description)}
                    rows={8}
                  />
                </label>
                <div className="form-split">
                  <label className="field">
                    <span>SEO title</span>
                    <input
                      name="seoTitle"
                      defaultValue={stringValue(detail.data.seoTitle)}
                      maxLength={300}
                    />
                  </label>
                  <label className="field">
                    <span>SEO description</span>
                    <textarea
                      name="seoDescription"
                      defaultValue={stringValue(detail.data.seoDescription)}
                      maxLength={500}
                      rows={3}
                    />
                  </label>
                </div>
                <div className="checkbox-row">
                  <label>
                    <input
                      name="isHit"
                      type="checkbox"
                      defaultChecked={detail.data.isHit === true}
                    />{' '}
                    Хит
                  </label>
                  <label>
                    <input
                      name="isNew"
                      type="checkbox"
                      defaultChecked={detail.data.isNew === true}
                    />{' '}
                    Новинка
                  </label>
                </div>
                <FormButton pending={pending}>Сохранить контент</FormButton>
              </form>
              <section className="panel-card">
                <div className="panel-heading">
                  <h2>Изображения</h2>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      setImagesOverride((current) => [
                        ...(current ?? initialImages),
                        {
                          objectKey: '',
                          publicUrl: '',
                          alt: '',
                          variantId: '',
                          sortOrder: images.length,
                          isPrimary: images.length === 0,
                          published: true,
                        },
                      ])
                    }
                  >
                    <Plus aria-hidden size={16} /> Добавить
                  </button>
                </div>
                <div className="image-editor-list">
                  {images.map((image, index) => (
                    <div className="image-editor" key={`${image.objectKey}-${index}`}>
                      <label className="field">
                        <span>URL</span>
                        <input
                          value={image.publicUrl}
                          onChange={(event) =>
                            setImagesOverride((current) =>
                              (current ?? initialImages).map((entry, position) =>
                                position === index
                                  ? { ...entry, publicUrl: event.target.value }
                                  : entry,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Object key</span>
                        <input
                          value={image.objectKey}
                          onChange={(event) =>
                            setImagesOverride((current) =>
                              (current ?? initialImages).map((entry, position) =>
                                position === index
                                  ? { ...entry, objectKey: event.target.value }
                                  : entry,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Alt</span>
                        <input
                          value={image.alt}
                          onChange={(event) =>
                            setImagesOverride((current) =>
                              (current ?? initialImages).map((entry, position) =>
                                position === index ? { ...entry, alt: event.target.value } : entry,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Порядок</span>
                        <input
                          type="number"
                          min="0"
                          value={image.sortOrder}
                          onChange={(event) =>
                            setImagesOverride((current) =>
                              (current ?? initialImages).map((entry, position) =>
                                position === index
                                  ? { ...entry, sortOrder: Number(event.target.value) }
                                  : entry,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="primary-image"
                          checked={image.isPrimary}
                          onChange={() =>
                            setImagesOverride((current) =>
                              (current ?? initialImages).map((entry, position) => ({
                                ...entry,
                                isPrimary: position === index,
                              })),
                            )
                          }
                        />{' '}
                        Главное
                      </label>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() =>
                          setImagesOverride((current) =>
                            (current ?? initialImages).filter((_, position) => position !== index),
                          )
                        }
                      >
                        Удалить
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={pending}
                  onClick={() => void saveImages()}
                >
                  <Save aria-hidden size={16} /> Сохранить изображения
                </button>
              </section>
              <section className="panel-card">
                <div className="panel-heading">
                  <h2>Связанные и альтернативные товары</h2>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      setRelationsOverride((current) => [
                        ...(current ?? initialRelations),
                        {
                          targetProductId: '',
                          relationType: 'RELATED',
                          sortOrder: relations.length,
                        },
                      ])
                    }
                  >
                    <Plus aria-hidden size={16} /> Связь
                  </button>
                </div>
                <div className="relation-editor-list">
                  {relations.map((relation, index) => (
                    <div className="relation-editor" key={`${relation.targetProductId}-${index}`}>
                      <input
                        aria-label={`UUID связанного товара ${index + 1}`}
                        value={relation.targetProductId}
                        onChange={(event) =>
                          setRelationsOverride((current) =>
                            (current ?? initialRelations).map((entry, position) =>
                              position === index
                                ? { ...entry, targetProductId: event.target.value }
                                : entry,
                            ),
                          )
                        }
                        placeholder="UUID товара"
                      />
                      <select
                        aria-label={`Тип связи ${index + 1}`}
                        value={relation.relationType}
                        onChange={(event) =>
                          setRelationsOverride((current) =>
                            (current ?? initialRelations).map((entry, position) =>
                              position === index
                                ? { ...entry, relationType: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      >
                        <option value="RELATED">Связанный</option>
                        <option value="ALTERNATIVE">Альтернатива</option>
                        <option value="ACCESSORY">Дополнение</option>
                      </select>
                      <input
                        aria-label={`Порядок связи ${index + 1}`}
                        type="number"
                        min="0"
                        value={relation.sortOrder}
                        onChange={(event) =>
                          setRelationsOverride((current) =>
                            (current ?? initialRelations).map((entry, position) =>
                              position === index
                                ? { ...entry, sortOrder: Number(event.target.value) }
                                : entry,
                            ),
                          )
                        }
                      />
                      <button
                        className="text-button"
                        type="button"
                        aria-label={`Удалить связь ${index + 1}`}
                        onClick={() =>
                          setRelationsOverride((current) =>
                            (current ?? initialRelations).filter(
                              (_, position) => position !== index,
                            ),
                          )
                        }
                      >
                        Удалить
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={pending}
                  onClick={() => void saveRelations()}
                >
                  <Save aria-hidden size={16} /> Сохранить связи
                </button>
              </section>
            </>
          ) : null}
        </section>
      </div>
      <section className="panel-card synonym-panel">
        <h2>Поисковые синонимы</h2>
        <form className="inline-form" onSubmit={addSynonym}>
          <label className="sr-only" htmlFor="synonym-normalized-term">
            Как ищут
          </label>
          <input
            id="synonym-normalized-term"
            name="normalizedTerm"
            placeholder="Как ищут"
            minLength={2}
            required
          />
          <label className="sr-only" htmlFor="synonym-canonical-term">
            Канонический запрос
          </label>
          <input
            id="synonym-canonical-term"
            name="canonicalTerm"
            placeholder="Канонический запрос"
            minLength={2}
            required
          />
          <FormButton pending={pending}>Добавить</FormButton>
        </form>
        <ul className="tag-list">
          {arrayFrom(synonymData.data).map((synonym) => (
            <li key={text(synonym.id)}>
              {text(synonym.normalizedTerm)} → <strong>{text(synonym.canonicalTerm)}</strong>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export function PromotionsWorkspace() {
  const { data, error, loading, reload } = useEndpoint('/api/v1/admin/promotions');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const items = arrayFrom(data);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') ?? '').trim();
    if (!title) return;
    setPending(true);
    setMessage(null);
    try {
      await adminMutation('/api/v1/admin/promotions', 'POST', {
        title,
        body: String(form.get('body') ?? '').trim() || undefined,
        startsAt: String(form.get('startsAt') ?? '') || undefined,
        endsAt: String(form.get('endsAt') ?? '') || undefined,
        active: form.get('active') === 'on',
        priority: Number(form.get('priority') ?? 0),
      });
      event.currentTarget.reset();
      reload();
      setMessage('Акция создана. Цены и скидки не затрагиваются без отдельного согласования с 1С.');
    } catch (reason: unknown) {
      setMessage(reason instanceof Error ? reason.message : 'Не удалось создать акцию.');
    } finally {
      setPending(false);
    }
  }

  async function toggle(item: ApiRecord) {
    setPending(true);
    setMessage(null);
    try {
      await adminMutation(`/api/v1/admin/promotions/${text(item.id)}`, 'PATCH', {
        expectedVersion: numberValue(item.version, 1),
        title: text(item.title, 'Акция'),
        active: item.active !== true,
      });
      reload();
      setMessage('Статус акции обновлён.');
    } catch (reason: unknown) {
      setMessage(reason instanceof Error ? reason.message : 'Не удалось обновить акцию.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Контент"
        title="Акции"
        description="Расписание, приоритет и публикация акций. Изменение коммерческой скидки ограничено сервером."
        action={<RefreshButton onClick={reload} busy={loading} />}
      />
      {error ? <Notice>{error}</Notice> : null}
      {message ? (
        <Notice
          kind={message.includes('создан') || message.includes('обновл') ? 'success' : 'error'}
        >
          {message}
        </Notice>
      ) : null}
      <div className="workspace-grid workspace-grid--two">
        <form className="panel-card form-grid" onSubmit={create}>
          <h2>Новая акция</h2>
          <label className="field">
            <span>Заголовок</span>
            <input name="title" maxLength={300} required />
          </label>
          <label className="field">
            <span>Текст</span>
            <textarea name="body" rows={5} maxLength={30000} />
          </label>
          <div className="form-split">
            <label className="field">
              <span>Начало</span>
              <input name="startsAt" type="datetime-local" />
            </label>
            <label className="field">
              <span>Окончание</span>
              <input name="endsAt" type="datetime-local" />
            </label>
          </div>
          <div className="checkbox-row">
            <label>
              <input name="active" type="checkbox" /> Активна
            </label>
            <label className="field field--compact">
              <span>Приоритет</span>
              <input name="priority" type="number" defaultValue="0" />
            </label>
          </div>
          <FormButton pending={pending}>Создать акцию</FormButton>
        </form>
        <section className="panel-card">
          <h2>Опубликованные и черновики</h2>
          {loading && !data ? <LoadingState /> : null}
          <ul className="stack-list">
            {items.map((item) => (
              <li key={text(item.id)}>
                <div>
                  <strong>{text(item.title)}</strong>
                  <span>{text(item.body)}</span>
                  <small>
                    {dateTime(item.startsAt)} — {dateTime(item.endsAt)}
                  </small>
                </div>
                <div className="stack-list__actions">
                  <StatusPill value={item.activeNow === true ? 'ACTIVE' : 'INACTIVE'} />
                  <button
                    type="button"
                    className="text-button"
                    disabled={pending}
                    onClick={() => void toggle(item)}
                  >
                    {item.active === true ? 'Снять с публикации' : 'Опубликовать'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {!loading && items.length === 0 ? <EmptyState>Акций пока нет.</EmptyState> : null}
        </section>
      </div>
    </>
  );
}

export function ContentWorkspace() {
  const banners = useEndpoint('/api/v1/admin/content/banners');
  const pages = useEndpoint('/api/v1/admin/content/pages');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function createBanner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') ?? '').trim();
    if (!title) return;
    setPending(true);
    try {
      await adminMutation('/api/v1/admin/content/banners', 'POST', {
        title,
        body: String(form.get('body') ?? '').trim() || undefined,
        linkUrl: String(form.get('linkUrl') ?? '').trim() || undefined,
        active: form.get('active') === 'on',
      });
      event.currentTarget.reset();
      banners.reload();
      setMessage('Баннер создан.');
    } catch (reason: unknown) {
      setMessage(reason instanceof Error ? reason.message : 'Не удалось создать баннер.');
    } finally {
      setPending(false);
    }
  }

  async function createPage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const slug = String(form.get('slug') ?? '').trim();
    const title = String(form.get('title') ?? '').trim();
    const body = String(form.get('body') ?? '').trim();
    if (!slug || !title || !body) return;
    setPending(true);
    try {
      await adminMutation('/api/v1/admin/content/pages', 'POST', {
        slug,
        title,
        body,
        published: form.get('published') === 'on',
      });
      event.currentTarget.reset();
      pages.reload();
      setMessage('Информационная страница создана.');
    } catch (reason: unknown) {
      setMessage(reason instanceof Error ? reason.message : 'Не удалось создать страницу.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Контент"
        title="Баннеры и страницы"
        description="Черновики, публикации и контентные страницы сайта. Запланированные баннеры автоматически выключаются после окончания периода."
        action={
          <RefreshButton
            onClick={() => {
              banners.reload();
              pages.reload();
            }}
            busy={banners.loading || pages.loading}
          />
        }
      />
      {message ? (
        <Notice kind={message.includes('создан') ? 'success' : 'error'}>{message}</Notice>
      ) : null}
      <div className="workspace-grid workspace-grid--two">
        <section className="panel-card">
          <h2>Баннеры</h2>
          <form className="form-grid" onSubmit={createBanner}>
            <label className="field">
              <span>Заголовок</span>
              <input name="title" required maxLength={300} />
            </label>
            <label className="field">
              <span>Текст</span>
              <textarea name="body" rows={3} />
            </label>
            <label className="field">
              <span>Ссылка</span>
              <input name="linkUrl" placeholder="/catalog или https://…" />
            </label>
            <label>
              <input name="active" type="checkbox" /> Активен
            </label>
            <FormButton pending={pending}>Создать баннер</FormButton>
          </form>
          <ul className="stack-list">
            {arrayFrom(banners.data).map((item) => (
              <li key={text(item.id)}>
                <strong>{text(item.title)}</strong>
                <span>{text(item.body)}</span>
                <small>
                  <StatusPill value={item.activeNow === true ? 'ACTIVE' : 'INACTIVE'} />
                </small>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel-card">
          <h2>Информационные страницы</h2>
          <form className="form-grid" onSubmit={createPage}>
            <label className="field">
              <span>Slug</span>
              <input name="slug" required pattern="[a-z0-9][a-z0-9-]*" placeholder="o-kompanii" />
            </label>
            <label className="field">
              <span>Заголовок</span>
              <input name="title" required maxLength={300} />
            </label>
            <label className="field">
              <span>Текст</span>
              <textarea name="body" required rows={5} />
            </label>
            <label>
              <input name="published" type="checkbox" /> Опубликовать
            </label>
            <FormButton pending={pending}>Создать страницу</FormButton>
          </form>
          <ul className="stack-list">
            {arrayFrom(pages.data).map((item) => (
              <li key={text(item.id)}>
                <strong>{text(item.title)}</strong>
                <span>/{text(item.slug)}</span>
                <small>
                  <StatusPill value={item.published === true ? 'PUBLISHED' : 'DRAFT'} />
                </small>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

export function IntegrationWorkspace() {
  const overview = useEndpoint('/api/v1/admin/integration/overview');
  const jobs = useEndpoint('/api/v1/admin/integration/jobs?limit=20');
  const errors = useEndpoint('/api/v1/admin/integration/errors?limit=10');
  const dlq = useEndpoint('/api/v1/admin/integration/dlq');
  const [message, setMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const counters = record(overview.data?.counters);

  async function retry(item: ApiRecord) {
    const reason = window.prompt('Укажите причину повторной постановки в очередь:');
    if (!reason?.trim()) return;
    const id = text(item.id, '');
    if (!id) return;
    setPendingId(id);
    try {
      const endpoint =
        item.kind === 'OUTBOX_EVENT'
          ? `/api/v1/admin/integration/outbox/${id}/retry`
          : `/api/v1/admin/integration/jobs/${id}/retry`;
      await adminMutation(endpoint, 'POST', { reason: reason.trim() });
      setMessage('Событие повторно поставлено в очередь; действие внесено в аудит.');
      jobs.reload();
      errors.reload();
      dlq.reload();
      overview.reload();
    } catch (reasonError: unknown) {
      setMessage(
        reasonError instanceof Error ? reasonError.message : 'Не удалось повторить событие.',
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Администрирование"
        title="Интеграция с 1С"
        description="Журнал обменов, безопасный DLQ retry, идентификаторы корреляции и расхождения без раскрытия полезной нагрузки."
        action={
          <RefreshButton
            onClick={() => {
              overview.reload();
              jobs.reload();
              errors.reload();
              dlq.reload();
            }}
            busy={overview.loading}
          />
        }
      />
      {message ? (
        <Notice kind={message.includes('поставлено') ? 'success' : 'error'}>{message}</Notice>
      ) : null}
      <section className="metric-grid">
        <article className="metric-card">
          <span>Импорт товаров</span>
          <strong>{text(counters?.importedProducts, '0')}</strong>
        </article>
        <article className="metric-card">
          <span>Обновлено цен</span>
          <strong>{text(counters?.updatedPrices, '0')}</strong>
        </article>
        <article className="metric-card">
          <span>Обновлено остатков</span>
          <strong>{text(counters?.updatedStock, '0')}</strong>
        </article>
        <article className="metric-card">
          <span>Ошибки</span>
          <strong>{text(counters?.unresolvedErrors, '0')}</strong>
        </article>
        <article className="metric-card">
          <span>Расхождения</span>
          <strong>{text(counters?.totalDiscrepancies, '0')}</strong>
        </article>
        <article className="metric-card">
          <span>DLQ</span>
          <strong>{text(counters?.dlq, '0')}</strong>
        </article>
      </section>
      <div className="workspace-grid workspace-grid--two">
        <section className="panel-card">
          <h2>Последние задания</h2>
          <ul className="stack-list">
            {arrayFrom(jobs.data).map((job) => (
              <li key={text(job.id)}>
                <strong>{text(job.eventType)}</strong>
                <span>
                  <StatusPill value={job.status} /> · попыток {text(job.attempts)}
                </span>
                <small>correlation: {text(job.correlationId)}</small>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel-card">
          <h2>Ошибки и расхождения</h2>
          <ul className="stack-list">
            {arrayFrom(errors.data).map((item) => (
              <li key={text(item.id)}>
                <strong>{text(item.code)}</strong>
                <span>{text(item.message)}</span>
                <small>
                  {dateTime(item.occurredAt)} · {text(item.externalEntityId)}
                </small>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section className="panel-card">
        <h2>Очередь DLQ</h2>
        <ul className="stack-list">
          {arrayFrom(dlq.data).map((item) => (
            <li key={`${text(item.kind)}-${text(item.id)}`}>
              <div>
                <strong>{text(item.eventType)}</strong>
                <span>
                  {text(item.lastErrorCode)} · {text(item.lastErrorMessage)}
                </span>
                <small>
                  message: {text(item.messageId)} · correlation: {text(item.correlationId)}
                </small>
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={pendingId === text(item.id)}
                onClick={() => void retry(item)}
              >
                {pendingId === text(item.id) ? (
                  <LoaderCircle className="spin" aria-hidden size={16} />
                ) : (
                  <RefreshCw aria-hidden size={16} />
                )}{' '}
                Повторить
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export function AuditWorkspace() {
  const { data, error, loading, reload } = useEndpoint('/api/v1/admin/audit?limit=100');
  const items = arrayFrom(data);
  return (
    <>
      <PageHeader
        eyebrow="Администрирование"
        title="Аудит"
        description="Неизменяемый журнал действий сотрудников и системы. Секреты и полезные нагрузки скрываются сервером."
        action={<RefreshButton onClick={reload} busy={loading} />}
      />
      {error ? <Notice>{error}</Notice> : null}
      {loading && !data ? <LoadingState /> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Время</th>
              <th>Действие</th>
              <th>Сущность</th>
              <th>Сотрудник</th>
              <th>Correlation ID</th>
              <th>Причина</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const actor = record(item.actor);
              return (
                <tr key={text(item.id)}>
                  <td>{dateTime(item.createdAt)}</td>
                  <td>{text(item.action)}</td>
                  <td>
                    {text(item.entityType)}
                    <small>{text(item.entityId)}</small>
                  </td>
                  <td>{text(actor?.name, text(actor?.email))}</td>
                  <td className="mono-cell">{text(item.correlationId)}</td>
                  <td>{text(item.reason)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!loading && items.length === 0 ? <EmptyState>Записей аудита пока нет.</EmptyState> : null}
    </>
  );
}
