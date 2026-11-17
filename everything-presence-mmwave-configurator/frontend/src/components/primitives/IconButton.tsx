import { mdiLoading } from '@mdi/js';
import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';
import { COARSE_HIT, cx } from './cx';
import { Icon } from './Icon';
import { Tooltip } from './Tooltip';

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: string;
  label: string;
  pressed?: boolean;
  busy?: boolean;
  variant?: 'ghost' | 'outline' | 'solid';
  size?: 'sm' | 'md';
  badge?: ReactNode;
  shortcut?: string;
  /** Tooltip content; defaults to the label plus shortcut, `false` disables it. */
  tooltip?: ReactNode | false;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
}

const VARIANT = {
  ghost: 'text-fg-muted hover:bg-surface-2 hover:text-fg',
  outline: 'border border-line bg-surface text-fg hover:bg-surface-2',
  solid: 'bg-surface-2 text-fg hover:bg-surface-3',
};

const SIZE = {
  sm: cx('h-8 w-8', COARSE_HIT.sm),
  md: 'h-10 w-10 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      icon,
      label,
      pressed,
      busy,
      variant = 'ghost',
      size = 'md',
      badge,
      shortcut,
      tooltip,
      tooltipSide,
      className,
      disabled,
      type = 'button',
      ...rest
    },
    ref,
  ) {
    const button = (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        aria-pressed={pressed}
        aria-busy={busy || undefined}
        disabled={disabled}
        className={cx(
          'relative inline-flex shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40',
          pressed
            ? 'bg-accent-tint text-accent-ink ring-1 ring-accent/40'
            : VARIANT[variant],
          SIZE[size],
          className,
        )}
        {...rest}
      >
        <Icon
          path={busy ? mdiLoading : icon}
          size={size === 'sm' ? 16 : 20}
          className={busy ? 'animate-spin' : undefined}
        />
        {badge !== undefined && badge !== null && badge !== false && (
          <span className="pointer-events-none absolute -right-1 -top-1 min-w-[1.125rem] rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-[1.125rem] text-accent-fg">
            {badge}
          </span>
        )}
      </button>
    );
    if (tooltip === false) return button;
    return (
      <Tooltip
        content={tooltip ?? (shortcut ? `${label} (${shortcut})` : label)}
        side={tooltipSide}
        describe={tooltip !== undefined}
      >
        {button}
      </Tooltip>
    );
  },
);
