'use client';

import { Minus, Plus } from 'lucide-react';
import { useRef } from 'react';

import {
  decrementQuantity,
  incrementQuantity,
  normalizeQuantity,
  quantitiesEqual,
  quantityAsNumber,
} from '@/lib/quantity';

export function QuantityControl({
  value,
  minimum,
  multiple,
  disabled = false,
  label,
  onChange,
  compact = false,
}: {
  value: string;
  minimum: string;
  multiple: string;
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void | Promise<void>;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const effectiveMinimum = normalizeQuantity(minimum, minimum, multiple);

  const commit = (nextValue: string) => {
    const normalized = normalizeQuantity(nextValue, minimum, multiple);
    if (inputRef.current) inputRef.current.value = normalized;
    if (!quantitiesEqual(normalized, value)) {
      void Promise.resolve(onChange(normalized)).catch(() => {
        if (inputRef.current) inputRef.current.value = value;
      });
    }
  };

  return (
    <div className={`quantity-control${compact ? ' quantity-control--compact' : ''}`}>
      <button
        type="button"
        aria-label={`Уменьшить количество: ${label}`}
        disabled={disabled || quantitiesEqual(value, effectiveMinimum)}
        onClick={() => commit(decrementQuantity(value, effectiveMinimum, multiple))}
      >
        <Minus aria-hidden="true" size={compact ? 14 : 16} />
      </button>
      <label>
        <span className="sr-only">Количество: {label}</span>
        <input
          key={value}
          ref={inputRef}
          type="number"
          inputMode="decimal"
          min={quantityAsNumber(effectiveMinimum)}
          step={quantityAsNumber(multiple)}
          defaultValue={value}
          disabled={disabled}
          onBlur={(event) => commit(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              event.currentTarget.value = value;
              event.currentTarget.blur();
            }
          }}
        />
      </label>
      <button
        type="button"
        aria-label={`Увеличить количество: ${label}`}
        disabled={disabled}
        onClick={() => commit(incrementQuantity(value, multiple))}
      >
        <Plus aria-hidden="true" size={compact ? 14 : 16} />
      </button>
    </div>
  );
}
