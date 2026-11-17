import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type RoomUpdatePayload, updateRoom } from '../../../api/rooms';
import type {
  DevicePlacement,
  Door,
  FurnitureInstance,
  FurnitureType,
  RoomConfig,
} from '../../../api/types';
import {
  type BasicRoomShapeSelection,
  resizeBasicRoomShapeWall,
} from '../../../components/BasicRoomShapesPicker';
import type { DoorValidation } from '../../../components/DoorEditor';
import { useWallDrawing } from '../../../hooks/useWallDrawing';
import { clampDoorPosition } from '../../../utils/doorGeometry';
import {
  applyDevicePlacementUpdate,
  getLockedSegments,
  isSegmentLocked,
  isVertexLocked,
  normalizeLockedSegments,
  remapDoorsForPointRemoval,
  remapDoorsForSplit,
  remapLockedSegmentsForPointRemoval,
  remapLockedSegmentsForSplit,
  resolveLockedUpdate,
  setItemsLocked,
  setShellLocked,
  toggleSegmentLock,
} from '../../../utils/lockState';
import { resolveDeleteKeyTarget } from '../../../utils/roomBuilderSelection';
import { centerRoomSnapshot } from '../../../utils/roomCentering';
import {
  applyRoomSnapshot,
  canRedoRoomHistory,
  canUndoRoomHistory,
  createRoomHistory,
  pushRoomHistory,
  ROOM_HISTORY_LIMIT,
  type RoomHistory,
  type RoomSnapshot,
  redoRoomHistory,
  roomSnapshotSignature,
  snapshotRoom,
  undoRoomHistory,
} from '../../../utils/roomHistory';
import {
  canRotateRoomSnapshot,
  normalizeSignedAngle,
  type RotationScope,
  rotatePointsKeepingBoundsCenter,
  rotateRoomSnapshot,
} from '../../../utils/roomRotation';
import type { RoomShapePoint } from '../../../utils/roomShapes';
import { stableStringify } from '../../../utils/stableStringify';
import { NO_SELECTION, type Selection } from '../types';

type Point = { x: number; y: number };
type CommitOptions = { coalesceKey?: string };
/** Splitting a wall or removing a corner renumbers walls, so those two edits pass remapped locks and doors. */
type PointsOptions = CommitOptions & {
  lockedSegments?: number[];
  doors?: Door[];
};

export type LayoutTool = 'select' | 'walls' | 'door' | 'furniture';

/** Keep in step with the `room-rotate-spin` keyframes in index.css. */
const ROTATION_SPIN_MS = 420;
const DEFAULT_DOOR_WIDTH_MM = 800;
const SNAPSHOT_KEYS: ReadonlyArray<keyof RoomSnapshot> = [
  'roomShell',
  'roomShellFillMode',
  'floorMaterial',
  'devicePlacement',
  'furniture',
  'doors',
];

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

const pointsOf = (room: RoomConfig) => room.roomShell?.points ?? [];

const snapToGrid = (pt: Point, step: number) =>
  step > 0
    ? { x: Math.round(pt.x / step) * step, y: Math.round(pt.y / step) * step }
    : pt;

/** Constrains a drag delta to 0, 45 or 90 degrees. */
const snapDelta = (dx: number, dy: number) => {
  const [ax, ay] = [Math.abs(dx), Math.abs(dy)];
  if (ax * 2 < ay) return { dx: 0, dy };
  if (ay * 2 < ax) return { dx, dy: 0 };
  const mag = Math.max(ax, ay);
  return { dx: Math.sign(dx || 1) * mag, dy: Math.sign(dy || 1) * mag };
};

export const doorIssues = (door: Door, room: RoomConfig): DoorValidation => {
  const pts = pointsOf(room);
  const a = pts[door.segmentIndex];
  const b = pts[(door.segmentIndex + 1) % pts.length];
  if (pts.length < 3 || !a || !b)
    return { overlaps: false, nearCorner: false, tooWide: false };
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const half = (d: Door) => d.widthMm / length / 2;
  return {
    tooWide: door.widthMm / length > 0.9,
    nearCorner: door.positionOnSegment < 0.1 || door.positionOnSegment > 0.9,
    overlaps: (room.doors ?? []).some(
      (other) =>
        other.id !== door.id &&
        other.segmentIndex === door.segmentIndex &&
        Math.abs(other.positionOnSegment - door.positionOnSegment) <=
          half(door) + half(other),
    ),
  };
};

