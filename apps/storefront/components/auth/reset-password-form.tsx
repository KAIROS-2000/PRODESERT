'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FormField, FormStatus } from '@/components/auth/form-controls';
import { getAuthErrorMessage, postAuth } from '@/lib/auth-api';

const schema = z
  .object({
    password: z
      .string()
      .min(10, 'Пароль должен содержать не менее 10 символов.')
      .max(256, 'Пароль слишком длинный.'),
    passwordConfirmation: z.string(),
  })
  .refine((values) => values.password === values.passwordConfirmation, {
    path: ['passwordConfirmation'],
    message: 'Пароли не совпадают.',
  });

type Values = z.infer<typeof schema>;

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [requestError, setRequestError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', passwordConfirmation: '' },
  });

  if (!token) {
    return (
      <div className="auth-form">
        <FormStatus type="error">Ссылка неполная или повреждена. Запросите новую.</FormStatus>
        <Link className="button button--secondary button--wide" href="/forgot-password">
          Запросить новую ссылку
        </Link>
      </div>
    );
  }

  const onSubmit = handleSubmit(async ({ password }) => {
    setRequestError(null);
    setSuccess(false);
    try {
      await postAuth('/auth/reset-password', { token, newPassword: password });
      setSuccess(true);
    } catch (error) {
      setRequestError(getAuthErrorMessage(error));
    }
  });

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate aria-busy={isSubmitting}>
      <FormField
        id="reset-password"
        label="Новый пароль"
        type="password"
        autoComplete="new-password"
        hint="Не менее 10 символов."
        error={errors.password?.message}
        {...register('password')}
      />
      <FormField
        id="reset-password-confirmation"
        label="Повторите новый пароль"
        type="password"
        autoComplete="new-password"
        error={errors.passwordConfirmation?.message}
        {...register('passwordConfirmation')}
      />
      {requestError ? <FormStatus type="error">{requestError}</FormStatus> : null}
      {success ? (
        <>
          <FormStatus type="success">Пароль изменён. Теперь можно войти.</FormStatus>
          <Link className="button button--secondary button--wide" href="/login">
            Перейти ко входу
          </Link>
        </>
      ) : (
        <button
          className="button button--primary button--wide"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <LoaderCircle className="spin" aria-hidden="true" size={19} />
          ) : (
            <KeyRound aria-hidden="true" size={19} />
          )}
          {isSubmitting ? 'Сохраняем…' : 'Установить пароль'}
        </button>
      )}
    </form>
  );
}
