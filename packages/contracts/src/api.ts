export interface ApiErrorDetail {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
}

export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly correlationId: string;
  readonly timestamp: string;
  readonly details?: unknown;
}

export interface ApiSuccess<TData> {
  readonly data: TData;
  readonly correlationId: string;
}

export interface PaginatedResponse<TItem> {
  readonly items: readonly TItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}
