import { type OneCProduct } from './one-c-catalog.types';

export type OneCAttribute = OneCProduct['attributes'][number];

export interface AttributeAssignmentColumns {
  readonly valueId: string | null;
  readonly textValue: string | null;
  readonly numericValue: number | null;
  readonly booleanValue: boolean | null;
}

export function compareCatalogSourceVersions(left: string, right: string): number {
  return left.localeCompare(right, 'en', { numeric: true, sensitivity: 'base' });
}

export class StaleCatalogVersionError extends Error {
  constructor(
    readonly incomingVersion: string,
    readonly currentVersion: string,
    readonly projectionKey: string,
  ) {
    super(`stale_catalog_version:${incomingVersion}:${currentVersion}:${projectionKey}`);
    this.name = 'StaleCatalogVersionError';
  }
}

export class EqualCatalogVersionConflictError extends Error {
  constructor(
    readonly incomingVersion: string,
    readonly projectionKey: string,
  ) {
    super(`equal_catalog_version_payload_conflict:${incomingVersion}:${projectionKey}`);
    this.name = 'EqualCatalogVersionConflictError';
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function catalogProjectionsEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

/**
 * Enforces monotonic 1C projection revisions. An equal revision is idempotent only
 * when the projection payload is byte-for-byte equivalent after canonicalization.
 */
export function assertCatalogProjectionRevision(input: {
  readonly incomingVersion: string;
  readonly currentVersion: string | null;
  readonly projectionKey: string;
  readonly incomingProjection: unknown;
  readonly currentProjection: unknown;
}): void {
  if (input.currentVersion === null) {
    return;
  }

  const comparison = compareCatalogSourceVersions(input.incomingVersion, input.currentVersion);
  if (comparison < 0) {
    throw new StaleCatalogVersionError(
      input.incomingVersion,
      input.currentVersion,
      input.projectionKey,
    );
  }
  if (
    comparison === 0 &&
    !catalogProjectionsEqual(input.incomingProjection, input.currentProjection)
  ) {
    throw new EqualCatalogVersionConflictError(input.incomingVersion, input.projectionKey);
  }
}

export function normalizeEnumAttributeValue(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

/** Maps the discriminated 1C attribute union onto the database's one-value columns. */
export function toAttributeAssignmentColumns(
  attribute: OneCAttribute,
  enumValueId: string | null = null,
): AttributeAssignmentColumns {
  switch (attribute.dataType) {
    case 'ENUM':
      if (enumValueId === null) {
        throw new Error(`enum_value_id_required:${attribute.code}`);
      }
      return {
        valueId: enumValueId,
        textValue: null,
        numericValue: null,
        booleanValue: null,
      };
    case 'TEXT':
      return {
        valueId: null,
        textValue: attribute.value,
        numericValue: null,
        booleanValue: null,
      };
    case 'NUMBER':
      return {
        valueId: null,
        textValue: null,
        numericValue: attribute.value,
        booleanValue: null,
      };
    case 'BOOLEAN':
      return {
        valueId: null,
        textValue: null,
        numericValue: null,
        booleanValue: attribute.value,
      };
  }
}
