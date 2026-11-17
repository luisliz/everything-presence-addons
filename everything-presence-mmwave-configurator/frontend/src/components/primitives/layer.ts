import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { calculateAnchorPosition } from '../../utils/tooltipPosition';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const focusableWithin = (root: HTMLElement): HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );

/** Keeps Tab inside `ref` while active, focuses the first control (or `initial`) and restores focus on release. */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  initial?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const root = ref.current;
      if (!root || root.contains(document.activeElement)) return;
      (initial?.current ?? focusableWithin(root)[0] ?? root).focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      const root = ref.current;
      if (event.key !== 'Tab' || !root) return;
      const items = focusableWithin(root);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus?.();
    };
  }, [active, initial, ref]);
}

let scrollLocks = 0;

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    scrollLocks += 1;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      scrollLocks -= 1;
      if (scrollLocks === 0) document.body.style.overflow = previous;
    };
  }, [active]);
}

export function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onEscape();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active, onEscape]);
}

/** Calls `onDismiss` for a pointer press outside every given element. */
export function useOutsidePress(
  active: boolean,
  refs: Array<RefObject<HTMLElement | null>>,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!active) return;
    const onPointerDown = (event: PointerEvent) => {
      if (refs.some((ref) => ref.current?.contains(event.target as Node)))
        return;
      onDismiss();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [active, onDismiss, refs]);
}

/** Fixed-position coordinates for a layer anchored under (or above) `anchor`, kept current on scroll and resize. */
export function useAnchoredPosition(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  layer: RefObject<HTMLElement | null>,
  align: 'start' | 'end' = 'start',
) {
  const [position, setPosition] = useState<{ left: number; top: number }>();
  const update = useCallback(() => {
    if (!anchor.current || !layer.current) return;
    const { left, top } = calculateAnchorPosition(
      anchor.current.getBoundingClientRect(),
      layer.current.getBoundingClientRect(),
      { width: window.innerWidth, height: window.innerHeight },
      align,
    );
    setPosition({ left, top });
  }, [align, anchor, layer]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(undefined);
      return;
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, update]);

  return position;
}
