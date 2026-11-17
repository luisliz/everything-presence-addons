import { cx } from './cx';

export interface IconProps {
  path: string;
  size?: 16 | 20 | 24;
  className?: string;
  label?: string;
}

export const Icon = ({ path, size = 20, className, label }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    aria-hidden={label ? undefined : true}
    aria-label={label}
    role={label ? 'img' : undefined}
    className={cx('shrink-0', className)}
  >
    <path d={path} fill="currentColor" />
  </svg>
);
