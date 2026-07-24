import { ServiceUnavailableException } from '@nestjs/common';
import { type OneCExportOrderCommand } from './order-export.mapper';

export const ONE_C_ORDER_EXPORT_SOURCE = Symbol('ONE_C_ORDER_EXPORT_SOURCE');

export interface OneCOrderExportPage {
  readonly schemaVersion: '1.0';
  readonly items: readonly OneCExportOrderCommand[];
  readonly nextCursor: string | null;
}

export interface OneCOrderExportSource {
  next(cursor: string | null, limit: number): Promise<OneCOrderExportPage>;
}

/**
 * Safe placeholder until an outbox-backed source is registered. Returning an
 * empty page would falsely acknowledge that no orders are waiting.
 */
export class UnavailableOneCOrderExportSource implements OneCOrderExportSource {
  async next(): Promise<OneCOrderExportPage> {
    throw new ServiceUnavailableException({
      code: 'DEPENDENCY_UNAVAILABLE',
      message: 'The durable order export source is not connected.',
    });
  }
}
