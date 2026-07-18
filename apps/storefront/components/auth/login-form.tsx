'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle, LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FormField, FormStatus } from '@/components/auth/form-controls';
import { useCart } from '@/components/cart/cart-provider';
import { getAuthErrorMessage, postAuth } from '@/lib/auth-api';

const loginSchema = z.object({
  email: z.string().email('Введите корректный email.'),
  password: z.string().min(1, 'Введите пароль.'),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const { mergeCartAfterLogin } = useCart();
  const [requestError, setRequestError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setRequestError(null);
    setSuccess(false);
    try {
      await postAuth('/auth/login', values);
      await mergeCartAfterLogin();
      setSuccess(true);
      router.replace('/');
      router.refresh();
    } catch (error) {
      setRequestError(getAuthErrorMessage(error));
    }
  });

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate aria-busy={isSubmitting}>
      <FormField
        id="login-email"
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="name@example.ru"
        error={errors.email?.message}
        {...register('email')}
      />
      <FormField
        id="login-password"
        label="Пароль"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      {requestError ? <FormStatus type="error">{requestError}</FormStatus> : null}
      {success ? (
        <FormStatus type="success">Вход выполнен. Открываем главную страницу…</FormStatus>
      ) : null}
      <button className="button button--primary button--wide" type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <LoaderCircle className="spin" aria-hidden="true" size={19} />
        ) : (
          <LogIn aria-hidden="true" size={19} />
        )}
        {isSubmitting ? 'Входим…' : 'Войти'}
      </button>
    </form>
  );
}
