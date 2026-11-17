import type { Point, ZoneRect } from '../api/types';
import { formatLengthLabel } from './lengthLabels.ts';

export interface DeviceFrame {
  x: number;
  y: number;
  rotationDeg: number;
}

export type RectGeometry = Pick<ZoneRect, 'x' | 'y' | 'width' | 'height'>;
export type RectHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

export const MIN_ZONE_SIZE_MM = 100;
export const NUDGE_FALLBACK_STEP_MM = 10;

export const snapValue = (value: number, step: number): number =>
  step > 0 ? Math.round(value / step) * step : value;

export const snapPoint = (p: Point, step: number): Point => ({
  x: snapValue(p.x, step),
  y: snapValue(p.y, step),
});

export const rotatePoint = (p: Point, deg: number): Point => {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
};

export const deviceToRoom = (p: Point, frame?: DeviceFrame | null): Point => {
  if (!frame) return p;
  const r = rotatePoint(p, frame.rotationDeg);
  return { x: r.x + frame.x, y: r.y + frame.y };
};

export const roomToDevice = (p: Point, frame?: DeviceFrame | null): Point =>
  frame
    ? rotatePoint({ x: p.x - frame.x, y: p.y - frame.y }, -frame.rotationDeg)
    : p;

export const roomDeltaToDevice = (
  delta: Point,
  frame?: DeviceFrame | null,
): Point => (frame ? rotatePoint(delta, -frame.rotationDeg) : delta);

// Snap happens on the room grid the user sees; the device-space result is what gets stored.
export const snapRoomToDevice = (
  roomPoint: Point,
  step: number,
  frame?: DeviceFrame | null,
): Point => roomToDevice(snapPoint(roomPoint, step), frame);

export const snappedRoomDelta = (from: Point, to: Point, step: number): Point =>
  snapPoint({ x: to.x - from.x, y: to.y - from.y }, step);

export const translatePoints = <T extends Point>(
  points: T[],
  delta: Point,
): T[] => points.map((p) => ({ ...p, x: p.x + delta.x, y: p.y + delta.y }));

export const constrain45 = (from: Point, to: Point): Point => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx * 2 < absDy) return { x: from.x, y: to.y };
  if (absDy * 2 < absDx) return { x: to.x, y: from.y };
  const mag = Math.max(absDx, absDy);
  return {
    x: from.x + (dx >= 0 ? mag : -mag),
    y: from.y + (dy >= 0 ? mag : -mag),
  };
};

export const withinRadius = (a: Point, b: Point, radius: number): boolean =>
  Math.hypot(a.x - b.x, a.y - b.y) <= radius;

export const rectFromCorners = (
  a: Point,
  b: Point,
  square = false,
): RectGeometry => {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (square) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = dx < 0 ? -side : side;
    dy = dy < 0 ? -side : side;
  }
  return {
    x: Math.min(a.x, a.x + dx),
    y: Math.min(a.y, a.y + dy),
    width: Math.abs(dx),
    height: Math.abs(dy),
  };
};

export const meetsMinSize = (
  rect: RectGeometry,
  min = MIN_ZONE_SIZE_MM,
): boolean => rect.width >= min && rect.height >= min;

export const rectCorners = ({ x, y, width, height }: RectGeometry): Point[] => [
  { x, y },
  { x: x + width, y },
  { x: x + width, y: y + height },
  { x, y: y + height },
];

export const rectHandlePoint = (
  { x, y, width, height }: RectGeometry,
  handle: RectHandle,
): Point => ({
  x: handle.includes('w')
    ? x
    : handle.includes('e')
      ? x + width
      : x + width / 2,
  y: handle.includes('n')
    ? y
    : handle.includes('s')
      ? y + height
      : y + height / 2,
});

// Moves the edges named by `handle` to `to`; the opposite edges stay fixed and the size never drops below `min`.
export const resizeRect = (
  start: RectGeometry,
  handle: RectHandle,
  to: Point,
  min = MIN_ZONE_SIZE_MM,
): RectGeometry => {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (handle.includes('w')) left = Math.min(to.x, right - min);
  if (handle.includes('e')) right = Math.max(to.x, left + min);
  if (handle.includes('n')) top = Math.min(to.y, bottom - min);
  if (handle.includes('s')) bottom = Math.max(to.y, top + min);
  return { x: left, y: top, width: right - left, height: bottom - top };
};

const NUDGE_DIRECTIONS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

export const nudgeDelta = (
  key: string,
  snapMm: number,
  large: boolean,
): Point | null => {
  const dir = NUDGE_DIRECTIONS[key];
  if (!dir) return null;
  const step =
    (snapMm > 0 ? snapMm : NUDGE_FALLBACK_STEP_MM) * (large ? 10 : 1);
  return { x: dir.x * step, y: dir.y * step };
};

export const formatSizeLabel = (
  widthMm: number,
  heightMm: number,
  units: 'metric' | 'imperial',
): string =>
  units === 'metric'
    ? `${(widthMm / 1000).toFixed(2)} × ${(heightMm / 1000).toFixed(2)} m`
    : `${formatLengthLabel(widthMm, units)} × ${formatLengthLabel(heightMm, units)}`;
