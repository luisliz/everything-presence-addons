// Usage on room open (F key and Fit button skip the storage read):
//   const viewport = useViewportStorage(roomId);
//   const next = viewport.read() ?? fitViewport(coverageBounds({ room, device, coverage, points }), containerSize, { rangeMm });
//   setZoom(next.zoom); setPan(next.panOffsetMm); viewport.write(next) whenever zoom or pan changes.
// containerSize comes from RoomCanvas `onContainerSizeChange`; coverage from `resolveCanvasCoverage`.
import { type CanvasCoverage, conePolygon } from './coverage.ts';

type Point = { x: number; y: number };

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Viewport {
  zoom: number;
  panOffsetMm: Point;
}

const isFinitePoint = (p: Point | null | undefined): p is Point =>
  !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

export const coverageBounds = ({
  room = [],
  device,
  coverage,
  points = [],
}: {
  room?: Point[];
  device?: Point | null;
  coverage?: CanvasCoverage | null;
  points?: Point[];
}): Bounds | null => {
  const all = [...room, ...points];
  if (isFinitePoint(device)) {
    all.push(device);
    if (coverage && coverage.rangeMm > 0) {
      all.push(
        ...conePolygon(device, coverage, {
          steps: Math.ceil(coverage.fovDeg / 5),
        }),
      );
    }
  }
  const valid = all.filter(isFinitePoint);
  if (!valid.length) return null;
  return valid.reduce(
    (b, p) => ({
      minX: Math.min(b.minX, p.x),
      minY: Math.min(b.minY, p.y),
      maxX: Math.max(b.maxX, p.x),
      maxY: Math.max(b.maxY, p.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
};

export const fitViewport = (
  bounds: Bounds | null,
  container: { width: number; height: number } | null,
  {
    rangeMm,
    minZoom = 0.1,
    maxZoom = 5,
  }: { rangeMm: number; minZoom?: number; maxZoom?: number },
): Viewport => {
  if (!bounds) return { zoom: 1, panOffsetMm: { x: 0, y: 0 } };
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const pad = Math.max(300, 0.06 * Math.max(width, height));
  const aspect =
    container && container.width > 0 && container.height > 0
      ? container.width / container.height
      : 1;
  const zoom = Math.min(
    (rangeMm * Math.max(1, aspect)) / (width + 2 * pad),
    (rangeMm * Math.max(1, 1 / aspect)) / (height + 2 * pad),
  );
  return {
    zoom: Math.min(maxZoom, Math.max(minZoom, zoom)),
    panOffsetMm: {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    },
  };
};

export const parseStoredViewport = (raw: string | null): Viewport | null => {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return Number.isFinite(value?.zoom) &&
      value.zoom > 0 &&
      isFinitePoint(value?.panOffsetMm)
      ? {
          zoom: value.zoom,
          panOffsetMm: { x: value.panOffsetMm.x, y: value.panOffsetMm.y },
        }
      : null;
  } catch {
    return null;
  }
};
