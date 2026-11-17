import { mdiLoading } from '@mdi/js';
import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { COARSE_HIT, cx } from './cx';
import { Icon } from './Icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: string;
  busy?: boolean;
}

const VARIANT = {
  primary: 'bg-accent text-accent-fg hover:bg-accent/90',
  secondary: 'border border-line bg-surface text-fg hover:bg-surface-2',
  ghost: 'text-accent-ink hover:bg-accent-tint',
  danger: 'bg-danger text-white hover:bg-danger/90',
};

const SIZE = {
  sm: cx('h-8 gap-1.5 px-3 text-xs', COARSE_HIT.sm),
  md: 'h-10 gap-2 px-4 text-sm [@media(pointer:coarse)]:h-11',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'secondary',
      size = 'md',
      icon,
      busy,
      disabled,
      type = 'button',
      className,
      children,
      ...rest
    },
    ref,
  ) {
    const iconPath = busy ? mdiLoading : icon;
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        className={cx(
          'relative inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50',
          VARIANT[variant],
          SIZE[size],
          className,
        )}
        {...rest}
      >
        {iconPath && (
          <Icon
            path={iconPath}
            size={size === 'sm' ? 16 : 20}
            className={busy ? 'animate-spin' : undefined}
          />
        )}
        {children}
      </button>
    );
  },
);
