export class AuthApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
  }
}

type ErrorBody = {
  message?: unknown;
  error?: { message?: unknown };
};

function extractMessage(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const messages = value.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
    return messages.length > 0 ? messages.join(' ') : null;
  }
  return null;
}

function fallbackMessage(status: number): string {
  if (status === 401) return 'Проверьте email и пароль.';
  if (status === 403) return 'Для этого действия недостаточно прав.';
  if (status === 409) return 'Эти данные уже используются. Проверьте введённые значения.';
  if (status === 422 || status === 400) return 'Проверьте заполнение формы.';
  if (status === 429) return 'Слишком много попыток. Подождите немного и попробуйте снова.';
  if (status >= 500) return 'Сервис временно недоступен. Попробуйте позже.';
  return 'Не удалось выполнить запрос. Попробуйте ещё раз.';
}

async function readBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function getCsrfToken(): Promise<string> {
  const response = await fetch('/api/v1/auth/csrf', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const body = await readBody(response);
  if (
    !response.ok ||
    typeof body !== 'object' ||
    body === null ||
    !('csrfToken' in body) ||
    typeof body.csrfToken !== 'string'
  ) {
    throw new AuthApiError('Не удалось подготовить защищённый запрос.', response.status);
  }
  return body.csrfToken;
}

export async function postAuth<TPayload extends object, TResult = unknown>(
  endpoint: string,
  payload: TPayload,
): Promise<TResult> {
  const csrfToken = await getCsrfToken();
  const response = await fetch(`/api/v1${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify(payload),
  });

  const body = await readBody(response);
  if (!response.ok) {
    const errorBody = body as ErrorBody | null;
    const message =
      extractMessage(errorBody?.message) ??
      extractMessage(errorBody?.error?.message) ??
      fallbackMessage(response.status);
    throw new AuthApiError(message, response.status);
  }

  return body as TResult;
}

export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof AuthApiError) return error.message;
  if (error instanceof TypeError) {
    return 'Не удалось связаться с сервисом. Проверьте соединение и попробуйте снова.';
  }
  return 'Произошла непредвиденная ошибка. Попробуйте ещё раз.';
}

export function notifyAuthChanged(): void {
  window.dispatchEvent(new Event('pro-dessert:auth-changed'));
}
