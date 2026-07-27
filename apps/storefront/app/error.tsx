'use client';

import { useEffect } from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => {
    console.error('storefront_route_error', { name: error.name, digest: error.digest });
  }, [error.digest, error.name]);

  return (
    <section className="shell technical-state" aria-labelledby="technical-error-title">
      <p className="eyebrow">Временная ошибка</p>
      <h1 id="technical-error-title">Не удалось загрузить страницу</h1>
      <p>Данные не изменены. Проверьте подключение и попробуйте ещё раз.</p>
      <button className="button button--primary" type="button" onClick={reset}>
        Повторить
      </button>
    </section>
  );
}
