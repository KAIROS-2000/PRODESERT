import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

import { classNames } from './class-names.js';
import { FormError } from './form-error.js';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
  readonly containerClassName?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
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
  const inputId = id ?? `pd-checkbox-${generatedId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [externalDescription, hintId, errorId]
    .filter((value): value is string => Boolean(value))
    .join(' ');

  return (
    <div className={classNames('pd-checkbox-field', containerClassName)}>
      <label className="pd-checkbox-field__label" htmlFor={inputId}>
        <input
          {...properties}
          ref={reference}
          id={inputId}
          type="checkbox"
          required={required}
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? true : undefined}
          className={classNames('pd-checkbox', className)}
        />
        <span>
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
        </span>
      </label>
      {hint ? (
        <p className="pd-field__hint pd-checkbox-field__message" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <FormError className="pd-checkbox-field__message" id={errorId}>
          {error}
        </FormError>
      ) : null}
    </div>
  );
});
