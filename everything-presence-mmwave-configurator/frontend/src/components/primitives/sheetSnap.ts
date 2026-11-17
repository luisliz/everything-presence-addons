export type SheetSnap = 'peek' | 'half' | 'full';

export const SHEET_SNAPS: readonly SheetSnap[] = ['peek', 'half', 'full'];

const PEEK_PX = 88;
const FLING_PX_PER_MS = 0.5;

export function snapHeight(snap: SheetSnap, viewportHeight: number): number {
  if (snap === 'peek') return PEEK_PX;
  return Math.round(viewportHeight * (snap === 'half' ? 0.5 : 0.92));
}

/**
 * Snap a dragged sheet settles on. `velocity` is px/ms, positive while the sheet grows;
 * a fling moves to the next snap in that direction, otherwise the nearest snap wins.
 */
export function resolveSnap(
  height: number,
  viewportHeight: number,
  velocity = 0,
): SheetSnap {
  const heights = SHEET_SNAPS.map((snap) => snapHeight(snap, viewportHeight));
  if (velocity > FLING_PX_PER_MS) {
    const index = heights.findIndex((h) => h > height);
    return SHEET_SNAPS[index === -1 ? SHEET_SNAPS.length - 1 : index];
  }
  if (velocity < -FLING_PX_PER_MS) {
    const below = heights.filter((h) => h < height).length;
    return SHEET_SNAPS[Math.max(0, below - 1)];
  }
  let best = 0;
  heights.forEach((h, index) => {
    if (Math.abs(h - height) < Math.abs(heights[best] - height)) best = index;
  });
  return SHEET_SNAPS[best];
}
