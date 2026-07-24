import { OneCAdapterRequestError, RestOneCAdapter, type OneCFetch } from './rest-one-c.adapter';

describe('RestOneCAdapter retry classification', () => {
  it('retries 429 and honors Retry-After without exposing the response body', async () => {
    let calls = 0;
    const waits: number[] = [];
    const fetcher: OneCFetch = async () => {
      calls += 1;
      if (calls === 1) {
        return new Response('sensitive upstream body', {
          status: 429,
          headers: { 'Retry-After': '1' },
        });
      }
      return Response.json({ items: [], nextCursor: null, sourceRevision: '2' });
    };
    const adapter = new RestOneCAdapter({
      baseUrl: 'https://one-c.example.test/api/v1/',
      fetch: fetcher,
      maxAttempts: 2,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
      },
    });

    await expect(adapter.pullInventory({ value: '1' })).resolves.toEqual({
      items: [],
      nextCursor: null,
      sourceRevision: '2',
    });
    expect(calls).toBe(2);
    expect(waits).toEqual([1_000]);
  });

  it('does not retry business/client validation errors', async () => {
    let calls = 0;
    const fetcher: OneCFetch = async () => {
      calls += 1;
      return Response.json({ error: 'private details' }, { status: 422 });
    };
    const adapter = new RestOneCAdapter({
      baseUrl: 'https://one-c.example.test/',
      fetch: fetcher,
      maxAttempts: 3,
      sleep: async () => undefined,
    });

    try {
      await adapter.pullPrices({ value: null });
      throw new Error('expected a non-retryable client error');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(OneCAdapterRequestError);
      expect(error).toMatchObject({ kind: 'CLIENT', retryable: false, httpStatus: 422 });
      expect(error instanceof Error ? error.message : '').not.toContain('private details');
    }
    expect(calls).toBe(1);
  });

  it('classifies an adapter deadline as retryable timeout', async () => {
    const fetcher: OneCFetch = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true },
        );
      });
    const adapter = new RestOneCAdapter({
      baseUrl: 'https://one-c.example.test/',
      fetch: fetcher,
      timeoutMs: 5,
      maxAttempts: 1,
    });

    await expect(adapter.pullCatalog({ value: null })).rejects.toMatchObject({
      kind: 'TIMEOUT',
      retryable: true,
    });
  });
});
