'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { BadgeCheck, LoaderCircle, Send } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FormField, FormStatus } from '@/components/auth/form-controls';
import { getAuthErrorMessage, postAuth } from '@/lib/auth-api';

const resendSchema = z.object({ email: z.string().email('Введите корректный email.') });
type ResendValues = z.infer<typeof resendSchema>;

export function VerifyEmailForm({ token }: { token: string | null }) {
  const attemptedToken = useRef<string | null>(null);
  const [verificationState, setVerificationState] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >(token ? 'loading' : 'idle');
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResendValues>({ resolver: zodResolver(resendSchema), defaultValues: { email: '' } });

  const verify = useCallback(async (value: string) => {
    setVerificationState('loading');
    setVerificationMessage(null);
    try {
      await postAuth('/auth/verify-email', { token: value });
      setVerificationState('success');
      setVerificationMessage('Email подтверждён. Теперь можно войти в профиль.');
    } catch (error) {
      setVerificationState('error');
      setVerificationMessage(getAuthErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    if (token && attemptedToken.current !== token) {
      attemptedToken.current = token;
      void verify(token);
    }
  }, [token, verify]);

  const resend = handleSubmit(async (values) => {
    setResendError(null);
    setResendSuccess(false);
    try {
      await postAuth('/auth/resend-verification', values);
      setResendSuccess(true);
    } catch (error) {
      setResendError(getAuthErrorMessage(error));
    }
  });

  return (
    <div className="auth-form">
      {verificationState === 'loading' ? (
        <div className="verification-progress" role="status">
          <LoaderCircle className="spin" aria-hidden="true" size={22} /> Проверяем ссылку…
        </div>
      ) : null}
      {verificationState === 'success' && verificationMessage ? (
        <>
          <FormStatus type="success">{verificationMessage}</FormStatus>
          <Link className="button button--primary button--wide" href="/login">
            <BadgeCheck aria-hidden="true" size={19} /> Войти
          </Link>
        </>
      ) : null}
      {verificationState === 'error' && verificationMessage ? (
        <FormStatus type="error">{verificationMessage}</FormStatus>
      ) : null}

      {verificationState !== 'success' ? (
        <form className="resend-form" onSubmit={resend} noValidate aria-busy={isSubmitting}>
          <div className="resend-heading">
            <h2>{token ? 'Нужна новая ссылка?' : 'Отправить ссылку ещё раз'}</h2>
            <p>Ответ не раскрывает, зарегистрирован ли указанный адрес.</p>
          </div>
          <FormField
            id="verify-email"
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          {resendError ? <FormStatus type="error">{resendError}</FormStatus> : null}
          {resendSuccess ? (
            <FormStatus type="success">
              Если аккаунт существует, новая ссылка отправлена.
            </FormStatus>
          ) : null}
          <button
            className="button button--secondary button--wide"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <LoaderCircle className="spin" aria-hidden="true" size={19} />
            ) : (
              <Send aria-hidden="true" size={19} />
            )}
            {isSubmitting ? 'Отправляем…' : 'Отправить новую ссылку'}
          </button>
        </form>
      ) : null}
    </div>
  );
}
