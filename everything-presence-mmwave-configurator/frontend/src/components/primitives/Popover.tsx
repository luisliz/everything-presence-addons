import {
  cloneElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import {
  focusableWithin,
  useAnchoredPosition,
  useEscape,
  useOutsidePress,
} from './layer';

export interface PopoverProps {
  trigger: ReactElement;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'start' | 'end';
  label?: string;
  className?: string;
}

export const Popover = ({
  trigger,
  children,
  align = 'start',
  label,
  className,
}: PopoverProps) => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const refs = useMemo(() => [anchorRef, layerRef], []);
  const layerId = useId();
  const position = useAnchoredPosition(open, anchorRef, layerRef, align);
  const close = useCallback(() => setOpen(false), []);
  const closeAndRefocus = useCallback(() => {
    setOpen(false);
    focusableWithin(anchorRef.current as HTMLElement)[0]?.focus();
  }, []);

  useOutsidePress(open, refs, close);
  useEscape(open, closeAndRefocus);

  return (
    <>
      <span ref={anchorRef} className="inline-flex">
        {cloneElement(trigger, {
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          'aria-controls': open ? layerId : undefined,
          onClick: () => setOpen((value) => !value),
        })}
      </span>
      {open &&
        createPortal(
          <div
            ref={layerRef}
            id={layerId}
            role="dialog"
            aria-label={label}
            style={{
              left: position?.left ?? -9999,
              top: position?.top ?? -9999,
            }}
            className={cx(
              'fixed z-[110] max-h-[70dvh] overflow-y-auto rounded-xl border border-line bg-surface p-3 shadow-e2',
              className,
            )}
          >
            {typeof children === 'function'
              ? children(closeAndRefocus)
              : children}
          </div>,
          document.body,
        )}
    </>
  );
};
