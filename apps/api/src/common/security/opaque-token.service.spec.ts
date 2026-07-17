import { OpaqueTokenService } from './opaque-token.service';

describe('OpaqueTokenService', () => {
  const service = new OpaqueTokenService();

  it('creates a raw token and only exposes a deterministic hash for storage', () => {
    const token = service.generate();

    expect(token.raw).toHaveLength(43);
    expect(token.hash).toHaveLength(64);
    expect(token.hash).not.toBe(token.raw);
    expect(service.hash(token.raw)).toBe(token.hash);
  });

  it('creates unique tokens', () => {
    expect(service.generate().hash).not.toBe(service.generate().hash);
  });
});
