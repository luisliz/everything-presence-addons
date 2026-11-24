import { useState, useCallback } from 'react';
import type { Point } from '../components/RoomCanvas';
import { findChainAnchor } from '../utils/wallChain';

interface UseWallDrawingOptions {
  snapGridMm: number;
  onPointsChange: (points: Point[]) => void;
  /** A finished chain on a closed outline: first and last point sit on the outline. */
  onChainComplete: (chain: Point[]) => void;
  onStartRejected?: () => void;
  currentPoints: Point[];
}

/**
 * Two drawing modes share one tool:
 *
 * - `'new'`: no closed outline yet. Every click commits a corner, so the
 *   outline grows on the canvas and the first corner closes it.
 * - `'extend'`: the outline is a closed ring. The chain stays in local state
 *   until it lands back on the ring, then `onChainComplete` splices it in as
 *   one edit. Nothing is committed for a chain that is abandoned.
 */
export function useWallDrawing({
  snapGridMm,
  onPointsChange,
  onChainComplete,
  onStartRejected,
  currentPoints,
}: UseWallDrawingOptions) {
  const [isDrawingWall, setIsDrawingWall] = useState(false);
  const [mode, setMode] = useState<'new' | 'extend'>('new');
  const [chain, setChain] = useState<Point[]>([]);
  const [pendingStart, setPendingStart] = useState<Point | null>(null);
  const [previewPoint, setPreviewPoint] = useState<Point | null>(null);

  const snapPointToGrid = useCallback(
    (pt: Point) => {
      if (!snapGridMm || snapGridMm <= 0) return pt;
      const step = snapGridMm;
      return {
        x: Math.round(pt.x / step) * step,
        y: Math.round(pt.y / step) * step,
      };
    },
    [snapGridMm]
  );

  const snapToExisting = useCallback(
    (pt: Point, threshold = 300) => {
      const candidates = currentPoints;
      let best = pt;
      let bestDist = threshold;
      candidates.forEach((p) => {
        const d = Math.hypot(p.x - pt.x, p.y - pt.y);
        if (d < bestDist) {
          best = p;
          bestDist = d;
        }
      });
      return best;
    },
    [currentPoints]
  );

  /** Corners and walls of the ring are magnets while extending; elsewhere only corners are. */
  const snapToRing = useCallback(
    (pt: Point) =>
      mode === 'extend' ? (findChainAnchor(currentPoints, pt)?.point ?? pt) : snapToExisting(pt),
    [currentPoints, mode, snapToExisting]
  );

  const snapDirection = useCallback((start: Point, end: Point) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (dx === 0 && dy === 0) return end;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    // horizontal vs vertical vs 45
    if (absDx * 2 < absDy) {
      return { x: start.x, y: end.y };
    }
    if (absDy * 2 < absDx) {
      return { x: end.x, y: start.y };
    }
    const signX = dx >= 0 ? 1 : -1;
    const signY = dy >= 0 ? 1 : -1;
    const mag = Math.max(absDx, absDy);
    return { x: start.x + signX * mag, y: start.y + signY * mag };
  }, []);

  const reset = useCallback(() => {
    setChain([]);
    setPendingStart(null);
    setPreviewPoint(null);
  }, []);

  const handleCanvasClick = useCallback(
    (pt: Point) => {
      if (!isDrawingWall) return;

      const gridAligned = snapPointToGrid(pt);

      if (mode === 'extend') {
        if (!pendingStart) {
          const anchor = findChainAnchor(currentPoints, gridAligned);
          if (!anchor) {
            onStartRejected?.();
            return;
          }
          setChain([anchor.point]);
          setPendingStart(anchor.point);
          return;
        }
        const constrained = snapDirection(pendingStart, gridAligned);
        const anchor = findChainAnchor(currentPoints, constrained);
        if (anchor) {
          const landed = [...chain, anchor.point];
          const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
          // A chain that only touches the ring twice adds nothing; keep drawing.
          if (landed.length === 2 && same(landed[0], landed[1])) return;
          setIsDrawingWall(false);
          reset();
          onChainComplete(landed);
          return;
        }
        setChain([...chain, constrained]);
        setPendingStart(constrained);
        return;
      }

      const snapped = snapToExisting(gridAligned);

      // First click: set pending start
      if (!pendingStart) {
        setPendingStart(snapped);
        return;
      }

      // Second click: apply direction constraint and add segment
      const constrained = snapDirection(pendingStart, snapped);
      const endPoint = snapToExisting(constrained);

      const current = currentPoints;
      const first = current[0];
      const closeThreshold = 250; // mm
      const isClosing = !!first && Math.hypot(endPoint.x - first.x, endPoint.y - first.y) < closeThreshold;

      if (isClosing && current.length >= 2) {
        // Close the loop without adding a duplicate point
        setIsDrawingWall(false);
        reset();
        return;
      }

      let newPoints = [...current];

      // Add the first point if this is the very first segment
      if (newPoints.length === 0) {
        newPoints.push(pendingStart);
      }

      // Add the endpoint
      newPoints = [...newPoints, endPoint];
      onPointsChange(newPoints);

      // Set the endpoint as the new start for the next segment
      setPendingStart(endPoint);
    },
    [
      chain,
      currentPoints,
      isDrawingWall,
      mode,
      onChainComplete,
      onPointsChange,
      onStartRejected,
      pendingStart,
      reset,
      snapDirection,
      snapPointToGrid,
      snapToExisting,
    ]
  );

  const handleCanvasMove = useCallback(
    (pt: Point) => {
      if (!isDrawingWall || !pendingStart) {
        setPreviewPoint(null);
        return;
      }
      // Apply same snapping to preview
      const gridAligned = snapPointToGrid(pt);
      const constrained = snapDirection(pendingStart, gridAligned);
      setPreviewPoint(snapToRing(constrained));
    },
    [isDrawingWall, pendingStart, snapPointToGrid, snapDirection, snapToRing]
  );

  const startDrawing = useCallback(() => {
    setIsDrawingWall(true);
    setMode(currentPoints.length >= 3 ? 'extend' : 'new');
    reset();
  }, [currentPoints.length, reset]);

  const stopDrawing = useCallback(() => {
    setIsDrawingWall(false);
    reset();
  }, [reset]);

  /**
   * Drop the point that was just drawn. This is a drawing-mode tool, not a
   * general undo: on a finished outline it would silently eat vertices the user
   * never placed in this session, so it only runs while drawing is active.
   */
  const removeLastPoint = useCallback(() => {
    if (!isDrawingWall) return;
    if (mode === 'extend') {
      const next = chain.slice(0, -1);
      setChain(next);
      setPendingStart(next.length ? next[next.length - 1] : null);
      setPreviewPoint(null);
      return;
    }
    if (currentPoints.length > 0) {
      const newPoints = currentPoints.slice(0, -1);
      onPointsChange(newPoints);
      // Keep the rubber-band preview anchored to a point that still exists.
      setPendingStart(newPoints.length ? newPoints[newPoints.length - 1] : null);
      setPreviewPoint(null);
    }
  }, [chain, currentPoints, isDrawingWall, mode, onPointsChange]);

  return {
    isDrawingWall,
    /** Corners placed so far while extending a closed outline, starting with the anchor. */
    chain,
    pendingStart,
    previewPoint,
    handleCanvasClick,
    handleCanvasMove,
    startDrawing,
    stopDrawing,
    removeLastPoint,
    setIsDrawingWall,
    setPendingStart,
    setPreviewPoint,
  };
}
