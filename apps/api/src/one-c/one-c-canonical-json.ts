import { createHash } from 'node:crypto';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Produces a deterministic JSON representation for idempotency hashes.
 * Undefined object properties follow JSON.stringify semantics and are omitted.
 */
export function canonicalOneCJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Cannot canonicalize a non-finite number');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalOneCJson(item)).join(',')}]`;
  }
  if (isRecord(value)) {
    const properties = Object.keys(value)
      .sort()
      .flatMap((key) => {
        const property = value[key];
        return property === undefined
          ? []
          : [`${JSON.stringify(key)}:${canonicalOneCJson(property)}`];
      });
    return `{${properties.join(',')}}`;
  }
  throw new TypeError(`Cannot canonicalize value of type ${typeof value}`);
}

export function oneCPayloadHash(value: unknown): string {
  return createHash('sha256').update(canonicalOneCJson(value), 'utf8').digest('hex');
}
