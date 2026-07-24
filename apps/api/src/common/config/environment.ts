import { z } from 'zod';

const optionalNonEmptyString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url().optional(),
);

const booleanFromString = (defaultValue: boolean): z.ZodType<boolean, z.ZodTypeDef, unknown> =>
  z
    .enum(['true', 'false'])
    .default(defaultValue ? 'true' : 'false')
    .transform((value) => value === 'true');

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    TRUST_PROXY: booleanFromString(false),
    DATABASE_URL: z.string().trim().min(1),
    REDIS_URL: z.string().url().default('redis://localhost:6379'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000,http://localhost:3001')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default('pd_session'),
    COOKIE_SECURE: booleanFromString(false),
    CSRF_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default('pd_csrf'),
    CSRF_TTL_SECONDS: z.coerce.number().int().min(300).max(86_400).default(7_200),
    SESSION_TTL_SECONDS: z.coerce.number().int().min(900).max(2_592_000).default(604_800),
    CART_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default('pd_cart'),
    CART_TTL_SECONDS: z.coerce.number().int().min(3_600).max(31_536_000).default(2_592_000),
    ORDER_PUBLIC_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(3_650).default(365),
    ORDER_ACCESS_TOKEN_SECRET: optionalNonEmptyString,
    PICKUP_LOCATION_CODE: z.string().trim().min(1).max(64).default('orenburg-lipovaya-20'),
    EMAIL_VERIFICATION_TTL_MINUTES: z.coerce.number().int().min(10).max(10_080).default(1_440),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(10).max(1_440).default(60),
    ARGON2_MEMORY_KIB: z.coerce.number().int().min(19_456).max(262_144).default(19_456),
    ARGON2_TIME_COST: z.coerce.number().int().min(2).max(10).default(3),
    ARGON2_PARALLELISM: z.coerce.number().int().min(1).max(8).default(1),
    PII_HASH_SECRET: optionalNonEmptyString,
    PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
    SMTP_HOST: optionalNonEmptyString,
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
    SMTP_SECURE: booleanFromString(false),
    SMTP_USER: optionalNonEmptyString,
    SMTP_PASSWORD: optionalNonEmptyString,
    SMTP_FROM: z.string().trim().min(3).default('Pro Dessert <no-reply@example.invalid>'),
    EMAIL_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
    S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
    S3_REGION: z.string().trim().min(1).max(64).default('ru-central-1'),
    S3_BUCKET: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
      .default('pro-dessert'),
    S3_ACCESS_KEY: optionalNonEmptyString,
    S3_SECRET_KEY: optionalNonEmptyString,
    S3_FORCE_PATH_STYLE: booleanFromString(true),
    PAYMENT_PROOF_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(20 * 1_024 * 1_024)
      .default(8 * 1_024 * 1_024),
    FILE_SCAN_MODE: z.enum(['local', 'clamav']).default('local'),
    CLAMAV_HOST: optionalNonEmptyString,
    CLAMAV_PORT: z.coerce.number().int().min(1).max(65_535).default(3310),
    DEMO_BANK_DETAILS_ENABLED: booleanFromString(true),
    BANK_DETAILS_VERSION: z.string().trim().min(1).max(64).default('local-demo-v1'),
    BANK_RECIPIENT: optionalNonEmptyString,
    BANK_INN: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z
        .string()
        .trim()
        .regex(/^(?:\d{10}|\d{12})$/)
        .optional(),
    ),
    BANK_KPP: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z
        .string()
        .trim()
        .regex(/^\d{9}$/)
        .optional(),
    ),
    BANK_ACCOUNT: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z
        .string()
        .trim()
        .regex(/^\d{20}$/)
        .optional(),
    ),
    BANK_CORRESPONDENT_ACCOUNT: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z
        .string()
        .trim()
        .regex(/^\d{20}$/)
        .optional(),
    ),
    BANK_BIC: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z
        .string()
        .trim()
        .regex(/^\d{9}$/)
        .optional(),
    ),
    BANK_NAME: optionalNonEmptyString,
    STORE_PHONE: optionalNonEmptyString,
    ONE_C_ADAPTER: z.enum(['mock', 'rest']).default('mock'),
    ONE_C_BASE_URL: optionalUrl,
    ONE_C_KEY_ID: z.string().trim().min(1).max(64).default('local-v1'),
    ONE_C_INBOUND_HMAC_SECRET: optionalNonEmptyString,
    ONE_C_OUTBOUND_HMAC_SECRET: optionalNonEmptyString,
    ONE_C_SIGNATURE_TOLERANCE_SECONDS: z.coerce.number().int().min(30).max(900).default(300),
    ONE_C_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(10_000),
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(250).max(60_000).default(2_000),
    OUTBOX_PROCESSING_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(3_600).default(300),
    OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(6),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(4),
    DEFAULT_RESERVATION_HOURS: z.coerce.number().int().min(1).max(720).default(24),
    B2B_RESERVATION_HOURS: z.coerce.number().int().min(1).max(720).default(72),
    B2B_RESERVATION_BUSINESS_DAYS: z.coerce.number().int().min(1).max(10).default(3),
    RESERVATION_SWEEP_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(10_000)
      .max(3_600_000)
      .default(60_000),
  })
  .superRefine((env, context) => {
    for (const origin of env.CORS_ORIGINS) {
      try {
        const parsed = new URL(origin);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin === 'null') {
          throw new Error('unsupported origin');
        }
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGINS'],
          message: `Invalid HTTP(S) origin: ${origin}`,
        });
      }
    }

    if (env.NODE_ENV !== 'production') {
      return;
    }

    if (!env.COOKIE_SECURE) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SECURE must be true in production',
      });
    }
    if (env.CORS_ORIGINS.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGINS'],
        message: 'At least one CORS origin is required in production',
      });
    }
    if (!env.SMTP_HOST) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required in production',
      });
    }
    if (env.DEMO_BANK_DETAILS_ENABLED) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DEMO_BANK_DETAILS_ENABLED'],
        message: 'Demonstration bank details are forbidden in production',
      });
    }
    for (const key of [
      'BANK_RECIPIENT',
      'BANK_INN',
      'BANK_ACCOUNT',
      'BANK_CORRESPONDENT_ACCOUNT',
      'BANK_BIC',
      'BANK_NAME',
      'S3_ACCESS_KEY',
      'S3_SECRET_KEY',
    ] as const) {
      if (!env[key]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required in production`,
        });
      }
    }
    if (env.FILE_SCAN_MODE !== 'clamav' || !env.CLAMAV_HOST) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FILE_SCAN_MODE'],
        message: 'FILE_SCAN_MODE=clamav and CLAMAV_HOST are required in production',
      });
    }
    if (!env.PII_HASH_SECRET || env.PII_HASH_SECRET.length < 32) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PII_HASH_SECRET'],
        message: 'PII_HASH_SECRET with at least 32 characters is required in production',
      });
    }
    if (!env.ORDER_ACCESS_TOKEN_SECRET || env.ORDER_ACCESS_TOKEN_SECRET.length < 32) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ORDER_ACCESS_TOKEN_SECRET'],
        message: 'ORDER_ACCESS_TOKEN_SECRET with at least 32 characters is required in production',
      });
    }
    if (env.ONE_C_ADAPTER === 'mock') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ONE_C_ADAPTER'],
        message: 'ONE_C_ADAPTER=mock is forbidden in production',
      });
    }
    if (!env.ONE_C_BASE_URL) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ONE_C_BASE_URL'],
        message: 'ONE_C_BASE_URL is required in production',
      });
    } else if (new URL(env.ONE_C_BASE_URL).protocol !== 'https:') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ONE_C_BASE_URL'],
        message: 'ONE_C_BASE_URL must use HTTPS in production',
      });
    }
    for (const key of ['ONE_C_INBOUND_HMAC_SECRET', 'ONE_C_OUTBOUND_HMAC_SECRET'] as const) {
      if (!env[key] || env[key].length < 32) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} with at least 32 characters is required in production`,
        });
      }
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(config: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(config);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid API environment: ${message}`);
  }
  return result.data;
}
