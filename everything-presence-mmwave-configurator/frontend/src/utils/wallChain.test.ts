import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findChainAnchor, polygonArea, spliceChainIntoRing } from './wallChain.ts';

// 4 m x 3 m rectangle, clockwise on a y-down canvas.
const rect = () => [
  { x: 0, y: 0 },
  { x: 4000, y: 0 },
  { x: 4000, y: 3000 },
  { x: 0, y: 3000 },
];

describe('findChainAnchor', () => {
  it('prefers a corner over a wall', () => {
    assert.deepEqual(findChainAnchor(rect(), { x: 120, y: -90 }), {
      kind: 'vertex',
      index: 0,
      point: { x: 0, y: 0 },
    });
  });

  it('projects onto the nearest wall', () => {
    const anchor = findChainAnchor(rect(), { x: 2000, y: 140 });
    assert.equal(anchor?.kind, 'wall');
    assert.equal(anchor?.index, 0);
    assert.deepEqual(anchor?.point, { x: 2000, y: 0 });
  });

  it('returns null away from the outline', () => {
    assert.equal(findChainAnchor(rect(), { x: 2000, y: 1500 }), null);
  });
});

describe('spliceChainIntoRing', () => {
  it('adds an outward bump between two adjacent corners', () => {
    const result = spliceChainIntoRing({ points: rect() }, [
      { x: 4000, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 3000 },
      { x: 4000, y: 3000 },
    ]);
    assert.deepEqual(result?.points, [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 3000 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ]);
  });

  it('cuts an inward notch and keeps the big room', () => {
    const result = spliceChainIntoRing({ points: rect() }, [
      { x: 4000, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 1000 },
      { x: 4000, y: 1000 },
    ]);
    assert.equal(polygonArea(result?.points ?? []), 4000 * 3000 - 1000 * 1000);
    assert.equal(result?.points.length, 7);
  });

  it('starts and ends mid-wall by splitting the walls first, and re-indexes doors and locks', () => {
    const result = spliceChainIntoRing(
      {
        points: rect(),
        doors: [
          { id: 'top', style: 'single', segmentIndex: 0, positionOnSegment: 0.25, widthMm: 900 },
          { id: 'bottom', style: 'single', segmentIndex: 2, positionOnSegment: 0.5, widthMm: 900 },
        ] as never,
        lockedSegments: [3],
      },
      [
        { x: 2000, y: 0 },
        { x: 2000, y: -800 },
        { x: 4000, y: -800 },
        { x: 4000, y: 1000 },
      ],
    );
    assert.deepEqual(result?.points, [
      { x: 0, y: 0 },
      { x: 2000, y: 0 },
      { x: 2000, y: -800 },
      { x: 4000, y: -800 },
      { x: 4000, y: 1000 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ]);
    // The top door sat on the half of the wall that survived; the bottom wall moved up by three.
    assert.deepEqual(
      result?.doors?.map((d) => [d.id, d.segmentIndex, d.positionOnSegment]),
      [
        ['top', 0, 0.5],
        ['bottom', 5, 0.5],
      ],
    );
    assert.deepEqual(result?.lockedSegments, [6]);
  });

  it('drops a door whose wall the chain replaced', () => {
    const result = spliceChainIntoRing(
      {
        points: rect(),
        doors: [{ id: 'right', style: 'single', segmentIndex: 1, positionOnSegment: 0.5, widthMm: 900 }] as never,
      },
      [
        { x: 4000, y: 0 },
        { x: 5000, y: 1500 },
        { x: 4000, y: 3000 },
      ],
    );
    assert.deepEqual(result?.doors, []);
  });

  it('rejects a chain that does not touch the outline', () => {
    assert.equal(
      spliceChainIntoRing({ points: rect() }, [
        { x: 1000, y: 1000 },
        { x: 2000, y: 2000 },
      ]),
      null,
    );
  });

  it('closing back on the start corner replaces the whole outline', () => {
    const result = spliceChainIntoRing({ points: rect() }, [
      { x: 0, y: 0 },
      { x: 2000, y: 0 },
      { x: 2000, y: 2000 },
      { x: 0, y: 2000 },
      { x: 0, y: 0 },
    ]);
    assert.deepEqual(result?.points, [
      { x: 0, y: 0 },
      { x: 2000, y: 0 },
      { x: 2000, y: 2000 },
      { x: 0, y: 2000 },
    ]);
  });
});
