import type {
  AccountOrderDetail,
  AccountOrdersOverview,
  AccountOrdersPage,
  AccountNotificationPreferences,
  AccountOrganization,
  AccountProfile,
  AccountSession,
  ChangePasswordInput,
  ConfirmEmailChangeInput,
  CreateOrganizationInput,
  RepeatOrderPreview,
  RepeatOrderResult,
  RequestEmailChangeInput,
  SessionRevocationResult,
  UpdateAccountProfileInput,
  UpdateNotificationPreferencesInput,
  UpdateOrganizationInput,
} from '@pro-dessert/contracts';

export class AccountApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = 'AccountApiError';
    this.status = status;
    this.code = code;
  }
}

type ApiErrorBody = {
  code?: unknown;
  message?: unknown;
  error?: { code?: unknown; message?: unknown };
};

function text(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const parts = value.filter(
      (item): item is string => typeof item === 'string' && item.trim() !== '',
    );
    return parts.length > 0 ? parts.join(' ') : null;
  }
  return null;
}

function fallback(status: number): string {
  if (status === 401) return 'Войдите, чтобы открыть личный кабинет.';
  if (status === 403) return 'Это действие недоступно для текущего профиля.';
  if (status === 404) return 'Запрошенные данные не найдены.';
  if (status === 409) return 'Данные изменились. Обновите страницу и повторите действие.';
  if (status === 422 || status === 400) return 'Проверьте введённые данные.';
  if (status === 429) return 'Слишком много запросов. Попробуйте немного позже.';
  if (status >= 500) return 'Личный кабинет временно недоступен.';
  return 'Не удалось выполнить запрос.';
}

async function json(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) return undefined;
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function csrfToken(): Promise<string> {
  const response = await fetch('/api/v1/auth/csrf', {
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const body = await json(response);
  if (
    !response.ok ||
    typeof body !== 'object' ||
    body === null ||
    !('csrfToken' in body) ||
    typeof body.csrfToken !== 'string'
  ) {
    throw new AccountApiError('Не удалось подготовить защищённый запрос.', response.status);
  }
  return body.csrfToken;
}

async function accountRequest<TResult>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: object;
    idempotencyKey?: string;
  } = {},
): Promise<TResult> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') headers['X-CSRF-Token'] = await csrfToken();
  if (options.body) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers,
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const body = await json(response);
  if (!response.ok) {
    const error = body as ApiErrorBody | undefined;
    const code =
      text(error?.code) ?? text(error?.error?.code) ?? response.headers.get('x-error-code');
    throw new AccountApiError(
      text(error?.message) ?? text(error?.error?.message) ?? fallback(response.status),
      response.status,
      code,
    );
  }
  return body as TResult;
}

export const getAccountProfile = () => accountRequest<AccountProfile>('/account/profile');
export const updateAccountProfile = (input: UpdateAccountProfileInput) =>
  accountRequest<AccountProfile>('/account/profile', { method: 'PATCH', body: input });
export const requestAccountEmailChange = (input: RequestEmailChangeInput) =>
  accountRequest<{ message: string }>('/account/profile/email-change', {
    method: 'POST',
    body: input,
  });
export const confirmAccountEmailChange = (input: ConfirmEmailChangeInput) =>
  accountRequest<AccountProfile>('/account/profile/email-change/confirm', {
    method: 'POST',
    body: input,
  });
export const changeAccountPassword = (input: ChangePasswordInput) =>
  accountRequest<{ message: string }>('/account/profile/password', {
    method: 'POST',
    body: input,
  });

export const getAccountOrganizations = () =>
  accountRequest<AccountOrganization[]>('/account/organizations');
export const createAccountOrganization = (input: CreateOrganizationInput) =>
  accountRequest<AccountOrganization>('/account/organizations', { method: 'POST', body: input });
export const updateAccountOrganization = (organizationId: string, input: UpdateOrganizationInput) =>
  accountRequest<AccountOrganization>(
    `/account/organizations/${encodeURIComponent(organizationId)}`,
    { method: 'PATCH', body: input },
  );
export const deleteAccountOrganization = (organizationId: string, expectedVersion: number) =>
  accountRequest<void>(
    `/account/organizations/${encodeURIComponent(organizationId)}?expectedVersion=${expectedVersion}`,
    { method: 'DELETE' },
  );

export const getAccountNotificationPreferences = () =>
  accountRequest<AccountNotificationPreferences>('/account/notification-preferences');
export const updateAccountNotificationPreferences = (input: UpdateNotificationPreferencesInput) =>
  accountRequest<AccountNotificationPreferences>('/account/notification-preferences', {
    method: 'PATCH',
    body: input,
  });

export const getAccountSessions = () => accountRequest<AccountSession[]>('/account/sessions');
export const revokeAccountSession = (sessionId: string) =>
  accountRequest<SessionRevocationResult>(`/account/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
export const revokeOtherAccountSessions = () =>
  accountRequest<{ revokedCount: number }>('/account/sessions', { method: 'DELETE' });

export const getAccountOverview = () => accountRequest<AccountOrdersOverview>('/account/overview');
export const getAccountOrders = (page = 1, limit = 20) =>
  accountRequest<AccountOrdersPage>(`/account/orders?page=${page}&limit=${limit}`);
export const getAccountOrder = (publicNumber: string) =>
  accountRequest<AccountOrderDetail>(`/account/orders/${encodeURIComponent(publicNumber)}`);
export const previewRepeatOrder = (publicNumber: string) =>
  accountRequest<RepeatOrderPreview>(
    `/account/orders/${encodeURIComponent(publicNumber)}/repeat/preview`,
  );
export const repeatOrder = (publicNumber: string, idempotencyKey: string) =>
  accountRequest<RepeatOrderResult>(`/account/orders/${encodeURIComponent(publicNumber)}/repeat`, {
    method: 'POST',
    idempotencyKey,
  });

export function getAccountErrorMessage(error: unknown): string {
  if (error instanceof AccountApiError) return error.message;
  if (error instanceof TypeError) return 'Не удалось связаться с сервисом.';
  return 'Произошла непредвиденная ошибка.';
}
