'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FormField, FormStatus } from '@/components/auth/form-controls';
import { getAuthErrorMessage, postAuth } from '@/lib/auth-api';

const registerSchema = z
  .object({
    email: z.string().email('Введите корректный email.'),
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

type RegisterValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const [requestError, setRequestError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', passwordConfirmation: '' },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setRequestError(null);
    setSuccess(false);
    try {
      await postAuth('/auth/register', { email, password });
      setSuccess(true);
      reset();
    } catch (error) {
      setRequestError(getAuthErrorMessage(error));
    }
  });

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate aria-busy={isSubmitting}>
      <FormField
        id="register-email"
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="name@example.ru"
        error={errors.email?.message}
        {...register('email')}
      />
      <FormField
        id="register-password"
        label="Пароль"
        type="password"
        autoComplete="new-password"
        hint="Не менее 10 символов. Спецсимволы не обязательны."
        error={errors.password?.message}
        {...register('password')}
      />
      <FormField
        id="register-password-confirmation"
        label="Повторите пароль"
        type="password"
        autoComplete="new-password"
        error={errors.passwordConfirmation?.message}
        {...register('passwordConfirmation')}
      />
      {requestError ? <FormStatus type="error">{requestError}</FormStatus> : null}
      {success ? (
        <FormStatus type="success">Профиль создан. Проверьте email и подтвердите адрес.</FormStatus>
      ) : null}
      <button className="button button--primary button--wide" type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <LoaderCircle className="spin" aria-hidden="true" size={19} />
        ) : (
          <UserPlus aria-hidden="true" size={19} />
        )}
        {isSubmitting ? 'Создаём профиль…' : 'Создать профиль'}
      </button>
    </form>
  );
}
