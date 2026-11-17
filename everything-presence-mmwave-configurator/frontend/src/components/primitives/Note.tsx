import {
  mdiAlertCircleOutline,
  mdiAlertOutline,
  mdiInformationOutline,
} from '@mdi/js';
import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

export interface NoteProps {
  tone: 'info' | 'warning' | 'danger';
  title?: string;
  icon?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

const TONE = {
  info: {
    box: 'border-accent/30 bg-accent-tint',
    ink: 'text-accent-ink',
    icon: mdiInformationOutline,
  },
  warning: {
    box: 'border-warning/40 bg-warning-tint',
    ink: 'text-warning-ink',
    icon: mdiAlertOutline,
  },
  danger: {
    box: 'border-danger/40 bg-danger-tint',
    ink: 'text-danger-ink',
    icon: mdiAlertCircleOutline,
  },
};

export const Note = ({
  tone,
  title,
  icon,
  actions,
  className,
  children,
}: NoteProps) => (
  <div
    role={tone === 'danger' ? 'alert' : 'note'}
    className={cx(
      'flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm',
      TONE[tone].box,
      className,
    )}
  >
    <Icon path={icon ?? TONE[tone].icon} size={20} className={TONE[tone].ink} />
    <div className="min-w-0 flex-1">
      {title && (
        <div className={cx('font-medium', TONE[tone].ink)}>{title}</div>
      )}
      <div className="text-fg">{children}</div>
      {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
    </div>
  </div>
);
