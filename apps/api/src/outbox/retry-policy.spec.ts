import { IntegrationDispatchError, retryDecision } from './retry-policy';

describe('outbox retry policy', () => {
  it('uses full jitter for transient errors', () => {
    expect(
      retryDecision(
        new IntegrationDispatchError('INTEGRATION_NETWORK_ERROR', true),
        2,
        6,
        () => 0.5,
      ),
    ).toEqual({
      retry: true,
      delayMs: 15_000,
      code: 'INTEGRATION_NETWORK_ERROR',
    });
  });

  it('retries known transient database failures but not arbitrary TypeErrors', () => {
    expect(retryDecision({ code: 'P2034' }, 1, 6, () => 0)).toEqual({
      retry: true,
      delayMs: 0,
      code: 'DATABASE_P2034',
    });
    expect(retryDecision(new TypeError('programming error'), 1, 6)).toEqual({
      retry: false,
      delayMs: 0,
      code: 'INTEGRATION_PERMANENT_ERROR',
    });
  });

  it('does not retry permanent contract errors', () => {
    expect(retryDecision(new IntegrationDispatchError('TOTAL_MISMATCH', false), 1, 6)).toEqual({
      retry: false,
      delayMs: 0,
      code: 'TOTAL_MISMATCH',
    });
  });

  it('moves a transient error to DLQ after the configured attempt budget', () => {
    expect(retryDecision(new IntegrationDispatchError('ONE_C_UNAVAILABLE', true), 6, 6)).toEqual({
      retry: false,
      delayMs: 0,
      code: 'ONE_C_UNAVAILABLE',
    });
  });
});
