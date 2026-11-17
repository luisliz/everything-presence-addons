import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  canRedoHistory,
  canUndoHistory,
  createHistory,
  type History,
  pushHistory,
  redoHistory,
  snapshotZones,
  undoHistory,
  type ZonesSnapshot,
  zonesSnapshotsEqual,
} from '../utils/roomHistory.ts';

export interface ZoneHistory {
  /** Record the current zones as an undo step before `next` replaces them; false when `next` changes nothing. */
  push: (
    next: ZonesSnapshot,
    options?: { coalesceKey?: string | null },
  ) => boolean;
  /** The snapshot to apply, or null when there is nothing to undo. */
  undo: () => ZonesSnapshot | null;
  redo: () => ZonesSnapshot | null;
  /** Drop every step, e.g. after loading zones from the device or switching room. */
  reset: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useZoneHistory(current: ZonesSnapshot): ZoneHistory {
  const historyRef = useRef<History<ZonesSnapshot>>(createHistory());
  const activeKeyRef = useRef<string | null>(null);
  const currentRef = useRef(current);
  currentRef.current = current;
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  // A gesture ends on pointer-up or blur; the next edit starts a fresh undo step.
  useEffect(() => {
    const end = () => {
      activeKeyRef.current = null;
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('focusout', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('focusout', end);
    };
  }, []);

  const push = useCallback(
    (next: ZonesSnapshot, options?: { coalesceKey?: string | null }) => {
      const before = currentRef.current;
      if (zonesSnapshotsEqual(before, next)) return false;
      const coalesceKey = options?.coalesceKey ?? null;
      historyRef.current = pushHistory(
        historyRef.current,
        snapshotZones(before),
        {
          coalesceKey,
          activeCoalesceKey: activeKeyRef.current,
        },
      );
      activeKeyRef.current = coalesceKey;
      // A rerender between pushes may not happen inside one gesture, so track the latest state here.
      currentRef.current = next;
      rerender();
      return true;
    },
    [],
  );

  const step = useCallback((direction: 'undo' | 'redo') => {
    const move = direction === 'undo' ? undoHistory : redoHistory;
    const result = move(historyRef.current, snapshotZones(currentRef.current));
    if (!result) return null;
    historyRef.current = result.history;
    activeKeyRef.current = null;
    currentRef.current = result.snapshot;
    rerender();
    return result.snapshot;
  }, []);

  const undo = useCallback(() => step('undo'), [step]);
  const redo = useCallback(() => step('redo'), [step]);

  const reset = useCallback(() => {
    historyRef.current = createHistory();
    activeKeyRef.current = null;
    rerender();
  }, []);

  return {
    push,
    undo,
    redo,
    reset,
    canUndo: canUndoHistory(historyRef.current),
    canRedo: canRedoHistory(historyRef.current),
  };
}
