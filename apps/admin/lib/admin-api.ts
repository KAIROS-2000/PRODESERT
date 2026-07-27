'use client';

import { csrfFetch } from './csrf-client';

export type ApiRecord = Record<string, unknown>;

export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function messageFromPayload(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback;
  if (typeof payload.message === 'string') return payload.message;
  if (isRecord(payload.error) && typeof payload.error.message === 'string') {
    return payload.error.message;
  }
  return fallback;
}

export async function adminGet<T = ApiRecord>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new AdminApiError(messageFromPayload(payload, 'Не удалось загрузить данные.'), response.status);
  }
  return payload as T;
}

export async function adminMutation<T = ApiRecord>(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const response = await csrfFetch(path, {
    method,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 204) return {} as T;
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new AdminApiError(messageFromPayload(payload, 'Операция не выполнена.'), response.status);
  }
  return payload as T;
}

export function record(value: unknown): ApiRecord | null {
  return isRecord(value) ? value : null;
}

export function records(value: unknown): ApiRecord[] {
  return Array.isArray(value) ? value.flatMap((item) => (isRecord(item) ? [item] : [])) : [];
}

export function text(value: unknown, fallback = '—'): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return fallback;
}

export function dateTime(value: unknown): string {
  if (typeof value !== 'string') return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
