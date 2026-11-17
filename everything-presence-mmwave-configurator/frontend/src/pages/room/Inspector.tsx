import { mdiArrowLeft } from '@mdi/js';
import type { ReactNode } from 'react';
import {
  cx,
  Icon,
  IconButton,
  Sheet,
  type SheetSnap,
} from '../../components/primitives';
import { useMediaQuery } from '../../hooks/useMediaQuery';

export interface InspectorProps {
  title: string;
  icon?: string;
  /** Colour class for a selection swatch, e.g. `bg-target-1`. */
  swatchClass?: string;
  onBack?: () => void;
  /** Phone peek row: the mode's primary action next to the title. */
  peekAction?: ReactNode;
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  children: ReactNode;
}

const Mark = ({
  icon,
  swatchClass,
}: Pick<InspectorProps, 'icon' | 'swatchClass'>) =>
  swatchClass ? (
    <span
      aria-hidden="true"
      className={cx('h-3 w-3 shrink-0 rounded-full', swatchClass)}
    />
  ) : icon ? (
    <Icon path={icon} size={20} className="text-fg-muted" />
  ) : null;

export const Inspector = ({
  title,
  icon,
  swatchClass,
  onBack,
  peekAction,
  snap,
  onSnapChange,
  children,
}: InspectorProps) => {
  const wide = useMediaQuery('(min-width: 768px)', true);
  const back = onBack && (
    <IconButton
      icon={mdiArrowLeft}
      label="Back to room"
      size="sm"
      onClick={onBack}
    />
  );

  if (!wide)
    return (
      <Sheet
        open
        variant="docked"
        snap={snap}
        onSnapChange={onSnapChange}
        onClose={() => onSnapChange('peek')}
        className="!bottom-[calc(3.5rem+env(safe-area-inset-bottom))]"
        title={
          <span className="flex items-center gap-2">
            {back}
            <Mark icon={icon} swatchClass={swatchClass} />
            <span className="min-w-0 flex-1 truncate">{title}</span>
            {peekAction}
          </span>
        }
      >
        <section aria-label="Inspector" className="space-y-4">
          {children}
        </section>
      </Sheet>
    );

  return (
    <aside
      aria-label="Inspector"
      className="flex w-80 shrink-0 flex-col border-l border-line bg-surface lg:w-[360px]"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        {back}
        <Mark icon={icon} swatchClass={swatchClass} />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
          {title}
        </h2>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-1">
        {children}
      </div>
    </aside>
  );
};
