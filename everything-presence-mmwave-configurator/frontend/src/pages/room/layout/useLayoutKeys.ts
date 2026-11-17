import { useEffect, useRef } from 'react';
import type { DeleteKeyTarget } from '../../../utils/roomBuilderSelection';
import { ROTATION_STEP_DEG } from '../../../utils/roomRotation';
import type { LayoutTool } from './useLayoutEditor';

export interface LayoutKeyHandlers {
  tool: LayoutTool;
  setTool: (tool: LayoutTool) => void;
  finishWalls: () => void;
  deleteTarget: DeleteKeyTarget;
  deleteSelection: () => void;
  undo: () => void;
  redo: () => void;
  rotate: (angleDeg: number) => void;
  canRotate: boolean;
  save: () => void;
  fit: () => void;
  zoomBy: (delta: number) => void;
  escape: () => void;
}

const textEntry = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** Layout-mode keys from spec §3.4; mode keys, `?` and help stay with the room screen. */
export function useLayoutKeys(handlers: LayoutKeyHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const h = ref.current;
      const key = event.key.toLowerCase();
      const typing = textEntry(event.target);
      const onButton =
        event.target instanceof HTMLElement &&
        event.target.tagName === 'BUTTON';
      const act = (run: () => void) => {
        event.preventDefault();
        run();
      };

      if (event.ctrlKey || event.metaKey) {
        if (key === 's') act(h.save);
        else if ((key === 'z' || key === 'y') && !typing)
          act(key === 'y' || event.shiftKey ? h.redo : h.undo);
        return;
      }
      if (typing) return;

      if (key === 'r') {
        if (h.canRotate)
          act(() =>
            h.rotate(event.shiftKey ? -ROTATION_STEP_DEG : ROTATION_STEP_DEG),
          );
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        const objectTarget =
          h.deleteTarget === 'furniture' || h.deleteTarget === 'door';
        if (h.deleteTarget && (objectTarget || !onButton))
          act(h.deleteSelection);
        return;
      }
      if (onButton && event.key !== 'Escape') return;

      if (key === 'a')
        act(() => h.setTool(h.tool === 'walls' ? 'select' : 'walls'));
      else if (key === 'd')
        act(() => h.setTool(h.tool === 'door' ? 'select' : 'door'));
      else if (key === 'v') act(() => h.setTool('select'));
      else if (event.key === 'Enter' && h.tool === 'walls') act(h.finishWalls);
      else if (key === 'f') act(h.fit);
      else if (event.key === '+' || event.key === '=') act(() => h.zoomBy(1));
      else if (event.key === '-' || event.key === '_') act(() => h.zoomBy(-1));
      else if (event.key === 'Escape') act(h.escape);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
