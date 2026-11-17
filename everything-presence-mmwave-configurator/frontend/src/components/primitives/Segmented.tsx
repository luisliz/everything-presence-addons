import { mdiCheck, mdiLoading } from '@mdi/js';
import { type ReactNode, useId } from 'react';
import { COARSE_HIT, cx } from './cx';
import { Icon } from './Icon';
import { Tooltip } from './Tooltip';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: string;
  disabled?: boolean;
  tooltip?: string;
  badge?: ReactNode;
}

export interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  size?: 'sm' | 'md';
  iconOnly?: boolean;
  ariaLabel: string;
  busyValue?: T;
  className?: string;
}

/** Native radio inputs, so arrow keys, disabled skipping and form semantics come from the browser. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  iconOnly = false,
  ariaLabel,
  busyValue,
  className,
}: SegmentedProps<T>) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cx(
        'inline-flex rounded-lg border border-line bg-surface p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const checked = option.value === value;
        const busy = option.value === busyValue;
        const tip = option.tooltip ?? (iconOnly ? option.label : undefined);
        return (
          <Tooltip
            key={option.value}
            content={tip}
            describe={Boolean(option.tooltip)}
          >
            <label
              className={cx(
                'relative inline-flex cursor-pointer select-none items-center justify-center gap-1.5 rounded-md transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:disabled]:cursor-not-allowed',
                size === 'sm'
                  ? cx('h-7 text-xs', COARSE_HIT.sm)
                  : 'h-9 text-sm [@media(pointer:coarse)]:h-11',
                iconOnly
                  ? size === 'sm'
                    ? 'w-7'
                    : 'w-9 [@media(pointer:coarse)]:w-11'
                  : 'px-2.5',
                checked
                  ? 'bg-accent-tint font-medium text-accent-ink'
                  : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                option.disabled && !checked && 'opacity-40',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                disabled={option.disabled || busyValue !== undefined}
                aria-label={iconOnly ? option.label : undefined}
                aria-busy={busy || undefined}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {busy ? (
                <Icon path={mdiLoading} size={16} className="animate-spin" />
              ) : (
                checked && !iconOnly && <Icon path={mdiCheck} size={16} />
              )}
              {option.icon && !(busy && iconOnly) && (
                <Icon path={option.icon} size={size === 'sm' ? 16 : 20} />
              )}
              {!iconOnly && <span>{option.label}</span>}
              {option.badge}
            </label>
          </Tooltip>
        );
      })}
    </div>
  );
}
