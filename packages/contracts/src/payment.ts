import type { OrderStatus, StatusSource } from './order.js';

export const PaymentStatus = {
  PENDING: 'PENDING',
  PROOF_UPLOADED: 'PROOF_UPLOADED',
  VERIFYING: 'VERIFYING',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
  REFUNDED: 'REFUNDED',
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentDocumentKind = {
  PAYMENT_PROOF: 'PAYMENT_PROOF',
  INVOICE: 'INVOICE',
} as const;

export type PaymentDocumentKind = (typeof PaymentDocumentKind)[keyof typeof PaymentDocumentKind];

export const StorageStatus = {
  PENDING_UPLOAD: 'PENDING_UPLOAD',
  AVAILABLE: 'AVAILABLE',
  FAILED: 'FAILED',
} as const;

export type StorageStatus = (typeof StorageStatus)[keyof typeof StorageStatus];

export const FileScanStatus = {
  PENDING: 'PENDING',
  CLEAN: 'CLEAN',
  INFECTED: 'INFECTED',
  FAILED: 'FAILED',
  NOT_REQUIRED: 'NOT_REQUIRED',
} as const;

export type FileScanStatus = (typeof FileScanStatus)[keyof typeof FileScanStatus];

export const EmailDeliveryStatus = {
  PENDING: 'PENDING',
  SENDING: 'SENDING',
  SENT: 'SENT',
  RETRY_SCHEDULED: 'RETRY_SCHEDULED',
  FAILED: 'FAILED',
  SUPPRESSED: 'SUPPRESSED',
} as const;

export type EmailDeliveryStatus = (typeof EmailDeliveryStatus)[keyof typeof EmailDeliveryStatus];

export const IdempotencyRecordStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type IdempotencyRecordStatus =
  (typeof IdempotencyRecordStatus)[keyof typeof IdempotencyRecordStatus];

export const PAYMENT_PROOF_MAX_BYTES = 8 * 1024 * 1024;

export const paymentProofMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'] as const;

export type PaymentProofMimeType = (typeof paymentProofMimeTypes)[number];

export interface BankDetailsView {
  readonly recipient: string;
  readonly inn: string;
  readonly kpp: string | null;
  readonly settlementAccount: string;
  readonly correspondentAccount: string;
  readonly bik: string;
  readonly bankName: string;
  readonly paymentPurpose: string;
  readonly detailsVersion: string;
  readonly isDemo: boolean;
}

export interface PaymentDocumentView {
  readonly id: string;
  readonly kind: PaymentDocumentKind;
  readonly filename: string;
  readonly mimeType: string;
  /** Integer byte count serialized as a decimal string. */
  readonly sizeBytes: string;
  readonly storageStatus: StorageStatus;
  readonly scanStatus: FileScanStatus;
  readonly availableAt: string | null;
  readonly createdAt: string;
}

export interface PaymentInstructionsView {
  readonly paymentId: string;
  readonly paymentVersion: number;
  readonly status: PaymentStatus;
  readonly amount: string;
  readonly currency: 'RUB';
  readonly detailsPublishedAt: string;
  readonly reservationExpiresAt: string;
  readonly bankDetails: BankDetailsView;
  readonly paymentReference: string | null;
  readonly customerComment: string | null;
  readonly proofSubmittedAt: string | null;
  readonly confirmedAt: string | null;
  readonly rejectedAt: string | null;
  readonly rejectionComment: string | null;
  readonly documents: readonly PaymentDocumentView[];
  readonly invoiceAvailable: boolean;
  readonly warning: string;
}

export interface PaymentProofInput {
  readonly paymentReference?: string;
  readonly comment?: string;
  readonly expectedPaymentVersion: number;
}

export interface SendPaymentDetailsInput {
  readonly expectedOrderVersion: number;
}

export interface ConfirmPaymentInput {
  readonly expectedOrderVersion: number;
  readonly expectedPaymentVersion: number;
  readonly comment?: string;
}

export interface RejectPaymentInput {
  readonly expectedOrderVersion: number;
  readonly expectedPaymentVersion: number;
  readonly comment: string;
}

export interface PaymentActionResult {
  readonly orderId: string;
  readonly orderVersion: number;
  readonly orderStatus: OrderStatus;
  readonly paymentId: string;
  readonly paymentVersion: number;
  readonly paymentStatus: PaymentStatus;
  readonly reservationExpiresAt: string | null;
  readonly idempotentReplay: boolean;
}

export interface PaymentProofResult extends PaymentActionResult {
  readonly proofSubmittedAt: string;
  readonly documentId: string | null;
}

export interface AdminPaymentView {
  readonly id: string;
  readonly orderId: string;
  readonly status: PaymentStatus;
  readonly amount: string;
  readonly currency: 'RUB';
  readonly bankDetails: BankDetailsView;
  readonly detailsPublishedAt: string;
  readonly paymentReference: string | null;
  readonly customerComment: string | null;
  readonly proofSubmittedAt: string | null;
  readonly verificationStartedAt: string | null;
  readonly confirmedAt: string | null;
  readonly rejectedAt: string | null;
  readonly refundedAt: string | null;
  readonly verifiedByUserId: string | null;
  readonly verificationSource: StatusSource | null;
  readonly rejectionComment: string | null;
  readonly version: number;
  readonly documents: readonly PaymentDocumentView[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EmailLogView {
  readonly id: string;
  readonly orderId: string | null;
  readonly userId: string | null;
  readonly templateCode: string;
  readonly recipientMasked: string;
  readonly subject: string;
  readonly status: EmailDeliveryStatus;
  readonly attempts: number;
  readonly providerMessageId: string | null;
  readonly correlationId: string | null;
  readonly scheduledAt: string;
  readonly sentAt: string | null;
  readonly nextRetryAt: string | null;
  readonly failedAt: string | null;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
}
