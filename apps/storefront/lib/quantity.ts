function fractionLength(value: string): number {
  const normalized = value.replace(',', '.').trim();
  return normalized.includes('.') ? (normalized.split('.')[1]?.length ?? 0) : 0;
}

function parseScaled(value: string, scale: number): bigint | null {
  const normalized = value.replace(',', '.').trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;

  const [whole = '0', fraction = ''] = normalized.split('.');
  const paddedFraction = fraction.padEnd(scale, '0').slice(0, scale);
  return BigInt(`${whole}${paddedFraction}`);
}

function formatScaled(value: bigint, scale: number): string {
  if (scale === 0) return value.toString();

  const raw = value.toString().padStart(scale + 1, '0');
  const whole = raw.slice(0, -scale);
  const fraction = raw.slice(-scale).replace(/0+$/, '');
  return fraction.length > 0 ? `${whole}.${fraction}` : whole;
}

function scaledValues(values: readonly string[]) {
  const scale = Math.min(6, Math.max(...values.map(fractionLength)));
  const parsed = values.map((value) => parseScaled(value, scale));
  return parsed.every((value): value is bigint => value !== null) ? { scale, parsed } : null;
}

export function normalizeQuantity(value: string, minimum: string, multiple: string): string {
  const scaled = scaledValues([value, minimum, multiple]);
  if (!scaled) return minimum;

  const [candidate, min, step] = scaled.parsed;
  if (candidate === undefined || min === undefined || step === undefined || step <= 0n) {
    return minimum;
  }

  const bounded = candidate < min ? min : candidate;
  const snapped = ((bounded + step - 1n) / step) * step;
  return formatScaled(snapped, scaled.scale);
}

export function incrementQuantity(value: string, multiple: string): string {
  const scaled = scaledValues([value, multiple]);
  if (!scaled) return value;

  const [candidate, step] = scaled.parsed;
  if (candidate === undefined || step === undefined || step <= 0n) return value;
  return formatScaled(candidate + step, scaled.scale);
}

export function decrementQuantity(value: string, minimum: string, multiple: string): string {
  const scaled = scaledValues([value, minimum, multiple]);
  if (!scaled) return minimum;

  const [candidate, min, step] = scaled.parsed;
  if (candidate === undefined || min === undefined || step === undefined || step <= 0n) {
    return minimum;
  }
  return formatScaled(candidate - step < min ? min : candidate - step, scaled.scale);
}

export function quantitiesEqual(left: string, right: string): boolean {
  const scaled = scaledValues([left, right]);
  return scaled ? scaled.parsed[0] === scaled.parsed[1] : left === right;
}

export function quantityAsNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
