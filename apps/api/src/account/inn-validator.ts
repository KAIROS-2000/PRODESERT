const INN_10_WEIGHTS = [2, 4, 10, 3, 5, 9, 4, 6, 8] as const;
const INN_12_FIRST_WEIGHTS = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8] as const;
const INN_12_SECOND_WEIGHTS = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8] as const;

function checksum(digits: readonly number[], weights: readonly number[]): number {
  return (
    (weights.reduce((total, weight, index) => total + (digits[index] ?? 0) * weight, 0) % 11) % 10
  );
}

export function isValidInn(value: string): boolean {
  if (!/^(?:\d{10}|\d{12})$/.test(value)) return false;
  const digits = [...value].map(Number);

  if (digits.length === 10) {
    return checksum(digits, INN_10_WEIGHTS) === digits[9];
  }

  return (
    checksum(digits, INN_12_FIRST_WEIGHTS) === digits[10] &&
    checksum(digits, INN_12_SECOND_WEIGHTS) === digits[11]
  );
}
