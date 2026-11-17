import { useEffect, useRef } from 'react';
import type { RoomMode } from '../../router';

export interface RoomKeyHandlers {
  setMode: (mode: RoomMode) => void;
  /** Absent in modes whose viewport the room screen does not own yet. */
  fit?: () => void;
  zoomBy?: (delta: number) => void;
  escape?: () => void;
  help: () => void;
}

export const SHORTCUTS: ReadonlyArray<{
  keys: string[];
  action: string;
  modes: string;
}> = [
  { keys: ['1', '2', '3'], action: 'Live, Zones, Layout', modes: 'All' },
  { keys: ['F'], action: 'Fit room and coverage', modes: 'All' },
  { keys: ['+', '-'], action: 'Zoom in, zoom out', modes: 'All' },
  { keys: ['Space + drag'], action: 'Pan', modes: 'All' },
  {
    keys: ['Esc'],
    action: 'Cancel drawing, else clear the selection',
    modes: 'All',
  },
  { keys: ['V'], action: 'Select tool', modes: 'Zones, Layout' },
  { keys: ['P', 'R'], action: 'Polygon, rectangle tool', modes: 'Zones' },
  { keys: ['A', 'D'], action: 'Walls, door tool', modes: 'Layout' },
  { keys: ['Enter'], action: 'Finish polygon or wall', modes: 'Zones, Layout' },
  {
    keys: ['Backspace'],
    action: 'Remove the last point, else the selected vertex',
    modes: 'Zones, Layout',
  },
  {
    keys: ['Delete'],
    action: 'Delete the selected vertex or object',
    modes: 'Zones, Layout',
  },
  {
    keys: ['Arrows'],
    action: 'Nudge; Shift for 10 steps',
    modes: 'Zones, Layout',
  },
  { keys: ['R', 'Shift+R'], action: 'Rotate the plan 90°', modes: 'Layout' },
  {
    keys: ['Ctrl+Z', 'Shift+Ctrl+Z'],
    action: 'Undo, redo',
    modes: 'Zones, Layout',
  },
  { keys: ['Ctrl+S'], action: 'Save zones or layout', modes: 'Zones, Layout' },
  { keys: ['?'], action: 'This list', modes: 'All' },
];

const MODE_KEYS: Record<string, RoomMode> = {
  '1': 'live',
  '2': 'zones',
  '3': 'build',
};

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** Room-screen keys from spec §3.4 that every mode shares; mode tools bind their own keys. */
export function useRoomKeys(handlers: RoomKeyHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      if (typing(event.target) || document.querySelector('[aria-modal="true"]'))
        return;
      const h = ref.current;
      const mode = MODE_KEYS[event.key];
      if (mode) h.setMode(mode);
      else if ((event.key === 'f' || event.key === 'F') && h.fit) h.fit();
      else if ((event.key === '+' || event.key === '=') && h.zoomBy)
        h.zoomBy(1);
      else if ((event.key === '-' || event.key === '_') && h.zoomBy)
        h.zoomBy(-1);
      else if (event.key === 'Escape' && h.escape) h.escape();
      else if (event.key === '?') h.help();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export interface ZoneKeyHandlers {
  tool: (tool: 'select' | 'polygon' | 'rectangle') => void;
  undo: () => void;
  redo: () => void;
  save: () => void;
  fit: () => void;
  zoomBy: (delta: number) => void;
  escape: () => void;
  /** Hands a drawing or nudge key to the canvas when focus is elsewhere; true when the canvas used it. */
  canvasKey: (event: KeyboardEvent) => boolean;
}

const CANVAS_KEYS = new Set([
  'Enter',
  'Backspace',
  'Delete',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

const TOOL_KEYS: Record<string, 'select' | 'polygon' | 'rectangle'> = {
  v: 'select',
  p: 'polygon',
  r: 'rectangle',
};

/** Zones-mode keys from spec §3.4; the room screen's global keys stay in `useRoomKeys`. */
export function useZoneKeys(handlers: ZoneKeyHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !event.isTrusted) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const h = ref.current;
      const key = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;
      if (mod && !event.altKey && key === 's') {
        event.preventDefault();
        h.save();
        return;
      }
      if (typing(event.target)) return;
      if (mod && (key === 'z' || key === 'y')) {
        event.preventDefault();
        if (key === 'y' || event.shiftKey) h.redo();
        else h.undo();
        return;
      }
      if (mod || event.altKey) return;
      if (CANVAS_KEYS.has(event.key)) {
        if (h.canvasKey(event)) event.preventDefault();
        else if (event.key === 'Escape') {
          event.preventDefault();
          h.escape();
        }
        return;
      }
      if (TOOL_KEYS[key]) h.tool(TOOL_KEYS[key]);
      else if (key === 'f') h.fit();
      else if (key === '+' || key === '=') h.zoomBy(1);
      else if (key === '-' || key === '_') h.zoomBy(-1);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