export interface LayoutEditorOptions {
  /** The room as last loaded or saved. */
  room: RoomConfig;
  selection: Selection;
  select: (selection: Selection) => void;
  /** Called after edits that move the plan far enough that the view should follow. */
  fitTo: (room: RoomConfig) => void;
  notify: (message: string) => void;
  onSaved: (room: RoomConfig) => void;
}

export function useLayoutEditor({
  room: loaded,
  selection,
  select,
  fitTo,
  notify,
  onSaved,
}: LayoutEditorOptions) {
  const [room, setRoom] = useState(loaded);
  const [saved, setSaved] = useState(loaded);
  const roomRef = useRef(room);
  roomRef.current = room;

  const dirtyCount = useMemo(() => {
    const [now, base] = [snapshotRoom(room), snapshotRoom(saved)];
    return SNAPSHOT_KEYS.filter(
      (key) => stableStringify(now[key]) !== stableStringify(base[key]),
    ).length;
  }, [room, saved]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only an outside update to the loaded room re-seeds a clean draft
  useEffect(() => {
    if (dirtyCount > 0) return;
    roomRef.current = loaded;
    setRoom(loaded);
    setSaved(loaded);
  }, [loaded]);

  const historyRef = useRef<RoomHistory>(createRoomHistory());
  const gestureRef = useRef<string | null>(null);
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });
  const syncHistory = useCallback(() => {
    const h = historyRef.current;
    const next = {
      canUndo: canUndoRoomHistory(h),
      canRedo: canRedoRoomHistory(h),
    };
    setHistoryState((prev) =>
      prev.canUndo === next.canUndo && prev.canRedo === next.canRedo
        ? prev
        : next,
    );
  }, []);
  const endGesture = useCallback(() => {
    gestureRef.current = null;
  }, []);
  useEffect(() => {
    const events = ['pointerup', 'pointercancel', 'focusout'] as const;
    for (const name of events) window.addEventListener(name, endGesture);
    return () => {
      for (const name of events) window.removeEventListener(name, endGesture);
    };
  }, [endGesture]);

  /** The one write path for edits: records the pre-edit snapshot so Undo can restore it. */
  const commit = useCallback(
    (next: RoomConfig, options: CommitOptions = {}) => {
      const previous = snapshotRoom(roomRef.current);
      const key = options.coalesceKey ?? null;
      if (
        roomSnapshotSignature(previous) !==
        roomSnapshotSignature(snapshotRoom(next))
      ) {
        historyRef.current = pushRoomHistory(historyRef.current, previous, {
          coalesceKey: key,
          activeCoalesceKey: gestureRef.current,
          limit: ROOM_HISTORY_LIMIT,
        });
        gestureRef.current = key;
        syncHistory();
      }
      roomRef.current = next;
      setRoom(next);
    },
    [syncHistory],
  );

  const changePoints = useCallback(
    (points: Point[], options: PointsOptions = {}) => {
      const current = roomRef.current;
      const shell = current.roomShell;
      const lockedSegments = normalizeLockedSegments(
        options.lockedSegments ?? shell?.lockedSegments,
        points.length,
      );
      commit(
        {
          ...current,
          roomShell: {
            ...shell,
            points,
            locked: shell?.locked ? true : undefined,
            lockedSegments: lockedSegments.length ? lockedSegments : undefined,
          },
          ...(options.doors?.length ? { doors: options.doors } : {}),
        },
        options,
      );
    },
    [commit],
  );

  const [snapGridMm, setSnapGridMm] = useState(100);
  const [angleSnap, setAngleSnap] = useState(false);
  const drawing = useWallDrawing({
    snapGridMm,
    onPointsChange: changePoints,
    currentPoints: pointsOf(room),
  });
  const { stopDrawing, setIsDrawingWall, setPendingStart } = drawing;

  const [doorMode, setDoorMode] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [activeShape, setActiveShape] =
    useState<BasicRoomShapeSelection | null>(null);
  const [shapeRotationDeg, setShapeRotationDeg] = useState(0);
  const [pendingShape, setPendingShape] = useState<{
    points: RoomShapePoint[];
    selection: BasicRoomShapeSelection;
  } | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearedPoints, setClearedPoints] = useState<Point[] | null>(null);
  const [rotationScope, setRotationScope] = useState<RotationScope>('layout');
  const [spin, setSpin] = useState<{ fromDeg: number; id: number } | null>(
    null,
  );
  const spinRef = useRef({ id: 0, timer: 0, frame: 0 });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  type Drag =
    | { kind: 'segment'; index: number; start: Point; base: Point[] }
    | {
        kind: 'endpoint';
        segment: number;
        endpoint: 'start' | 'end';
        start: Point;
        base: Point[];
      }
    | { kind: 'door'; id: string };
  const dragRef = useRef<Drag | null>(null);

  const selectedWall = selection.kind === 'wall' ? selection.index : null;
  const selectedDoorId = selection.kind === 'door' ? selection.id : null;
  const selectedFurnitureId =
    selection.kind === 'furniture' ? selection.id : null;

  const tool: LayoutTool = drawing.isDrawingWall
    ? 'walls'
    : doorMode
      ? 'door'
      : libraryOpen
        ? 'furniture'
        : 'select';

  const setTool = useCallback(
    (next: LayoutTool) => {
      if (next === 'door' && pointsOf(roomRef.current).length < 3) {
        notify('Draw the walls before adding a door.');
        return;
      }
      if (next !== 'walls') stopDrawing();
      setDoorMode(next === 'door');
      setLibraryOpen(next === 'furniture');
      if (next !== 'select') select(NO_SELECTION);
      if (next === 'walls') {
        setActiveShape(null);
        setIsDrawingWall(true);
      }
    },
    [notify, select, setIsDrawingWall, stopDrawing],
  );

  useEffect(() => {
    if (!activeShape) setShapeRotationDeg(0);
  }, [activeShape]);

  const resetInteractions = useCallback(() => {
    dragRef.current = null;
    setDoorMode(false);
  }, []);

  const step = useCallback(
    (direction: 'undo' | 'redo') => {
      const current = roomRef.current;
      const snapshot = snapshotRoom(current);
      const result =
        direction === 'undo'
          ? undoRoomHistory(historyRef.current, snapshot)
          : redoRoomHistory(historyRef.current, snapshot);
      if (!result) return;
      historyRef.current = result.history;
      endGesture();
      const restored = applyRoomSnapshot(current, result.snapshot);
      roomRef.current = restored;
      setRoom(restored);
      syncHistory();
      resetInteractions();
      setActiveShape(null);
      const points = pointsOf(restored);
      if (
        (selection.kind === 'wall' && selection.index >= points.length) ||
        (selection.kind === 'door' &&
          !(restored.doors ?? []).some((d) => d.id === selection.id)) ||
        (selection.kind === 'furniture' &&
          !(restored.furniture ?? []).some((f) => f.id === selection.id))
      )
        select(NO_SELECTION);
      if (drawing.isDrawingWall)
        setPendingStart(points.length ? points[points.length - 1] : null);
    },
    [
      drawing.isDrawingWall,
      endGesture,
      resetInteractions,
      select,
      selection,
      setPendingStart,
      syncHistory,
    ],
  );
  const undo = useCallback(() => step('undo'), [step]);
  const redo = useCallback(() => step('redo'), [step]);

  const playSpin = useCallback((angle: number) => {
    const s = spinRef.current;
    window.clearTimeout(s.timer);
    cancelAnimationFrame(s.frame);
    setSpin(null);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = ++s.id;
    s.frame = requestAnimationFrame(() => {
      setSpin({ fromDeg: -angle, id });
      s.timer = window.setTimeout(
        () => setSpin((cur) => (cur?.id === id ? null : cur)),
        ROTATION_SPIN_MS + 120,
      );
    });
  }, []);
  useEffect(() => {
    const s = spinRef.current;
    return () => {
      window.clearTimeout(s.timer);
      cancelAnimationFrame(s.frame);
    };
  }, []);
  const endSpin = useCallback(() => setSpin(null), []);

  /** Turns walls, doors, furniture and (in `layout` scope) the sensor as one undo step; locks are overridden on purpose. */
  const rotate = useCallback(
    (angleDeg: number, scope: RotationScope = rotationScope) => {
      const current = roomRef.current;
      const snapshot = snapshotRoom(current);
      if (!canRotateRoomSnapshot(snapshot)) return;
      const angle = normalizeSignedAngle(angleDeg);
      const rotated = rotateRoomSnapshot(snapshot, angle, scope);
      if (rotated === snapshot) return;
      endGesture();
      commit(applyRoomSnapshot(current, rotated));
      stopDrawing();
      resetInteractions();
      if (selection.kind === 'wall') select(NO_SELECTION);
      setShapeRotationDeg((prev) => normalizeSignedAngle(prev + angle));
      playSpin(angle);
    },
    [
      commit,
      endGesture,
      playSpin,
      resetInteractions,
      rotationScope,
      select,
      selection.kind,
      stopDrawing,
    ],
  );

  /** Slides the whole plan so the outline's bounding-box centre sits on (0,0); returns the moved room, or null when already there. */
  const center = useCallback((): RoomConfig | null => {
    const current = roomRef.current;
    const snapshot = snapshotRoom(current);
    const centered = centerRoomSnapshot(snapshot);
    if (centered === snapshot) return null;
    const next = applyRoomSnapshot(current, centered);
    endGesture();
    commit(next);
    stopDrawing();
    resetInteractions();
    fitTo(next);
    return next;
  }, [commit, endGesture, fitTo, resetInteractions, stopDrawing]);

  const lockedWalls = useMemo(
    () => getLockedSegments(room.roomShell, pointsOf(room).length),
    [room],
  );

  const setShellLock = useCallback(
    (locked: boolean) => {
      const current = roomRef.current;
      if (!current.roomShell?.points?.length) return;
      commit({
        ...current,
        roomShell: setShellLocked(current.roomShell, locked),
      });
    },
    [commit],
  );
  const toggleWallLock = useCallback(
    (index: number) => {
      const current = roomRef.current;
      if (!current.roomShell?.points?.length) return;
      commit({
        ...current,
        roomShell: toggleSegmentLock(current.roomShell, index),
      });
    },
    [commit],
  );
  const toggleItemLock = useCallback(
    (kind: 'furniture' | 'doors', id: string) => {
      const current = roomRef.current;
      const items = (current[kind] ?? []) as Array<{
        id: string;
        locked?: boolean;
      }>;
      commit({
        ...current,
        [kind]: items.map((item) =>
          item.id === id
            ? { ...item, locked: item.locked ? undefined : true }
            : item,
        ),
      });
    },
    [commit],
  );
  const lockAll = useCallback(
    (kind: 'furniture' | 'doors', locked: boolean) => {
      const current = roomRef.current;
      const items = current[kind];
      if (!items?.length) return;
      commit({
        ...current,
        [kind]: setItemsLocked<{ locked?: boolean }>(items, locked),
      });
    },
    [commit],
  );

  const updatePlacement = useCallback(
    (updates: Partial<DevicePlacement>) => {
      const current = roomRef.current;
      const base = current.devicePlacement ?? { x: 0, y: 0, rotationDeg: 0 };
      commit(
        {
          ...current,
          devicePlacement: applyDevicePlacementUpdate(base, updates),
        },
        { coalesceKey: 'device:placement' },
      );
    },
    [commit],
  );

  const addFurniture = useCallback(
    (type: FurnitureType) => {
      const current = roomRef.current;
      const item: FurnitureInstance = {
        id: newId(),
        typeId: type.id,
        x: 0,
        y: 0,
        width: type.defaultWidth,
        depth: type.defaultDepth,
        height: type.defaultHeight,
        rotationDeg: 0,
        aspectRatioLocked: true,
      };
      commit({ ...current, furniture: [...(current.furniture ?? []), item] });
      setLibraryOpen(false);
      select({ kind: 'furniture', id: item.id });
    },
    [commit, select],
  );

  const changeFurniture = useCallback(
    (updated: FurnitureInstance) => {
      const current = roomRef.current;
      const existing = (current.furniture ?? []).find(
        (f) => f.id === updated.id,
      );
      const next = resolveLockedUpdate(existing, updated);
      if (!next) return;
      commit(
        {
          ...current,
          furniture: (current.furniture ?? []).map((f) =>
            f.id === updated.id ? next : f,
          ),
        },
        { coalesceKey: `furniture:${updated.id}` },
      );
    },
    [commit],
  );

  const deleteFurniture = useCallback(
    (id: string) => {
      const current = roomRef.current;
      if ((current.furniture ?? []).some((f) => f.id === id && f.locked)) {
        notify('This furniture is locked. Unlock it before deleting it.');
        return;
      }
      commit({
        ...current,
        furniture: (current.furniture ?? []).filter((f) => f.id !== id),
      });
      select(NO_SELECTION);
    },
    [commit, notify, select],
  );

  const placeDoor = useCallback(
    (segmentIndex: number, position: number) => {
      const current = roomRef.current;
      if (!doorMode || isSegmentLocked(current.roomShell, segmentIndex)) return;
      const pts = pointsOf(current);
      const a = pts[segmentIndex];
      const b = pts[(segmentIndex + 1) % pts.length];
      const door: Door = {
        id: newId(),
        style: 'single',
        segmentIndex,
        positionOnSegment:
          a && b
            ? clampDoorPosition(
                position,
                DEFAULT_DOOR_WIDTH_MM,
                Math.hypot(b.x - a.x, b.y - a.y),
              )
            : position,
        widthMm: DEFAULT_DOOR_WIDTH_MM,
        swingDirection: 'in',
        swingSide: 'left',
      };
      commit({ ...current, doors: [...(current.doors ?? []), door] });
      setDoorMode(false);
      select({ kind: 'door', id: door.id });
    },
    [commit, doorMode, select],
  );

  const changeDoor = useCallback(
    (updated: Door) => {
      const current = roomRef.current;
      const existing = (current.doors ?? []).find((d) => d.id === updated.id);
      const unlocked = resolveLockedUpdate(existing, updated);
      if (!unlocked) return;
      const pts = pointsOf(current);
      const a = pts[unlocked.segmentIndex];
      const b = pts[(unlocked.segmentIndex + 1) % pts.length];
      const next =
        a && b
          ? {
              ...unlocked,
              positionOnSegment: clampDoorPosition(
                unlocked.positionOnSegment,
                unlocked.widthMm,
                Math.hypot(b.x - a.x, b.y - a.y),
              ),
            }
          : unlocked;
      commit(
        {
          ...current,
          doors: (current.doors ?? []).map((d) =>
            d.id === updated.id ? next : d,
          ),
        },
        { coalesceKey: `door:${updated.id}` },
      );
    },
    [commit],
  );

  const deleteDoor = useCallback(
    (id: string) => {
      const current = roomRef.current;
      if ((current.doors ?? []).some((d) => d.id === id && d.locked)) {
        notify('This door is locked. Unlock it before deleting it.');
        return;
      }
      commit({
        ...current,
        doors: (current.doors ?? []).filter((d) => d.id !== id),
      });
      select(NO_SELECTION);
    },
    [commit, notify, select],
  );

  const setWallLength = useCallback(
    (index: number, lengthMm: number) => {
      const current = roomRef.current;
      const pts = pointsOf(current);
      if (pts.length < 2 || isSegmentLocked(current.roomShell, index)) return;
      const a = pts[index];
      const b = pts[(index + 1) % pts.length];
      if (!a || !b) return;
      const scale =
        Math.max(100, lengthMm) / (Math.hypot(b.x - a.x, b.y - a.y) || 1);
      const next = [...pts];
      next[(index + 1) % pts.length] = {
        x: a.x + (b.x - a.x) * scale,
        y: a.y + (b.y - a.y) * scale,
      };
      changePoints(next, { coalesceKey: `wall-length:${index}` });
    },
    [changePoints],
  );

  const offsetWall = useCallback(
    (index: number, mm: number) => {
      const current = roomRef.current;
      const pts = pointsOf(current);
      if (pts.length < 2 || isSegmentLocked(current.roomShell, index)) return;
      const bIdx = (index + 1) % pts.length;
      const [a, b] = [pts[index], pts[bIdx]];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const [nx, ny] = [(-(b.y - a.y) / len) * mm, ((b.x - a.x) / len) * mm];
      const next = pts.map((p) => ({ ...p }));
      next[index] = { x: a.x + nx, y: a.y + ny };
      next[bIdx] = { x: b.x + nx, y: b.y + ny };
      changePoints(next);
    },
    [changePoints],
  );

  const splitWall = useCallback(
    (index: number, point?: Point) => {
      const current = roomRef.current;
      const pts = pointsOf(current);
      if (
        pts.length < 2 ||
        drawing.isDrawingWall ||
        doorMode ||
        isSegmentLocked(current.roomShell, index)
      )
        return;
      const a = pts[index];
      const b = pts[(index + 1) % pts.length];
      const snapped = snapToGrid(
        point ?? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        snapGridMm,
      );
      const nearest = Math.min(
        Math.hypot(snapped.x - a.x, snapped.y - a.y),
        Math.hypot(snapped.x - b.x, snapped.y - b.y),
      );
      if (nearest < 50) return;
      const next = [...pts];
      next.splice(
        index === pts.length - 1 ? pts.length : index + 1,
        0,
        snapped,
      );
      const ratio =
        Math.hypot(snapped.x - a.x, snapped.y - a.y) /
        (Math.hypot(b.x - a.x, b.y - a.y) || 1);
      changePoints(next, {
        lockedSegments: remapLockedSegmentsForSplit(
          current.roomShell?.lockedSegments,
          index,
        ),
        doors: remapDoorsForSplit(current.doors, index, ratio),
      });
      select({ kind: 'wall', index });
    },
    [changePoints, doorMode, drawing.isDrawingWall, select, snapGridMm],
  );

  /** Removes the corner at the end of the wall, merging it with the next one. */
  const deleteWallPoint = useCallback(
    (index: number) => {
      const current = roomRef.current;
      const pts = pointsOf(current);
      const removeIdx = (index + 1) % pts.length;
      if (
        pts.length <= 2 ||
        isSegmentLocked(current.roomShell, index) ||
        isSegmentLocked(current.roomShell, removeIdx)
      )
        return;
      changePoints(
        pts.filter((_, i) => i !== removeIdx),
        {
          lockedSegments: remapLockedSegmentsForPointRemoval(
            current.roomShell?.lockedSegments,
            removeIdx,
            pts.length,
          ),
          doors: remapDoorsForPointRemoval(
            current.doors,
            removeIdx,
            pts.length,
          ),
        },
      );
      select(NO_SELECTION);
    },
    [changePoints, select],
  );

  const applyShape = useCallback(
    (points: RoomShapePoint[], shape: BasicRoomShapeSelection) => {
      const current = roomRef.current;
      const next: RoomConfig = { ...current, roomShell: { points }, doors: [] };
      commit(next);
      stopDrawing();
      resetInteractions();
      select(NO_SELECTION);
      setActiveShape(shape);
      setShapeRotationDeg(0);
      setPendingShape(null);
      fitTo(next);
    },
    [commit, fitTo, resetInteractions, select, stopDrawing],
  );

  const requestShape = useCallback(
    (points: RoomShapePoint[], shape: BasicRoomShapeSelection) => {
      if (lockedWalls.length) {
        notify(
          'Some walls are locked. Unlock them before replacing the room shape.',
        );
        return;
      }
      if (pointsOf(roomRef.current).length)
        setPendingShape({ points, selection: shape });
      else applyShape(points, shape);
    },
    [applyShape, lockedWalls.length, notify],
  );

  const resizeShapeWall = useCallback(
    (index: number, lengthMm: number) => {
      if (!activeShape) return;
      try {
        const resized = resizeBasicRoomShapeWall(activeShape, index, lengthMm);
        const points = rotatePointsKeepingBoundsCenter(
          resized.points,
          shapeRotationDeg,
        );
        setActiveShape(resized.selection);
        changePoints(points);
        fitTo({ ...roomRef.current, roomShell: { points } });
      } catch {
        // Invalid dimensions keep the last valid outline.
      }
    },
    [activeShape, changePoints, fitTo, shapeRotationDeg],
  );

  const requestClear = useCallback(() => {
    if (!pointsOf(roomRef.current).length) {
      stopDrawing();
      return;
    }
    if (lockedWalls.length) {
      notify(
        'Some walls are locked. Unlock them before clearing the room outline.',
      );
      return;
    }
    setClearConfirmOpen(true);
  }, [lockedWalls.length, notify, stopDrawing]);

  const confirmClear = useCallback(() => {
    setClearedPoints(pointsOf(roomRef.current));
    changePoints([]);
    setActiveShape(null);
    stopDrawing();
    select(NO_SELECTION);
    setClearConfirmOpen(false);
  }, [changePoints, select, stopDrawing]);

  const restoreCleared = useCallback(() => {
    if (!clearedPoints?.length) return;
    changePoints(clearedPoints);
    setClearedPoints(null);
  }, [changePoints, clearedPoints]);

  const finishWalls = useCallback(() => {
    const pts = pointsOf(roomRef.current);
    if (pts.length >= 2) {
      const [first, last] = [pts[0], pts[pts.length - 1]];
      if (Math.hypot(first.x - last.x, first.y - last.y) < 250) {
        const next = [...pts];
        next[next.length - 1] = first;
        changePoints(next);
      }
    }
    stopDrawing();
    if (pts.length >= 3) fitTo(roomRef.current);
  }, [changePoints, fitTo, stopDrawing]);

  const canvas = {
    click: (pt: Point) => {
      if (drawing.isDrawingWall) drawing.handleCanvasClick(pt);
      else select(NO_SELECTION);
    },
    move: (pt: Point) => {
      const drag = dragRef.current;
      const current = roomRef.current;
      if (drag?.kind === 'door') {
        const door = current.doors?.find((d) => d.id === drag.id);
        const pts = pointsOf(current);
        if (!door || door.locked) return;
        const a = pts[door.segmentIndex];
        const b = pts[(door.segmentIndex + 1) % pts.length];
        if (!a || !b) return;
        const [dx, dy] = [b.x - a.x, b.y - a.y];
        const len2 = dx * dx + dy * dy;
        if (len2 < 1) return;
        const t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2;
        changeDoor({ ...door, positionOnSegment: Math.max(0, Math.min(1, t)) });
        return;
      }
      if (drag?.kind === 'endpoint' || drag?.kind === 'segment') {
        let { dx, dy } = { dx: pt.x - drag.start.x, dy: pt.y - drag.start.y };
        if (angleSnap) ({ dx, dy } = snapDelta(dx, dy));
        const next = drag.base.map((p) => ({ ...p }));
        const moved =
          drag.kind === 'segment'
            ? [drag.index, (drag.index + 1) % next.length]
            : [
                drag.endpoint === 'start'
                  ? drag.segment
                  : (drag.segment + 1) % next.length,
              ];
        for (const i of moved)
          next[i] = snapToGrid(
            { x: drag.base[i].x + dx, y: drag.base[i].y + dy },
            snapGridMm,
          );
        changePoints(next, {
          coalesceKey:
            drag.kind === 'segment'
              ? `points:segment-drag:${drag.index}`
              : `points:endpoint-drag:${drag.segment}:${drag.endpoint}`,
        });
        return;
      }
      if (drawing.isDrawingWall) drawing.handleCanvasMove(pt);
    },
    release: () => {
      dragRef.current = null;
      endGesture();
    },
    segmentDragStart: (index: number, start: Point) => {
      const current = roomRef.current;
      const pts = pointsOf(current);
      if (
        !pts.length ||
        isSegmentLocked(current.roomShell, index) ||
        isVertexLocked(current.roomShell, index, pts.length) ||
        isVertexLocked(current.roomShell, (index + 1) % pts.length, pts.length)
      )
        return;
      dragRef.current = { kind: 'segment', index, start, base: pts };
    },
    endpointDragStart: (
      segment: number,
      endpoint: 'start' | 'end',
      start: Point,
    ) => {
      const current = roomRef.current;
      const pts = pointsOf(current);
      const corner =
        endpoint === 'start' ? segment : (segment + 1) % pts.length;
      if (!pts.length || isVertexLocked(current.roomShell, corner, pts.length))
        return;
      dragRef.current = {
        kind: 'endpoint',
        segment,
        endpoint,
        start,
        base: pts,
      };
    },
    doorDragStart: (id: string) => {
      if (roomRef.current.doors?.find((d) => d.id === id && !d.locked))
        dragRef.current = { kind: 'door', id };
    },
  };

  /** Del and Backspace act on the selection first, then on the wall being drawn. */
  const deleteKeyTarget = resolveDeleteKeyTarget({
    selectedFurnitureId,
    selectedDoorId,
    selectedSegment: selectedWall,
    isDrawingWall: drawing.isDrawingWall,
    hasRoomOutline: pointsOf(room).length > 0,
  });
  const deleteSelection = useCallback(() => {
    if (deleteKeyTarget === 'furniture' && selectedFurnitureId)
      deleteFurniture(selectedFurnitureId);
    else if (deleteKeyTarget === 'door' && selectedDoorId)
      deleteDoor(selectedDoorId);
    else if (deleteKeyTarget === 'wallPoint' && selectedWall !== null)
      deleteWallPoint(selectedWall);
    else if (deleteKeyTarget === 'lastDrawnPoint') drawing.removeLastPoint();
    return deleteKeyTarget !== null;
  }, [
    deleteDoor,
    deleteFurniture,
    deleteKeyTarget,
    deleteWallPoint,
    drawing,
    selectedDoorId,
    selectedFurnitureId,
    selectedWall,
  ]);

  /** Re-centres the plan when the outline changed since the last save, then writes the room. */
  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      const current = roomRef.current;
      const outlineChanged =
        stableStringify(pointsOf(current)) !== stableStringify(pointsOf(saved));
      const toSave = (outlineChanged && center()) || current;
      const payload: RoomUpdatePayload = {
        ...toSave,
        roomShell: toSave.roomShell?.points?.length ? toSave.roomShell : null,
      };
      const result = await updateRoom(current.id, payload);
      roomRef.current = result.room;
      setRoom(result.room);
      setSaved(result.room);
      setSaveError(null);
      onSaved(result.room);
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save the layout';
      setSaveError(message);
      notify(message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [center, notify, onSaved, saved]);

  const discard = useCallback(() => {
    roomRef.current = saved;
    setRoom(saved);
    historyRef.current = createRoomHistory();
    endGesture();
    syncHistory();
    setClearedPoints(null);
  }, [endGesture, saved, syncHistory]);

  return {
    room,
    commit,
    changePoints,
    dirtyCount,
    saving,
    saveError,
    save,
    discard,
    canUndo: historyState.canUndo,
    canRedo: historyState.canRedo,
    undo,
    redo,
    tool,
    setTool,
    drawing,
    finishWalls,
    doorMode,
    libraryOpen,
    snapGridMm,
    setSnapGridMm,
    angleSnap,
    setAngleSnap,
    activeShape,
    requestShape,
    pendingShape,
    applyShape,
    cancelShape: () => setPendingShape(null),
    resizeShapeWall,
    clearConfirmOpen,
    requestClear,
    confirmClear,
    cancelClear: () => setClearConfirmOpen(false),
    clearedPoints,
    restoreCleared,
    dismissCleared: () => setClearedPoints(null),
    rotationScope,
    setRotationScope,
    rotate,
    center,
    spin,
    endSpin,
    lockedWalls,
    setShellLock,
    toggleWallLock,
    toggleItemLock,
    lockAll,
    updatePlacement,
    addFurniture,
    changeFurniture,
    deleteFurniture,
    placeDoor,
    changeDoor,
    deleteDoor,
    setWallLength,
    offsetWall,
    splitWall,
    deleteWallPoint,
    canvas,
    deleteKeyTarget,
    deleteSelection,
  };
}

export type LayoutEditor = ReturnType<typeof useLayoutEditor>;
