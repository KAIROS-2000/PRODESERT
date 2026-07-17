export type ClassNameValue = string | false | null | undefined;

export const classNames = (...values: readonly ClassNameValue[]): string =>
  values.filter((value): value is string => typeof value === 'string').join(' ');
