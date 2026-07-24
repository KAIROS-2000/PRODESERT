import { BadRequestException, Injectable } from '@nestjs/common';
import { OutboxStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OneCCommandService } from '../one-c-command.service';
import { type OneCOrderExportPage, type OneCOrderExportSource } from './one-c-order-export.source';

interface ExportCursor {
  readonly createdAt: string;
  readonly id: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Pull-model view over the same immutable outbox facts used by push workers.
 * The opaque cursor is stable across inserts and no event is acknowledged by
 * reading it, so a 1C client may safely retry a page.
 */
@Injectable()
export class PrismaOneCOrderExportSource implements OneCOrderExportSource {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: OneCCommandService,
  ) {}

  async next(cursorValue: string | null, limit: number): Promise<OneCOrderExportPage> {
    const cursor = cursorValue ? this.decodeCursor(cursorValue) : null;
    const rows = await this.prisma.outboxEvent.findMany({
      where: {
        aggregateType: 'order',
        eventType: 'order.created',
        status: { not: OutboxStatus.DLQ },
        ...(cursor
          ? {
              OR: [
                { createdAt: { gt: new Date(cursor.createdAt) } },
                { createdAt: new Date(cursor.createdAt), id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    const pageRows = rows.slice(0, limit);
    const items = [];
    for (const row of pageRows) {
      items.push(await this.commands.buildOrderExport(row));
    }
    const last = pageRows.at(-1);
    return {
      schemaVersion: '1.0',
      items,
      nextCursor:
        rows.length > limit && last
          ? this.encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  private encodeCursor(cursor: ExportCursor): string {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private decodeCursor(value: string): ExportCursor {
    try {
      const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
      if (
        typeof decoded !== 'object' ||
        decoded === null ||
        Array.isArray(decoded) ||
        !('createdAt' in decoded) ||
        typeof decoded.createdAt !== 'string' ||
        Number.isNaN(Date.parse(decoded.createdAt)) ||
        !('id' in decoded) ||
        typeof decoded.id !== 'string' ||
        !UUID_PATTERN.test(decoded.id)
      ) {
        throw new TypeError('invalid cursor');
      }
      return { createdAt: new Date(decoded.createdAt).toISOString(), id: decoded.id };
    } catch {
      throw new BadRequestException({
        code: 'ONE_C_EXPORT_CURSOR_INVALID',
        message: 'The export cursor is invalid.',
      });
    }
  }
}
