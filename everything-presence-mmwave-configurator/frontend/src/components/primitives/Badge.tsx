import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-fg-muted',
  accent: 'bg-accent-tint text-accent-ink',
  success: 'bg-success-tint text-success-ink',
  warning: 'bg-warning-tint text-warning-ink',
  danger: 'bg-danger-tint text-danger-ink',
};

export interface BadgeProps {
  tone?: Tone;
  icon?: string;
  children: ReactNode;
  className?: string;
}

export const Badge = ({
  tone = 'neutral',
  icon,
  children,
  className,
}: BadgeProps) => (
  <span
    className={cx(
      'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
      TONE_CLASS[tone],
      className,
    )}
  >
    {icon && <Icon path={icon} size={16} className="-ml-0.5" />}
    {children}
  </span>
);
