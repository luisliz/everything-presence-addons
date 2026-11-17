import type { RoomConfig, ZonePolygon, ZoneRect } from '../api/types';
// Explicit extension so Node's built-in test runner can resolve it too.
import { stableStringify } from './stableStringify.ts';

/**
 * Session-only undo/redo, generic over the snapshot type.
 *
 * The stack lives in component state, so it dies on unmount or reload and
 * never reaches the backend. The Room Builder snapshots only the parts of a
 * room it can edit (`RoomSnapshot`); Zones mode snapshots the zone lists
 * (`ZonesSnapshot`). Each screen's undo must leave the other's data untouched.
 */

/** Bounded so a long editing session cannot grow memory without limit. */
export const ROOM_HISTORY_LIMIT = 50;

export interface HistoryEntry<S> {
  snapshot: S;
  /**
   * Identifies the gesture that produced the edit (a furniture drag, a slider
   * sweep, ...). Consecutive commits sharing a key collapse into this entry so
   * one gesture is one undo step, not one step per pointer-move event.
   */
  coalesceKey?: string | null;
}

export interface History<S> {
  past: HistoryEntry<S>[];
  future: HistoryEntry<S>[];
}

export interface HistoryStep<S> {
  history: History<S>;
  snapshot: S;
}

export interface PushHistoryOptions {
  /** Gesture key for the edit being committed, if any. */
  coalesceKey?: string | null;
  /** Gesture key that is still in progress (cleared on pointer-up / blur). */
  activeCoalesceKey?: string | null;
  limit?: number;
}

export const createHistory = <S>(): History<S> => ({ past: [], future: [] });

/**
 * Record `snapshot` (the state *before* the edit) as the next undo step.
 * Redo is dropped, because the timeline just branched.
 */
export function pushHistory<S>(history: History<S>, snapshot: S, options: PushHistoryOptions = {}): History<S> {
  const { coalesceKey = null, activeCoalesceKey = null, limit = ROOM_HISTORY_LIMIT } = options;

  // Mid-gesture: the first snapshot of the gesture is the one worth keeping.
  if (coalesceKey && coalesceKey === activeCoalesceKey && history.past.length > 0) {
    return { past: history.past, future: [] };
  }

  const past = [...history.past, { snapshot, coalesceKey }];
  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    future: [],
  };
}

/** Pop the last undo step, pushing `current` onto the redo stack. */
export function undoHistory<S>(history: History<S>, current: S): HistoryStep<S> | null {
  if (!history.past.length) return null;
  const entry = history.past[history.past.length - 1];
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, { snapshot: current }],
    },
    snapshot: entry.snapshot,
  };
}

/** Pop the last redo step, pushing `current` back onto the undo stack. */
export function redoHistory<S>(history: History<S>, current: S): HistoryStep<S> | null {
  if (!history.future.length) return null;
  const entry = history.future[history.future.length - 1];
  return {
    history: {
      past: [...history.past, { snapshot: current }],
      future: history.future.slice(0, -1),
    },
    snapshot: entry.snapshot,
  };
}

export const canUndoHistory = <S>(history: History<S> | undefined | null): boolean => !!history?.past.length;

export const canRedoHistory = <S>(history: History<S> | undefined | null): boolean => !!history?.future.length;

export type RoomSnapshot = Pick<
  RoomConfig,
  'roomShell' | 'roomShellFillMode' | 'floorMaterial' | 'devicePlacement' | 'furniture' | 'doors'
>;
export type RoomHistoryEntry = HistoryEntry<RoomSnapshot>;
export type RoomHistory = History<RoomSnapshot>;
export type RoomHistoryStep = HistoryStep<RoomSnapshot>;
export type PushRoomHistoryOptions = PushHistoryOptions;

export const createRoomHistory = createHistory<RoomSnapshot>;
export const pushRoomHistory = pushHistory<RoomSnapshot>;
export const undoRoomHistory = undoHistory<RoomSnapshot>;
export const redoRoomHistory = redoHistory<RoomSnapshot>;
export const canUndoRoomHistory = canUndoHistory<RoomSnapshot>;
export const canRedoRoomHistory = canRedoHistory<RoomSnapshot>;

/** Copy the editable subset of a room, deeply enough that later edits cannot mutate it. */
export const snapshotRoom = (room: RoomConfig): RoomSnapshot => ({
  roomShell: room.roomShell
    ? {
      ...room.roomShell,
      points: (room.roomShell.points ?? []).map((point) => ({ ...point })),
      // Locked wall indices are an array too, so copy it or an undo would hand
      // back the very array a later edit is about to rewrite.
      ...(room.roomShell.lockedSegments ? { lockedSegments: [...room.roomShell.lockedSegments] } : {}),
    }
    : room.roomShell,
  roomShellFillMode: room.roomShellFillMode,
  floorMaterial: room.floorMaterial,
  devicePlacement: room.devicePlacement ? { ...room.devicePlacement } : room.devicePlacement,
  furniture: room.furniture ? room.furniture.map((item) => ({ ...item })) : room.furniture,
  doors: room.doors ? room.doors.map((door) => ({ ...door })) : room.doors,
});

/** Put a snapshot back on a room, leaving every non-builder field as it is now. */
export const applyRoomSnapshot = (room: RoomConfig, snapshot: RoomSnapshot): RoomConfig => ({
  ...room,
  ...snapshotRoom({ ...room, ...snapshot }),
});

export const roomSnapshotSignature = (snapshot: RoomSnapshot): string => stableStringify(snapshot);

export const snapshotsEqual = (a: RoomSnapshot, b: RoomSnapshot): boolean =>
  roomSnapshotSignature(a) === roomSnapshotSignature(b);

/** Zones mode edits both shapes; whichever the device is not using stays as loaded. */
export interface ZonesSnapshot {
  zones: ZoneRect[];
  polygonZones: ZonePolygon[];
}

export const snapshotZones = ({ zones, polygonZones }: ZonesSnapshot): ZonesSnapshot => ({
  zones: zones.map((zone) => ({ ...zone })),
  polygonZones: polygonZones.map((zone) => ({ ...zone, vertices: zone.vertices.map((v) => ({ ...v })) })),
});

export const zonesSnapshotsEqual = (a: ZonesSnapshot, b: ZonesSnapshot): boolean =>
  stableStringify(a) === stableStringify(b);
