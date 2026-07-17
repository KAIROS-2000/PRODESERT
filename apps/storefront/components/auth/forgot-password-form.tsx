'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle, Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FormField, FormStatus } from '@/components/auth/form-controls';
import { getAuthErrorMessage, postAuth } from '@/lib/auth-api';

const schema = z.object({ email: z.string().email('Введите корректный email.') });
type Values = z.infer<typeof schema>;

const neutralSuccess = 'Если аккаунт с таким адресом существует, мы отправили инструкции.';

export function ForgotPasswordForm() {
  const [requestError, setRequestError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setRequestError(null);
    setSuccess(false);
    try {
      await postAuth('/auth/forgot-password', values);
      setSuccess(true);
    } catch (error) {
      setRequestError(getAuthErrorMessage(error));
    }
  });

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate aria-busy={isSubmitting}>
      <FormField
        id="forgot-email"
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="name@example.ru"
        error={errors.email?.message}
        {...register('email')}
      />
      {requestError ? <FormStatus type="error">{requestError}</FormStatus> : null}
      {success ? <FormStatus type="success">{neutralSuccess}</FormStatus> : null}
      <button className="button button--primary button--wide" type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <LoaderCircle className="spin" aria-hidden="true" size={19} />
        ) : (
          <Mail aria-hidden="true" size={19} />
        )}
        {isSubmitting ? 'Отправляем…' : 'Отправить инструкции'}
      </button>
    </form>
  );
}
