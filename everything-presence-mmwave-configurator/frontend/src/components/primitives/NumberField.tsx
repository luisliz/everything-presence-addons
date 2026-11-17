import { useEffect, useState } from 'react';
import { cx } from './cx';
import {
  clampNumber,
  formatNumber,
  isInRange,
  parseNumberInput,
} from './numberInput';

export interface NumberFieldProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  dirty?: boolean;
  deviceValue?: number;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  className?: string;
}

export const NumberField = ({
  value,
  onChange,
  min,
  max,
  step,
  unit,
  dirty,
  deviceValue,
  disabled,
  id,
  ariaLabel,
  className,
}: NumberFieldProps) => {
  const [text, setText] = useState(() => formatNumber(value, step));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatNumber(value, step));
  }, [focused, step, value]);

  const commitClamped = () => {
    const parsed = parseNumberInput(text);
    const next = parsed === null ? value : clampNumber(parsed, min, max);
    if (next !== value) onChange(next);
    setText(formatNumber(next, step));
  };

  return (
    <div className={cx('flex flex-col items-end gap-0.5', className)}>
      <div className="relative flex items-center">
        {dirty && (
          <span
            aria-hidden="true"
            className="absolute -left-3 h-1.5 w-1.5 rounded-full bg-accent"
          />
        )}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          aria-label={ariaLabel}
          disabled={disabled}
          value={text}
          onFocus={() => setFocused(true)}
          onChange={(event) => {
            setText(event.target.value);
            const parsed = parseNumberInput(event.target.value);
            if (parsed !== null && isInRange(parsed, min, max))
              onChange(parsed);
          }}
          onBlur={() => {
            setFocused(false);
            commitClamped();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitClamped();
            if (
              (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
              step
            ) {
              event.preventDefault();
              const next = clampNumber(
                value +
                  (event.key === 'ArrowUp' ? step : -step) *
                    (event.shiftKey ? 10 : 1),
                min,
                max,
              );
              onChange(next);
              setText(formatNumber(next, step));
            }
          }}
          className={cx(
            'h-9 w-24 rounded-lg border bg-surface px-2.5 text-right text-sm tabular-nums text-fg focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 [@media(pointer:coarse)]:h-11',
            unit ? 'pr-9' : '',
            dirty ? 'border-accent/60' : 'border-line',
          )}
        />
        {unit && (
          <span className="pointer-events-none absolute right-2.5 text-xs text-fg-subtle">
            {unit}
          </span>
        )}
      </div>
      {dirty && deviceValue !== undefined && (
        <span className="text-xs text-fg-muted">
          On device: {formatNumber(deviceValue, step)}
          {unit ? ` ${unit}` : ''}
        </span>
      )}
    </div>
  );
};
