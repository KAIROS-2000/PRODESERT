type CsrfPayload = { csrfToken?: unknown };

export async function csrfFetch(input: string, init: RequestInit): Promise<Response> {
  const tokenResponse = await fetch('/api/v1/auth/csrf', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const payload = (await tokenResponse.json().catch(() => null)) as CsrfPayload | null;
  if (!tokenResponse.ok || typeof payload?.csrfToken !== 'string') {
    throw new Error('CSRF bootstrap failed');
  }

  const headers = new Headers(init.headers);
  headers.set('X-CSRF-Token', payload.csrfToken);
  return fetch(input, { ...init, credentials: 'include', headers });
}
