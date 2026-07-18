import type { AddCartItemInput, CartView, UpdateCartItemInput } from '@pro-dessert/contracts';

type ErrorPayload = {
  message?: unknown;
  error?: { message?: unknown } | string;
};

export class CartApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'CartApiError';
  }
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

function fallbackMessage(status: number): string {
  if (status === 400 || status === 422) {
    return 'Проверьте количество товара и попробуйте ещё раз.';
  }
  if (status === 401) return 'Сессия устарела. Обновите страницу и попробуйте ещё раз.';
  if (status === 404) return 'Товар больше не доступен. Корзина будет обновлена.';
  if (status === 409) return 'Данные корзины изменились. Обновите её и повторите действие.';
  if (status === 429) return 'Слишком много запросов. Подождите немного.';
  if (status >= 500) return 'Корзина временно недоступна. Попробуйте ещё раз позже.';
  return 'Не удалось обновить корзину. Попробуйте ещё раз.';
}

async function readJson(response: Response): Promise<unknown> {
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorFrom(response: Response, payload: unknown): CartApiError {
  const body = payload as ErrorPayload | null;
  const nested = typeof body?.error === 'object' ? body.error.message : body?.error;
  return new CartApiError(
    extractMessage(body?.message) ?? extractMessage(nested) ?? fallbackMessage(response.status),
    response.status,
  );
}

async function csrfToken(): Promise<string> {
  let response: Response;
  try {
    response = await fetch('/api/v1/auth/csrf', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new CartApiError('Не удалось подготовить защищённый запрос. Проверьте соединение.');
  }

  const payload = await readJson(response);
  if (!response.ok) throw errorFrom(response, payload);
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('csrfToken' in payload) ||
    typeof payload.csrfToken !== 'string'
  ) {
    throw new CartApiError('Не удалось подготовить защищённый запрос. Обновите страницу.');
  }
  return payload.csrfToken;
}

async function request<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: object } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') {
    headers['X-CSRF-Token'] = await csrfToken();
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'include',
      cache: 'no-store',
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new CartApiError('Не удалось связаться с корзиной. Проверьте соединение.');
  }

  if (response.status === 204) return undefined as T;
  const payload = await readJson(response);
  if (!response.ok) throw errorFrom(response, payload);
  return payload as T;
}

export function getCart(): Promise<CartView> {
  return request<CartView>('/cart');
}

export function addCartItem(input: AddCartItemInput): Promise<CartView> {
  return request<CartView>('/cart/items', { method: 'POST', body: input });
}

export function updateCartItem(itemId: string, input: UpdateCartItemInput): Promise<CartView> {
  return request<CartView>(`/cart/items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: input,
  });
}

export function deleteCartItem(itemId: string): Promise<void> {
  return request<void>(`/cart/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
}

export function deleteCart(): Promise<void> {
  return request<void>('/cart', { method: 'DELETE' });
}

export function mergeGuestCart(): Promise<CartView> {
  return request<CartView>('/cart/merge', { method: 'POST', body: {} });
}

export function validateCart(): Promise<CartView> {
  return request<CartView>('/cart/validate', { method: 'POST', body: {} });
}
