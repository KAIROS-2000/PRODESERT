import type { HTMLAttributes, ReactNode } from 'react';

import { classNames } from './class-names.js';

export interface FormErrorProps extends Omit<HTMLAttributes<HTMLParagraphElement>, 'children'> {
  readonly children: ReactNode;
}

export function FormError({ children, className, ...properties }: FormErrorProps) {
  if (!children) {
    return null;
  }

  return (
    <p {...properties} className={classNames('pd-form-error', className)} role="alert">
      {children}
    </p>
  );
}
