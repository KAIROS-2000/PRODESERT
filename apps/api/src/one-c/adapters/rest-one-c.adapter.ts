import {
  type OneCAdapter,
  type OneCAdapterHealth,
  type OneCExchangeCursor,
  type OneCExportReceipt,
  type OneCImportPage,
  type OneCNormalizedItem,
  type OneCOrderStatusNotification,
  type OneCOrderStatusNotificationReceipt,
  type OneCStockConfirmationReceipt,
  type OneCStockConfirmationRequest,
} from './one-c-adapter';
import { type OneCExportOrderCommand } from '../export/order-export.mapper';

export type OneCFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface OneCRestAuthorizationRequest {
  readonly method: 'GET' | 'POST';
  readonly pathAndQuery: string;
  readonly rawBody: string;
}

export interface RestOneCAdapterOptions {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly retryDelaysMs?: readonly number[];
  readonly fetch?: OneCFetch;
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  readonly random?: () => number;
  readonly authorizationHeaders?: (
    request: OneCRestAuthorizationRequest,
  ) => Promise<Readonly<Record<string, string>>>;
}

export type OneCAdapterFailureKind =
  'TIMEOUT' | 'NETWORK' | 'RATE_LIMITED' | 'SERVER' | 'CLIENT' | 'PROTOCOL' | 'CANCELLED';

export class OneCAdapterRequestError extends Error {
  constructor(
    readonly kind: OneCAdapterFailureKind,
    readonly retryable: boolean,
    readonly httpStatus?: number,
    readonly retryAfterMs?: number,
  ) {
    super(`1C REST request failed (${kind})`);
    this.name = 'OneCAdapterRequestError';
  }
}

export function isRetryableOneCAdapterError(error: unknown): error is OneCAdapterRequestError {
  return error instanceof OneCAdapterRequestError && error.retryable;
}

const DEFAULT_RETRY_DELAYS_MS = [0, 5_000, 30_000, 120_000, 600_000, 1_800_000] as const;

export class RestOneCAdapter implements OneCAdapter {
  readonly kind = 'rest' as const;
  private readonly baseUrl: URL;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly retryDelaysMs: readonly number[];
  private readonly fetcher: OneCFetch;
  private readonly sleeper: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  private readonly random: () => number;

