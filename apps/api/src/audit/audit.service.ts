import { Injectable } from '@nestjs/common';
import { type Prisma, type Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEvent {
  action: string;
  entityType: string;
  entityId?: string;
  actorUserId?: string;
  actorRole?: Role;
  source?: 'ADMIN' | 'ONE_C' | 'STOREFRONT' | 'SYSTEM';
  reason?: string;
  metadata?: Prisma.InputJsonValue;
  correlationId?: string;
  ipHash?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditEvent): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: event.action,
        entityType: event.entityType,
        source: event.source ?? 'SYSTEM',
        ...(event.entityId ? { entityId: event.entityId } : {}),
        ...(event.actorUserId ? { actorUserId: event.actorUserId } : {}),
        ...(event.actorRole ? { actorRole: event.actorRole } : {}),
        ...(event.reason ? { reason: event.reason } : {}),
        ...(event.metadata ? { metadata: event.metadata } : {}),
        ...(event.correlationId ? { correlationId: event.correlationId } : {}),
        ...(event.ipHash ? { ipHash: event.ipHash } : {}),
      },
    });
  }
}
