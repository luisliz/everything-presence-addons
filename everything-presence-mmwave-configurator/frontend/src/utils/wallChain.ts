import type { Door } from '../api/types.ts';
import { normalizeLockedSegments, remapDoorsForSplit, remapLockedSegmentsForSplit } from './lockState.ts';

/**
 * Extending a closed outline with a new run of walls.
 *
 * The outline is a ring: segment `i` runs `points[i] -> points[(i + 1) % n]`.
 * A new wall chain must therefore start and end *on* the ring (a corner, or a
 * point on a wall, which splits that wall first). The chain then replaces one of
 * the two arcs between its ends. Which arc is the user's intent cannot be read
 * from the clicks alone, so the larger of the two resulting floor areas wins:
 * a bump drawn outward keeps the room and adds the bump, a notch drawn inward
 * keeps the room and cuts the notch, and the small leftover polygon is never
 * what was meant. Undo covers the rest.
 *
 * Doors and locks are wall-indexed, so every change here re-indexes them and
 * drops the ones whose wall no longer exists. Pure, like `lockState`.
 */

export interface ChainPoint {
  x: number;
  y: number;
}

export type ChainAnchor =
  | { kind: 'vertex'; index: number; point: ChainPoint }
  | { kind: 'wall'; index: number; point: ChainPoint; ratio: number };

export interface ChainRing {
  points: ChainPoint[];
  doors?: Door[];
  lockedSegments?: number[];
}

export interface ChainThresholds {
  vertexMm?: number;
  wallMm?: number;
}

export const closestPointOnSegment = (
  point: ChainPoint,
  segStart: ChainPoint,
  segEnd: ChainPoint,
): ChainPoint & { ratio: number } => {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return { ...segStart, ratio: 0 };
  const ratio = Math.max(
    0,
    Math.min(1, ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lengthSq),
  );
  return { x: segStart.x + ratio * dx, y: segStart.y + ratio * dy, ratio };
};

/** Nearest corner within `vertexMm`, else nearest wall within `wallMm`, else null. */
export const findChainAnchor = (
  points: readonly ChainPoint[],
  pt: ChainPoint,
  { vertexMm = 300, wallMm = 300 }: ChainThresholds = {},
): ChainAnchor | null => {
  const n = points.length;
  if (n === 0) return null;
  let best: ChainAnchor | null = null;
  let bestDist = vertexMm;
  points.forEach((p, index) => {
    const d = Math.hypot(p.x - pt.x, p.y - pt.y);
    if (d < bestDist) {
      bestDist = d;
      best = { kind: 'vertex', index, point: { x: p.x, y: p.y } };
    }
  });
  if (best || n < 3) return best;
  bestDist = wallMm;
  points.forEach((a, index) => {
    const b = points[(index + 1) % n];
    const { ratio, ...closest } = closestPointOnSegment(pt, a, b);
    const d = Math.hypot(closest.x - pt.x, closest.y - pt.y);
    if (d < bestDist) {
      bestDist = d;
      best = { kind: 'wall', index, point: closest, ratio };
    }
  });
  return best;
};

export const polygonArea = (points: readonly ChainPoint[]): number => {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
};

const splitRing = (ring: ChainRing, anchor: ChainAnchor): { ring: ChainRing; vertex: number } => {
  if (anchor.kind === 'vertex') return { ring, vertex: anchor.index };
  const points = [...ring.points];
  points.splice(anchor.index + 1, 0, anchor.point);
  return {
    ring: {
      points,
      doors: remapDoorsForSplit(ring.doors, anchor.index, anchor.ratio),
      lockedSegments: remapLockedSegmentsForSplit(ring.lockedSegments, anchor.index),
    },
    vertex: anchor.index + 1,
  };
};

/**
 * Remove every corner strictly between `from` and `to` (walking forward round
 * the ring) and insert `inner` after `from`. With `from === to` the whole rest
 * of the ring goes, leaving `from` plus the chain.
 */
const replaceArc = (ring: ChainRing, from: number, to: number, inner: readonly ChainPoint[]): ChainRing => {
  const n = ring.points.length;
  const removed = new Set<number>();
  for (let k = (from + 1) % n; k !== to; k = (k + 1) % n) removed.add(k);

  const points: ChainPoint[] = [];
  const newIndex = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    if (removed.has(i)) continue;
    newIndex.set(i, points.length);
    points.push(ring.points[i]);
    if (i === from) points.push(...inner.map((p) => ({ x: p.x, y: p.y })));
  }
  const m = points.length;
  const segment = (old: number): number | null => {
    const a = newIndex.get(old);
    const b = newIndex.get((old + 1) % n);
    if (a === undefined || b === undefined) return null;
    return (a + 1) % m === b ? a : null;
  };
  return {
    points,
    doors: (ring.doors ?? []).flatMap((door) => {
      const mapped = segment(door.segmentIndex);
      return mapped === null ? [] : [mapped === door.segmentIndex ? door : { ...door, segmentIndex: mapped }];
    }),
    lockedSegments: normalizeLockedSegments(
      (ring.lockedSegments ?? []).map(segment).filter((v): v is number => v !== null),
      m,
    ),
  };
};

/**
 * Splice a wall chain into a closed outline. `chain[0]` and the last chain point
 * must each land on a corner or a wall (within the thresholds); everything in
 * between is new corners. Returns null when the chain cannot attach, or when it
 * would add no corner at all.
 */
export const spliceChainIntoRing = (
  ring: ChainRing,
  chain: readonly ChainPoint[],
  thresholds: ChainThresholds = {},
): ChainRing | null => {
  if (ring.points.length < 3 || chain.length < 2) return null;
  const startAnchor = findChainAnchor(ring.points, chain[0], thresholds);
  if (!startAnchor) return null;
  const afterStart = splitRing(ring, startAnchor);
  // Resolve the end against the already split ring, so ending on the wall that was just split still works.
  const endAnchor = findChainAnchor(afterStart.ring.points, chain[chain.length - 1], thresholds);
  if (!endAnchor) return null;
  const afterEnd = splitRing(afterStart.ring, endAnchor);
  // A wall split at or before the start corner shifts that corner up by one.
  const s = endAnchor.kind === 'wall' && afterEnd.vertex <= afterStart.vertex
    ? afterStart.vertex + 1
    : afterStart.vertex;
  const t = afterEnd.vertex;
  const inner = chain.slice(1, -1);
  if (s === t && inner.length < 2) return null;

  const forward = replaceArc(afterEnd.ring, s, t, inner);
  if (s === t) return forward;
  const backward = replaceArc(afterEnd.ring, t, s, [...inner].reverse());
  return polygonArea(backward.points) > polygonArea(forward.points) ? backward : forward;
};
