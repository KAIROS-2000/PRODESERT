import { canonicalJson, canonicalJsonHash } from './canonical-json';

describe('canonical outbox JSON', () => {
  it('produces the same hash regardless of object key order', () => {
    expect(canonicalJsonHash({ orderId: '1', version: 2 })).toBe(
      canonicalJsonHash({ version: 2, orderId: '1' }),
    );
    expect(canonicalJson({ b: 2, a: [{ z: true, a: null }] })).toBe(
      '{"a":[{"a":null,"z":true}],"b":2}',
    );
  });
});
