import {
  cloneElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  calculateTooltipPosition,
  type TooltipSide,
} from '../../utils/tooltipPosition';
import { cx } from './cx';

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  side?: TooltipSide;
  /** Toggle on click or tap instead of long-press; for info triggers whose only job is the tooltip. */
  openOnClick?: boolean;
  id?: string;
  /** Link the content as the trigger's description; off when it repeats the trigger's own label. */
  describe?: boolean;
  className?: string;
}

const HOVER_DELAY_MS = 350;
const LONG_PRESS_MS = 450;

export const Tooltip = ({
  content,
  children,
  side = 'top',
  openOnClick = false,
  id,
  describe = true,
  className,
}: TooltipProps) => {
  const generatedId = useId();
  const tooltipId = id ?? `tip-${generatedId.replace(/:/g, '')}`;
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number>();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number }>();

  const clearTimer = () => window.clearTimeout(timerRef.current);
  const openAfter = (ms: number) => {
    clearTimer();
    timerRef.current = window.setTimeout(() => setOpen(true), ms);
  };
  const close = useCallback(() => {
    window.clearTimeout(timerRef.current);
    setOpen(false);
  }, []);

  const reposition = useCallback(() => {
    if (!anchorRef.current || !tooltipRef.current) return;
    const { left, top } = calculateTooltipPosition(
      anchorRef.current.getBoundingClientRect(),
      tooltipRef.current.getBoundingClientRect(),
      { width: window.innerWidth, height: window.innerHeight },
      8,
      8,
      side,
    );
    setPosition({ left, top });
  }, [side]);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (
        !anchorRef.current?.contains(event.target as Node) &&
        !tooltipRef.current?.contains(event.target as Node)
      )
        close();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', keydown);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', keydown);
    };
  }, [close, open, reposition]);

  if (
    content === null ||
    content === undefined ||
    content === false ||
    content === ''
  )
    return children;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the span only observes pointer and focus on the wrapped control, which stays the interactive element.
    <span
      ref={anchorRef}
      className={cx('relative inline-flex', className)}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') openAfter(HOVER_DELAY_MS);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') close();
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== 'mouse' && !openOnClick)
          openAfter(LONG_PRESS_MS);
      }}
      onPointerUp={clearTimer}
      onPointerCancel={clearTimer}
      onClickCapture={(event) => {
        if (!openOnClick) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen((value) => !value);
      }}
      onFocus={(event) => {
        if ((event.target as HTMLElement).matches?.(':focus-visible'))
          setOpen(true);
      }}
      onBlur={close}
    >
      {describe
        ? cloneElement(children, { 'aria-describedby': tooltipId })
        : children}
      {(describe || open) &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            style={
              open
                ? { left: position?.left ?? -9999, top: position?.top ?? -9999 }
                : undefined
            }
            className={
              open
                ? 'pointer-events-auto fixed z-[130] max-w-[min(18rem,calc(100vw-1rem))] rounded-lg border border-line-strong bg-surface-2 px-2.5 py-1.5 text-left text-xs font-normal leading-relaxed text-fg shadow-e2'
                : 'sr-only'
            }
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
};
