import { mdiInformationOutline } from '@mdi/js';
import type { ReactNode } from 'react';
import { COARSE_HIT, cx } from './cx';
import { Icon } from './Icon';
import { Tooltip } from './Tooltip';

export interface FieldProps {
  label: string;
  help?: ReactNode;
  unit?: string;
  error?: string;
  layout?: 'row' | 'stack';
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

export const InfoTrigger = ({
  content,
  label = 'More information',
  id,
}: {
  content: ReactNode;
  label?: string;
  id?: string;
}) => (
  <Tooltip content={content} openOnClick id={id}>
    <button
      type="button"
      aria-label={label}
      className={cx(
        'relative inline-flex h-6 w-6 items-center justify-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        COARSE_HIT.xs,
      )}
    >
      <Icon path={mdiInformationOutline} size={16} />
    </button>
  </Tooltip>
);

export const Field = ({
  label,
  help,
  unit,
  error,
  layout = 'stack',
  htmlFor,
  className,
  children,
}: FieldProps) => (
  <div
    className={cx(
      layout === 'row'
        ? 'flex items-center justify-between gap-3'
        : 'flex flex-col gap-1.5',
      className,
    )}
  >
    <div className="flex min-w-0 items-center gap-1">
      <label htmlFor={htmlFor} className="text-sm text-fg-muted">
        {label}
        {unit && <span className="text-fg-subtle"> ({unit})</span>}
      </label>
      {help && <InfoTrigger content={help} label={`About ${label}`} />}
    </div>
    <div className={cx(layout === 'row' && 'shrink-0')}>{children}</div>
    {error && <p className="text-xs text-danger-ink">{error}</p>}
  </div>
);
