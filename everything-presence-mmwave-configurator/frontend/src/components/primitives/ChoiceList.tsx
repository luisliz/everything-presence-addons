import { mdiCheckCircle } from '@mdi/js';
import { type ReactNode, useId } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

export interface ChoiceOption<T extends string> {
  value: T;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: string;
  disabled?: boolean;
  trailing?: ReactNode;
}

export interface ChoiceListProps<T extends string> {
  value: T | null;
  onChange: (value: T) => void;
  options: ReadonlyArray<ChoiceOption<T>>;
  ariaLabel: string;
  className?: string;
}

export function ChoiceList<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: ChoiceListProps<T>) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cx('flex flex-col gap-1.5', className)}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <label
            key={option.value}
            className={cx(
              'flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent',
              checked
                ? 'border-accent/50 bg-accent-tint'
                : 'border-line bg-surface',
              option.disabled
                ? 'cursor-not-allowed opacity-60'
                : 'cursor-pointer hover:bg-surface-2',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.icon && (
              <Icon
                path={option.icon}
                size={24}
                className={checked ? 'text-accent-ink' : 'text-fg-muted'}
              />
            )}
            <span className="min-w-0 flex-1">
              <span
                className={cx(
                  'block truncate text-sm text-fg',
                  checked && 'font-medium',
                )}
              >
                {option.title}
              </span>
              {option.subtitle && (
                <span className="block truncate text-xs text-fg-muted">
                  {option.subtitle}
                </span>
              )}
            </span>
            {option.trailing}
            {checked && (
              <Icon
                path={mdiCheckCircle}
                size={20}
                className="text-accent-ink"
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
