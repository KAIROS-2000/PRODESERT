import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { classNames } from './class-names.js';
import { Spinner } from './spinner.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly loading?: boolean;
  readonly loadingLabel?: string;
  readonly fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    disabled = false,
    fullWidth = false,
    loading = false,
    loadingLabel = 'Выполняется',
    size = 'md',
    type = 'button',
    variant = 'primary',
    ...properties
  },
  reference,
) {
  return (
    <button
      {...properties}
      ref={reference}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classNames(
        'pd-button',
        `pd-button--${variant}`,
        `pd-button--${size}`,
        fullWidth && 'pd-button--full',
        className,
      )}
    >
      {loading ? <Spinner decorative /> : null}
      <span>{loading ? loadingLabel : children}</span>
    </button>
  );
});