  constructor(private readonly options: RestOneCAdapterOptions) {
    this.baseUrl = new URL(options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`);
    if (!['http:', 'https:'].includes(this.baseUrl.protocol)) {
      throw new TypeError('1C REST base URL must use HTTP(S)');
    }
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.sleeper = options.sleep ?? sleepWithSignal;
    this.random = options.random ?? Math.random;
    if (
      !Number.isInteger(this.timeoutMs) ||
      this.timeoutMs < 1 ||
      !Number.isInteger(this.maxAttempts) ||
      this.maxAttempts < 1
    ) {
      throw new TypeError('1C REST timeout and maxAttempts must be positive integers');
    }
  }

  async health(signal?: AbortSignal): Promise<OneCAdapterHealth> {
    const startedAt = Date.now();
    try {
      await this.request('GET', 'health', '', signal);
      return {
        status: 'healthy',
        adapter: this.kind,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
      };
    } catch (error: unknown) {
      return {
        status: isRetryableOneCAdapterError(error) ? 'unavailable' : 'degraded',
        adapter: this.kind,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  pullCatalog(
    cursor: OneCExchangeCursor,
    signal?: AbortSignal,
  ): Promise<OneCImportPage<OneCNormalizedItem>> {
    return this.pull('catalog', cursor, signal);
  }

  pullPrices(
    cursor: OneCExchangeCursor,
    signal?: AbortSignal,
  ): Promise<OneCImportPage<OneCNormalizedItem>> {
    return this.pull('prices', cursor, signal);
  }

  pullInventory(
    cursor: OneCExchangeCursor,
    signal?: AbortSignal,
  ): Promise<OneCImportPage<OneCNormalizedItem>> {
    return this.pull('inventory', cursor, signal);
  }

  pullOrderEvents(
    cursor: OneCExchangeCursor,
    signal?: AbortSignal,
  ): Promise<OneCImportPage<OneCNormalizedItem>> {
    return this.pull('orders/events', cursor, signal);
  }

  async pushOrder(
    command: OneCExportOrderCommand,
    signal?: AbortSignal,
  ): Promise<OneCExportReceipt> {
    const rawBody = JSON.stringify(command);
    const value = await this.request('POST', 'orders', rawBody, signal, {
      'content-type': 'application/json; charset=utf-8',
      'idempotency-key': command.idempotencyKey,
      'x-correlation-id': command.correlationId,
    });
    if (!isRecord(value)) {
      throw new OneCAdapterRequestError('PROTOCOL', false);
    }
    if (
      typeof value.externalOrderId !== 'string' ||
      value.externalOrderId.trim().length === 0 ||
      typeof value.acceptedAt !== 'string' ||
      Number.isNaN(Date.parse(value.acceptedAt)) ||
      (value.sourceRevision !== null && typeof value.sourceRevision !== 'string')
    ) {
      throw new OneCAdapterRequestError('PROTOCOL', false);
    }
    return {
      externalOrderId: value.externalOrderId,
      acceptedAt: value.acceptedAt,
      sourceRevision: value.sourceRevision,
    };
  }

  async requestStockConfirmation(
    command: OneCStockConfirmationRequest,
    signal?: AbortSignal,
  ): Promise<OneCStockConfirmationReceipt> {
    const rawBody = JSON.stringify(command);
    const value = await this.request('POST', 'orders/stock-confirmation', rawBody, signal, {
      'content-type': 'application/json; charset=utf-8',
      'idempotency-key': command.idempotencyKey,
      'x-correlation-id': command.correlationId,
    });
    if (
      !isRecord(value) ||
      typeof value.requestId !== 'string' ||
      value.requestId.trim().length === 0 ||
      typeof value.acceptedAt !== 'string' ||
      Number.isNaN(Date.parse(value.acceptedAt)) ||
      (value.sourceRevision !== null && typeof value.sourceRevision !== 'string')
    ) {
      throw new OneCAdapterRequestError('PROTOCOL', false);
    }
    return {
      requestId: value.requestId,
      acceptedAt: value.acceptedAt,
      sourceRevision: value.sourceRevision,
    };
  }

  async publishOrderStatus(
    command: OneCOrderStatusNotification,
    signal?: AbortSignal,
  ): Promise<OneCOrderStatusNotificationReceipt> {
    const rawBody = JSON.stringify(command);
    const value = await this.request('POST', 'orders/status-events', rawBody, signal, {
      'content-type': 'application/json; charset=utf-8',
      'idempotency-key': command.idempotencyKey,
      'x-correlation-id': command.correlationId,
    });
    if (
      !isRecord(value) ||
      typeof value.requestId !== 'string' ||
      value.requestId.trim().length === 0 ||
      typeof value.acceptedAt !== 'string' ||
      Number.isNaN(Date.parse(value.acceptedAt)) ||
      (value.sourceRevision !== null && typeof value.sourceRevision !== 'string')
    ) {
      throw new OneCAdapterRequestError('PROTOCOL', false);
    }
    return {
      requestId: value.requestId,
      acceptedAt: value.acceptedAt,
      sourceRevision: value.sourceRevision,
    };
  }

  private async pull(
    path: string,
    cursor: OneCExchangeCursor,
    signal?: AbortSignal,
  ): Promise<OneCImportPage<OneCNormalizedItem>> {
    const query = cursor.value === null ? '' : `?cursor=${encodeURIComponent(cursor.value)}`;
    const value = await this.request('GET', `${path}${query}`, '', signal);
    if (
      !isRecord(value) ||
      !Array.isArray(value.items) ||
      (value.nextCursor !== null && typeof value.nextCursor !== 'string') ||
      typeof value.sourceRevision !== 'string'
    ) {
      throw new OneCAdapterRequestError('PROTOCOL', false);
    }
    const items = value.items.map((item) => {
      if (!isRecord(item)) {
        throw new OneCAdapterRequestError('PROTOCOL', false);
      }
      return item;
    });
    return {
      items,
      nextCursor: value.nextCursor,
      sourceRevision: value.sourceRevision,
    };
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    rawBody: string,
    signal?: AbortSignal,
    baseHeaders: Readonly<Record<string, string>> = {},
  ): Promise<unknown> {
    const url = new URL(path, this.baseUrl);
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        return await this.singleRequest(method, url, rawBody, signal, baseHeaders);
      } catch (error: unknown) {
        if (!isRetryableOneCAdapterError(error) || attempt === this.maxAttempts) {
          throw error;
        }
        const configuredDelay =
          this.retryDelaysMs[Math.min(attempt - 1, this.retryDelaysMs.length - 1)] ?? 0;
        const jitteredDelay = Math.floor(configuredDelay * this.random());
        await this.sleeper(error.retryAfterMs ?? jitteredDelay, signal);
      }
    }
    throw new OneCAdapterRequestError('PROTOCOL', false);
  }

  private async singleRequest(
    method: 'GET' | 'POST',
    url: URL,
    rawBody: string,
    externalSignal: AbortSignal | undefined,
    baseHeaders: Readonly<Record<string, string>>,
  ): Promise<unknown> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const cancel = (): void => controller.abort(externalSignal?.reason);
    externalSignal?.addEventListener('abort', cancel, { once: true });

    try {
      if (externalSignal?.aborted) {
        throw new OneCAdapterRequestError('CANCELLED', false);
      }
      const pathAndQuery = `${url.pathname}${url.search}`;
      const authorizationHeaders =
        (await this.options.authorizationHeaders?.({ method, pathAndQuery, rawBody })) ?? {};
      const response = await this.fetcher(url.toString(), {
        method,
        headers: { accept: 'application/json', ...baseHeaders, ...authorizationHeaders },
        ...(method === 'POST' ? { body: rawBody } : {}),
        signal: controller.signal,
      });
      if (!response.ok) {
        const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
        void response.body?.cancel();
        if (response.status === 429) {
          throw new OneCAdapterRequestError('RATE_LIMITED', true, response.status, retryAfterMs);
        }
        if (response.status >= 500) {
          throw new OneCAdapterRequestError('SERVER', true, response.status, retryAfterMs);
        }
        throw new OneCAdapterRequestError('CLIENT', false, response.status);
      }
      if (response.status === 204) {
        return null;
      }
      try {
        return (await response.json()) as unknown;
      } catch {
        throw new OneCAdapterRequestError('PROTOCOL', false, response.status);
      }
    } catch (error: unknown) {
      if (error instanceof OneCAdapterRequestError) {
        throw error;
      }
      if (externalSignal?.aborted) {
        throw new OneCAdapterRequestError('CANCELLED', false);
      }
      throw new OneCAdapterRequestError(timedOut ? 'TIMEOUT' : 'NETWORK', true);
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', cancel);
    }
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  if (/^\d+$/.test(value)) {
    return Math.min(Number(value) * 1_000, 1_800_000);
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.min(Math.max(0, date - Date.now()), 1_800_000);
}

function sleepWithSignal(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new OneCAdapterRequestError('CANCELLED', false));
      return;
    }
    const complete = (): void => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    };
    const timer = setTimeout(complete, milliseconds);
    const cancel = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      reject(new OneCAdapterRequestError('CANCELLED', false));
    };
    signal?.addEventListener('abort', cancel, { once: true });
  });
}
