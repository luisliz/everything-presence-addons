import { mdiChevronDown, mdiClose } from '@mdi/js';
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { IconButton } from './IconButton';
import { useEscape, useFocusTrap, useScrollLock } from './layer';
import { resolveSnap, type SheetSnap, snapHeight } from './sheetSnap';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** `side`: right panel on md+, bottom sheet on phones. `bottom`: bottom sheet everywhere. `docked`: non-modal snapping sheet (phone inspector). */
  variant?: 'side' | 'bottom' | 'docked';
  snap?: SheetSnap;
  onSnapChange?: (snap: SheetSnap) => void;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}

const useViewportHeight = () => {
  const [height, setHeight] = useState(() => window.innerHeight);
  useEffect(() => {
    const update = () => setHeight(window.innerHeight);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return height;
};

export const Sheet = ({
  open,
  onClose,
  title,
  description,
  variant = 'bottom',
  snap,
  onSnapChange,
  footer,
  className,
  children,
}: SheetProps) => {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const modal = variant !== 'docked';
  const viewportHeight = useViewportHeight();
  const [ownSnap, setOwnSnap] = useState<SheetSnap>('peek');
  const currentSnap = snap ?? ownSnap;
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const dragRef = useRef<{
    startY: number;
    startHeight: number;
    lastY: number;
    lastT: number;
    velocity: number;
  } | null>(null);

  useFocusTrap(panelRef, open && modal);
  useScrollLock(open && modal);
  useEscape(open && modal, onClose);

  const changeSnap = useCallback(
    (next: SheetSnap) => {
      setOwnSnap(next);
      onSnapChange?.(next);
    },
    [onSnapChange],
  );

  if (!open) return null;

  const onHandleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const startHeight =
      panelRef.current?.getBoundingClientRect().height ??
      snapHeight(currentSnap, viewportHeight);
    dragRef.current = {
      startY: event.clientY,
      startHeight,
      lastY: event.clientY,
      lastT: event.timeStamp,
      velocity: 0,
    };
    setDragHeight(startHeight);
  };
  const onHandleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dt = Math.max(1, event.timeStamp - drag.lastT);
    drag.velocity = (drag.lastY - event.clientY) / dt;
    drag.lastY = event.clientY;
    drag.lastT = event.timeStamp;
    setDragHeight(
      Math.min(
        snapHeight('full', viewportHeight),
        Math.max(56, drag.startHeight + drag.startY - event.clientY),
      ),
    );
  };
  const onHandleUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || dragHeight === null) return;
    const moved = Math.abs(dragHeight - drag.startHeight) > 4;
    setDragHeight(null);
    if (!moved) {
      changeSnap(
        currentSnap === 'peek'
          ? 'half'
          : currentSnap === 'half'
            ? 'full'
            : 'half',
      );
      return;
    }
    changeSnap(resolveSnap(dragHeight, viewportHeight, drag.velocity));
  };

  const header = (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h2 id={titleId} className="truncate text-base font-semibold text-fg">
          {title}
        </h2>
        {description && (
          <div id={descriptionId} className="mt-0.5 text-xs text-fg-muted">
            {description}
          </div>
        )}
      </div>
      {variant === 'docked' ? (
        currentSnap === 'full' && (
          <IconButton
            icon={mdiChevronDown}
            label="Show the canvas"
            size="sm"
            onClick={() => changeSnap('half')}
          />
        )
      ) : (
        <IconButton
          icon={mdiClose}
          label="Close"
          size="sm"
          tooltip={false}
          onClick={onClose}
        />
      )}
    </div>
  );

  if (variant === 'docked') {
    return (
      <section
        ref={panelRef}
        aria-labelledby={titleId}
        style={{
          height: dragHeight ?? snapHeight(currentSnap, viewportHeight),
        }}
        className={cx(
          'fixed inset-x-0 bottom-0 z-[70] flex flex-col overflow-hidden rounded-t-2xl border-t border-line bg-surface shadow-e2 mobile-safe-bottom',
          dragHeight === null && 'transition-[height] duration-200 ease-out',
          className,
        )}
      >
        <div
          role="slider"
          aria-label="Resize panel"
          aria-valuemin={0}
          aria-valuemax={2}
          aria-valuenow={['peek', 'half', 'full'].indexOf(currentSnap)}
          aria-valuetext={currentSnap}
          tabIndex={0}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp')
              changeSnap(currentSnap === 'peek' ? 'half' : 'full');
            if (event.key === 'ArrowDown')
              changeSnap(currentSnap === 'full' ? 'half' : 'peek');
          }}
          className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </div>
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {children}
        </div>
        {footer && (
          <div className="border-t border-line px-4 py-3">{footer}</div>
        )}
      </section>
    );
  }

  return createPortal(
    <div
      className={cx(
        'fixed inset-0 z-[90]',
        variant === 'side'
          ? 'flex items-end md:items-stretch md:justify-end'
          : 'flex items-end',
      )}
    >
      <button
        type="button"
        aria-label="Close panel"
        tabIndex={-1}
        className="mobile-sheet-backdrop absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cx(
          'mobile-sheet-panel relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-line bg-surface shadow-e2 mobile-safe-bottom',
          variant === 'side' &&
            'md:max-h-none md:w-[420px] md:rounded-none md:border-l md:border-t-0',
          className,
        )}
      >
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {children}
        </div>
        {footer && (
          <div className="border-t border-line px-4 py-3">{footer}</div>
        )}
      </section>
    </div>,
    document.body,
  );
};
