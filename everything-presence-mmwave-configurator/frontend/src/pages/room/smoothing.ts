export type Positions = Map<number, { x: number; y: number }>;

const SETTLED_MM = 1;

/** One easing frame toward the targets; returns `prev` itself once every target is within 1 mm, so React skips the render. */
export function smoothStep(
  prev: Positions,
  targets: ReadonlyArray<{ id: number; x: number; y: number }>,
  factor: number,
): Positions {
  const settled =
    prev.size === targets.length &&
    targets.every((target) => {
      const current = prev.get(target.id);
      return (
        current !== undefined &&
        Math.abs(target.x - current.x) < SETTLED_MM &&
        Math.abs(target.y - current.y) < SETTLED_MM
      );
    });
  if (settled) return prev;
  const next: Positions = new Map();
  for (const target of targets) {
    const current = prev.get(target.id);
    next.set(
      target.id,
      current
        ? {
            x: current.x + (target.x - current.x) * factor,
            y: current.y + (target.y - current.y) * factor,
          }
        : { x: target.x, y: target.y },
    );
  }
  return next;
}
