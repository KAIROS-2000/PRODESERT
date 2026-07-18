import type {
  CheckoutInput,
  CheckoutValidationResult,
  OrderCreatedView,
  PublicOrderView,
} from '@pro-dessert/contracts';

export class CheckoutApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'CheckoutApiError';
    this.status = status;
  }
}

const requestTimeoutMs = 12_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function extractMessage(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const messages = value.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
    return messages.length > 0 ? messages.join(' ') : null;
  }
  return null;
}

async function readJson(response: Response): Promise<unknown> {
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function fallbackMessage(status: number): string {
  if (status === 400 || status === 422) return 'Проверьте заполнение формы.';
  if (status === 401 || status === 403) return 'Нет доступа к информации об этом заказе.';
  if (status === 404) return 'Заказ не найден или доступ к нему больше не действует.';
  if (status === 409) return 'Данные заказа изменились. Проверьте форму и повторите попытку.';
  if (status === 429) return 'Слишком много запросов. Подождите немного и повторите попытку.';
  if (status >= 500) return 'Сервис временно недоступен. Повторите попытку позже.';
  return 'Не удалось выполнить запрос. Повторите попытку.';
}

function errorFromBody(body: unknown, status: number): CheckoutApiError {
  const record = asRecord(body);
  const nested = asRecord(record?.error);
  const message =
    extractMessage(record?.message) ?? extractMessage(nested?.message) ?? fallbackMessage(status);
  return new CheckoutApiError(message, status);
}

async function getCsrfToken(): Promise<string> {
  const response = await fetch('/api/v1/auth/csrf', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  const body = await readJson(response);
  const token = asRecord(body)?.csrfToken;

  if (!response.ok || typeof token !== 'string' || token.length === 0) {
    throw errorFromBody(body, response.status || 500);
  }
  return token;
}

async function postCheckout<TResult>(
  endpoint: string,
  input: CheckoutInput,
  idempotencyKey?: string,
): Promise<TResult> {
  const csrfToken = await getCsrfToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken,
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const response = await fetch(`/api/v1${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers,
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  const body = await readJson(response);
  if (!response.ok) throw errorFromBody(body, response.status);
  return body as TResult;
}

export function validateCheckout(input: CheckoutInput): Promise<CheckoutValidationResult> {
  return postCheckout('/checkout/validate', input);
}

export function createOrder(
  input: CheckoutInput,
  idempotencyKey: string,
): Promise<OrderCreatedView> {
  return postCheckout('/orders', input, idempotencyKey);
}

export async function getPublicOrder(
  publicNumber: string,
  accessToken: string | null,
): Promise<PublicOrderView> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`/api/v1/orders/public/${encodeURIComponent(publicNumber)}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers,
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  const body = await readJson(response);
  if (!response.ok) throw errorFromBody(body, response.status);
  return body as PublicOrderView;
}

export function getCheckoutErrorMessage(error: unknown): string {
  if (error instanceof CheckoutApiError) return error.message;
  if (
    error instanceof DOMException &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  ) {
    return 'Ответ магазина занял слишком много времени. Повторите попытку — тот же заказ не будет создан дважды.';
  }
  if (error instanceof TypeError) {
    return 'Связь с магазином прервалась. Проверьте соединение и повторите попытку — новый заказ не будет создан дважды.';
  }
  return 'Произошла непредвиденная ошибка. Повторите попытку.';
}
