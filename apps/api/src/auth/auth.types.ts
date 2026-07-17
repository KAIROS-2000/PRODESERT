import { type Role } from '@prisma/client';
import { type PublicSession } from '@pro-dessert/contracts';
import { type Request } from 'express';
import { type ClientMetadata } from '../common/security/client-fingerprint.service';

export interface AuthenticatedPrincipal {
  userId: string;
  sessionId: string;
  email: string;
  role: Role;
  expiresAt: Date;
}

export interface AuthenticatedRequest extends Request {
  principal: AuthenticatedPrincipal;
  correlationId?: string;
}

export interface SessionCreationResult {
  principal: AuthenticatedPrincipal;
  rawToken: string;
}

export type AuthContext = ClientMetadata;

export type { PublicSession };
