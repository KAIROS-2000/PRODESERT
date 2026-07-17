import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

import { classNames } from './class-names.js';
import { FormError } from './form-error.js';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
  readonly containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    'aria-describedby': externalDescription,
    className,
    containerClassName,
    error,
    hint,
    id,
    label,
    required,
    ...properties
  },
  reference,
) {
  const generatedId = useId();
  const inputId = id ?? `pd-input-${generatedId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [externalDescription, hintId, errorId]
    .filter((value): value is string => Boolean(value))
    .join(' ');

  return (
    <div className={classNames('pd-field', containerClassName)}>
      <label className="pd-field__label" htmlFor={inputId}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        {...properties}
        ref={reference}
        id={inputId}
        required={required}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : undefined}
        className={classNames('pd-input', error ? 'pd-input--error' : false, className)}
      />
      {hint ? (
        <p className="pd-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? <FormError id={errorId}>{error}</FormError> : null}
    </div>
  );
});
