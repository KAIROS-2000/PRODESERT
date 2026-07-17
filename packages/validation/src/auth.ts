import { z } from 'zod';

export const passwordPolicy = {
  minLength: 10,
  maxLength: 256,
} as const;

const commonPasswords = new Set([
  '1234567890',
  'password123',
  'qwerty12345',
  'пароль12345',
  'pro-dessert',
]);

const normalizedPassword = (value: string): string =>
  value.normalize('NFKC').toLocaleLowerCase('ru-RU');

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Укажите email')
  .max(254, 'Email слишком длинный')
  .email('Укажите корректный email')
  .transform((value) => value.toLocaleLowerCase('en-US'));

export const newPasswordSchema = z
  .string()
  .min(
    passwordPolicy.minLength,
    `Пароль должен содержать не менее ${passwordPolicy.minLength} символов`,
  )
  .max(
    passwordPolicy.maxLength,
    `Пароль должен содержать не более ${passwordPolicy.maxLength} символов`,
  )
  .refine(
    (value) => !commonPasswords.has(normalizedPassword(value)),
    'Выберите менее распространённый пароль',
  );

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, 'Укажите пароль')
    .max(passwordPolicy.maxLength, 'Пароль слишком длинный'),
});

export const registerSchema = z
  .object({
    email: emailSchema,
    password: newPasswordSchema,
    passwordConfirmation: z.string(),
  })
  .superRefine(({ password, passwordConfirmation }, context) => {
    if (password !== passwordConfirmation) {
      context.addIssue({
        code: 'custom',
        path: ['passwordConfirmation'],
        message: 'Пароли не совпадают',
      });
    }
  });

const tokenSchema = z.string().trim().min(32, 'Некорректный токен').max(512, 'Некорректный токен');

export const verifyEmailSchema = z.object({ token: tokenSchema });

export const resendVerificationSchema = z.object({ email: emailSchema });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: tokenSchema,
    password: newPasswordSchema,
    passwordConfirmation: z.string(),
  })
  .superRefine(({ password, passwordConfirmation }, context) => {
    if (password !== passwordConfirmation) {
      context.addIssue({
        code: 'custom',
        path: ['passwordConfirmation'],
        message: 'Пароли не совпадают',
      });
    }
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'Укажите текущий пароль')
      .max(passwordPolicy.maxLength, 'Пароль слишком длинный'),
    newPassword: newPasswordSchema,
    newPasswordConfirmation: z.string(),
  })
  .superRefine(({ currentPassword, newPassword, newPasswordConfirmation }, context) => {
    if (newPassword !== newPasswordConfirmation) {
      context.addIssue({
        code: 'custom',
        path: ['newPasswordConfirmation'],
        message: 'Пароли не совпадают',
      });
    }

    if (currentPassword === newPassword) {
      context.addIssue({
        code: 'custom',
        path: ['newPassword'],
        message: 'Новый пароль должен отличаться от текущего',
      });
    }
  });

export const changeEmailSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, 'Укажите пароль')
    .max(passwordPolicy.maxLength, 'Пароль слишком длинный'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
