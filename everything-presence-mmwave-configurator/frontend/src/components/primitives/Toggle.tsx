import { mdiLoading } from '@mdi/js';
import { useId } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  busy?: boolean;
  disabled?: boolean;
  className?: string;
}

export const Toggle = ({
  checked,
  onChange,
  label,
  description,
  busy,
  disabled,
  className,
}: ToggleProps) => {
  const descriptionId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={busy || undefined}
      aria-describedby={description ? descriptionId : undefined}
      disabled={disabled || busy}
      onClick={() => onChange(!checked)}
      className={cx(
        'flex w-full min-h-10 items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 [@media(pointer:coarse)]:min-h-11',
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm text-fg">{label}</span>
        {description && (
          <span id={descriptionId} className="block text-xs text-fg-muted">
            {description}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={cx(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors [@media(pointer:coarse)]:h-8 [@media(pointer:coarse)]:w-[52px]',
          checked ? 'bg-accent' : 'bg-surface-3',
        )}
      >
        <span
          className={cx(
            'absolute left-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-accent shadow-e1 transition-transform [@media(pointer:coarse)]:h-7 [@media(pointer:coarse)]:w-7',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        >
          {busy && (
            <Icon path={mdiLoading} size={16} className="animate-spin" />
          )}
        </span>
      </span>
    </button>
  );
};
