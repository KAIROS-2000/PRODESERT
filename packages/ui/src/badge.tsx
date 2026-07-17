import type { HTMLAttributes } from 'react';

import { classNames } from './class-names.js';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: BadgeTone;
}

export function Badge({ className, tone = 'neutral', ...properties }: BadgeProps) {
  return (
    <span {...properties} className={classNames('pd-badge', `pd-badge--${tone}`, className)} />
  );
}
