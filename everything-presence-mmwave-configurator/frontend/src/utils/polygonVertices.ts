export interface PolygonVertex {
  x: number;
  y: number;
}

/**
 * Firmware/backend floor for a polygon zone. `isValidPolygon` in
 * backend/src/domain/polygonUtils.ts rejects anything with fewer than three
 * distinct points, so the editor must never let a user delete below it.
 */
export const MIN_POLYGON_VERTICES = 3;

const countDistinct = (vertices: PolygonVertex[]): number => (
  new Set(vertices.map((vertex) => `${vertex.x},${vertex.y}`)).size
);

const isDeletableIndex = (vertices: PolygonVertex[] | undefined | null, index: number): boolean => {
  if (!Array.isArray(vertices)) return false;
  if (!Number.isInteger(index)) return false;
  return index >= 0 && index < vertices.length;
};

/**
 * Whether the vertex at `index` can be removed while keeping the polygon valid.
 * Guards both the raw vertex count and the number of distinct points, matching
 * the backend validation rule.
 */
export function canDeleteVertex(vertices: PolygonVertex[] | undefined | null, index: number): boolean {
  if (!isDeletableIndex(vertices, index)) return false;
  const list = vertices as PolygonVertex[];
  if (list.length <= MIN_POLYGON_VERTICES) return false;
  const remaining = list.filter((_, idx) => idx !== index);
  return countDistinct(remaining) >= MIN_POLYGON_VERTICES;
}

/**
 * Remove the vertex at `index`, returning a new array. Returns the original
 * array untouched when the deletion would leave an invalid polygon.
 */
export function deleteVertex<T extends PolygonVertex>(vertices: T[], index: number): T[] {
  if (!canDeleteVertex(vertices, index)) return vertices;
  return vertices.filter((_, idx) => idx !== index);
}

export function insertEdgeMidpoint<T extends PolygonVertex>(vertices: T[], edgeIndex: number): PolygonVertex[] {
  const a = vertices[edgeIndex];
  const b = vertices[(edgeIndex + 1) % vertices.length];
  if (!a || !b) return vertices;
  const next: PolygonVertex[] = [...vertices];
  next.splice(edgeIndex + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  return next;
}
