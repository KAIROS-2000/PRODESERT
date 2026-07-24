const RETRY_CEILINGS_MS = [0, 5_000, 30_000, 120_000, 600_000, 1_800_000] as const;
const TRANSIENT_PRISMA_CODES = new Set(['P1001', 'P1008', 'P1017', 'P2002', 'P2024', 'P2034']);

export class IntegrationDispatchError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    message = code,
  ) {
    super(message);
    this.name = 'IntegrationDispatchError';
  }
}

export interface RetryDecision {
  readonly retry: boolean;
  readonly delayMs: number;
  readonly code: string;
}

export function retryDecision(
  error: unknown,
  nextAttempt: number,
  maxAttempts: number,
  random: () => number = Math.random,
): RetryDecision {
  const classified = classifyIntegrationError(error);
  if (!classified.retryable || nextAttempt >= maxAttempts) {
    return { retry: false, delayMs: 0, code: classified.code };
  }
  const ceiling =
    RETRY_CEILINGS_MS[Math.min(nextAttempt, RETRY_CEILINGS_MS.length - 1)] ??
    RETRY_CEILINGS_MS.at(-1) ??
    0;
  return {
    retry: true,
    delayMs: Math.floor(Math.max(0, Math.min(1, random())) * ceiling),
    code: classified.code,
  };
}

export function classifyIntegrationError(error: unknown): {
  readonly code: string;
  readonly retryable: boolean;
} {
  if (error instanceof IntegrationDispatchError) {
    return { code: error.code, retryable: error.retryable };
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'INTEGRATION_TIMEOUT', retryable: true };
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    TRANSIENT_PRISMA_CODES.has((error as { code: string }).code)
  ) {
    return {
      code: `DATABASE_${(error as { code: string }).code}`,
      retryable: true,
    };
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
  ) {
    const status = (error as { status: number }).status;
    return {
      code: `INTEGRATION_HTTP_${status}`,
      retryable: status === 429 || status >= 500,
    };
  }
  return { code: 'INTEGRATION_PERMANENT_ERROR', retryable: false };
}
