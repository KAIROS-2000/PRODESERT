import { type CatalogAvailability as Availability } from '@pro-dessert/contracts';

const LOW_STOCK_THRESHOLD = 5;

export function classifyAvailability(available: number, allowBackorder: boolean): Availability {
  if (available > LOW_STOCK_THRESHOLD) return 'IN_STOCK';
  if (available > 0) return 'LOW_STOCK';
  if (allowBackorder) return 'BACKORDER';
  return 'OUT_OF_STOCK';
}

export interface StructuredAttributeFilter {
  code: string;
  value: string;
}

const ATTRIBUTE_CODE = /^[a-z0-9][a-z0-9_-]{0,98}$/;

export function parseAttributeFilters(
  rawFilters: readonly string[] | undefined,
): StructuredAttributeFilter[] {
  if (!rawFilters) return [];

  const unique = new Map<string, StructuredAttributeFilter>();
  for (const rawFilter of rawFilters) {
    const separator = rawFilter.indexOf(':');
    if (separator <= 0) continue;
    const code = rawFilter.slice(0, separator).trim().toLowerCase();
    const value = rawFilter
      .slice(separator + 1)
      .trim()
      .normalize('NFKC')
      .toLowerCase();
    if (!ATTRIBUTE_CODE.test(code) || value.length === 0 || value.length > 300) continue;
    unique.set(`${code}:${value}`, { code, value });
  }
  return [...unique.values()];
}

export function normalizeCatalogQuery(value: string): string {
  return value.trim().normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();
}

const RU_TO_LATIN: Readonly<Record<string, string>> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

const LATIN_TO_RU: readonly (readonly [string, string])[] = [
  ['shch', 'щ'],
  ['sch', 'щ'],
  ['zh', 'ж'],
  ['kh', 'х'],
  ['ts', 'ц'],
  ['ch', 'ч'],
  ['sh', 'ш'],
  ['yo', 'ё'],
  ['yu', 'ю'],
  ['ya', 'я'],
  ['a', 'а'],
  ['b', 'б'],
  ['v', 'в'],
  ['g', 'г'],
  ['d', 'д'],
  ['e', 'е'],
  ['z', 'з'],
  ['i', 'и'],
  ['y', 'й'],
  ['k', 'к'],
  ['l', 'л'],
  ['m', 'м'],
  ['n', 'н'],
  ['o', 'о'],
  ['p', 'п'],
  ['r', 'р'],
  ['s', 'с'],
  ['t', 'т'],
  ['u', 'у'],
  ['f', 'ф'],
  ['h', 'х'],
  ['c', 'к'],
  ['j', 'ж'],
  ['q', 'к'],
  ['w', 'в'],
  ['x', 'кс'],
];

function transliterateRussian(value: string): string {
  return [...value].map((character) => RU_TO_LATIN[character] ?? character).join('');
}

function transliterateLatin(value: string): string {
  let result = '';
  for (let index = 0; index < value.length;) {
    const match = LATIN_TO_RU.find(([latin]) => value.startsWith(latin, index));
    if (match) {
      result += match[1];
      index += match[0].length;
    } else {
      result += value[index] ?? '';
      index += 1;
    }
  }
  return result;
}

export function buildSearchTermVariants(value: string): string[] {
  const normalized = normalizeCatalogQuery(value);
  if (!normalized) return [];
  const values = new Set<string>([normalized]);
  const compact = normalized.replace(/[\s-]+/g, '');
  if (compact) values.add(compact);
  if (/[а-яё]/i.test(normalized)) {
    const latin = transliterateRussian(normalized);
    values.add(latin);
    values.add(latin.replace(/[\s-]+/g, ''));
  }
  if (/[a-z]/i.test(normalized)) {
    const russian = transliterateLatin(normalized);
    values.add(russian);
    values.add(russian.replace(/[\s-]+/g, ''));
  }
  return [...values].filter(Boolean);
}
