import { cx } from './cx';

export type DeviceStatus = 'online' | 'offline' | 'busy' | 'none';

export interface StatusDotProps {
  state: DeviceStatus;
  label?: string;
  className?: string;
}

const STATE_CLASS: Record<DeviceStatus, string> = {
  online: 'bg-success',
  offline: 'border-[1.5px] border-fg-subtle bg-transparent',
  busy: 'bg-warning animate-pulse',
  none: 'bg-surface-3',
};

export const StatusDot = ({ state, label, className }: StatusDotProps) => (
  <span
    {...(label
      ? { role: 'img', 'aria-label': label }
      : { 'aria-hidden': true })}
    className={cx(
      'inline-block h-2 w-2 shrink-0 rounded-full',
      STATE_CLASS[state],
      className,
    )}
  />
);
