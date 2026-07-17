import { forwardRef, type HTMLAttributes } from 'react';

import { classNames } from './class-names.js';

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  readonly label?: string;
  readonly decorative?: boolean;
}

export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { className, label = 'Загрузка', decorative = false, ...properties },
  reference,
) {
  if (decorative) {
    return (
      <span
        {...properties}
        ref={reference}
        className={classNames('pd-spinner', className)}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      {...properties}
      ref={reference}
      className={classNames('pd-spinner-wrap', className)}
      role="status"
    >
      <span className="pd-spinner" aria-hidden="true" />
      <span className="pd-sr-only">{label}</span>
    </span>
  );
});
