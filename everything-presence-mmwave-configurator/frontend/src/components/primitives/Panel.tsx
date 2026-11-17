import { mdiChevronRight } from '@mdi/js';
import { type ReactNode, useId, useState } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

export interface PanelProps {
  title?: string;
  actions?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  id?: string;
  /** `card` stands alone on a page; `section` is a divided block inside the inspector. */
  variant?: 'card' | 'section';
  className?: string;
  children: ReactNode;
}

const HEADING = 'text-xs font-semibold uppercase tracking-wide text-fg-subtle';

export const Panel = ({
  title,
  actions,
  collapsible = false,
  defaultOpen = true,
  id,
  variant = 'card',
  className,
  children,
}: PanelProps) => {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const expanded = !collapsible || open;
  return (
    <section
      id={id}
      className={cx(
        variant === 'card'
          ? 'rounded-xl border border-line bg-surface p-4'
          : 'border-t border-line pt-4',
        className,
      )}
    >
      {(title || actions) && (
        <header
          className={cx('flex min-h-8 items-center gap-2', expanded && 'mb-3')}
        >
          {collapsible ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setOpen((value) => !value)}
              className="-ml-1 flex min-h-8 flex-1 items-center gap-1 rounded-md px-1 text-left hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [@media(pointer:coarse)]:min-h-11"
            >
              <Icon
                path={mdiChevronRight}
                size={16}
                className={cx(
                  'text-fg-subtle transition-transform',
                  open && 'rotate-90',
                )}
              />
              <h2 className={HEADING}>{title}</h2>
            </button>
          ) : (
            <h2 className={cx(HEADING, 'flex-1')}>{title}</h2>
          )}
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </header>
      )}
      {expanded && <div id={bodyId}>{children}</div>}
    </section>
  );
};
