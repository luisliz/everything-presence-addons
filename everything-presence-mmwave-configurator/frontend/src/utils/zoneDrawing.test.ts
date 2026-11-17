// @ts-nocheck -- Node's built-in runner supplies these modules; frontend production types stay dependency-free.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MIN_ZONE_SIZE_MM,
  constrain45,
  deviceToRoom,
  formatSizeLabel,
  meetsMinSize,
  nudgeDelta,
  rectCorners,
  rectFromCorners,
  rectHandlePoint,
  resizeRect,
  roomDeltaToDevice,
  roomToDevice,
  snapPoint,
  snapRoomToDevice,
  snapValue,
  snappedRoomDelta,
  translatePoints,
  withinRadius,
} from './zoneDrawing.ts';

const close = (actual, expected, eps = 1e-6) => {
  assert.ok(
    Math.abs(actual.x - expected.x) < eps &&
      Math.abs(actual.y - expected.y) < eps,
    `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
  );
};

test('snap is a no-op when the step is zero', () => {
  assert.equal(snapValue(123, 0), 123);
  assert.deepEqual(snapPoint({ x: 149, y: 151 }, 100), { x: 100, y: 200 });
});

test('device and room transforms round-trip', () => {
  const frame = { x: 1200, y: -300, rotationDeg: 33 };
  const p = { x: 417, y: 2291 };
  close(roomToDevice(deviceToRoom(p, frame), frame), p);
  assert.deepEqual(deviceToRoom(p, null), p);
});

test('snap applies in room coordinates for a rotated device', () => {
  const frame = { x: 0, y: 0, rotationDeg: 90 };
  const stored = snapRoomToDevice({ x: 1040, y: 1960 }, 100, frame);
  // The stored device point maps back onto the visible room grid.
  close(deviceToRoom(stored, frame), { x: 1000, y: 2000 });
  close(stored, { x: 2000, y: -1000 });
});

test('room deltas rotate into the device frame and translate points', () => {
  const frame = { x: 500, y: 500, rotationDeg: 90 };
  close(roomDeltaToDevice({ x: 100, y: 0 }, frame), { x: 0, y: -100 });
  assert.deepEqual(
    translatePoints([{ x: 1, y: 2, id: 'a' }], { x: 10, y: 20 }),
    [{ x: 11, y: 22, id: 'a' }],
  );
  assert.deepEqual(snappedRoomDelta({ x: 0, y: 0 }, { x: 140, y: -260 }, 100), {
    x: 100,
    y: -300,
  });
});

test('Shift constrains a segment to 0, 45 or 90 degrees', () => {
  const from = { x: 0, y: 0 };
  assert.deepEqual(constrain45(from, { x: 1000, y: 100 }), { x: 1000, y: 0 });
  assert.deepEqual(constrain45(from, { x: 100, y: -1000 }), { x: 0, y: -1000 });
  assert.deepEqual(constrain45(from, { x: -900, y: 1000 }), {
    x: -1000,
    y: 1000,
  });
});

test('first-vertex hit uses an inclusive radius', () => {
  assert.equal(withinRadius({ x: 0, y: 0 }, { x: 3, y: 4 }, 5), true);
  assert.equal(withinRadius({ x: 0, y: 0 }, { x: 3, y: 4.1 }, 5), false);
});

test('rectangles normalise from any drag direction and square with Shift', () => {
  assert.deepEqual(rectFromCorners({ x: 1000, y: 800 }, { x: 200, y: 300 }), {
    x: 200,
    y: 300,
    width: 800,
    height: 500,
  });
  assert.deepEqual(
    rectFromCorners({ x: 0, y: 0 }, { x: -300, y: 1200 }, true),
    { x: -1200, y: 0, width: 1200, height: 1200 },
  );
  assert.deepEqual(rectCorners({ x: 0, y: 0, width: 2, height: 1 }), [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 1 },
    { x: 0, y: 1 },
  ]);
});

test('rectangles below the minimum size are rejected', () => {
  assert.equal(
    meetsMinSize({ x: 0, y: 0, width: MIN_ZONE_SIZE_MM, height: 100 }),
    true,
  );
  assert.equal(meetsMinSize({ x: 0, y: 0, width: 99, height: 500 }), false);
});

test('resize keeps the opposite edge fixed and clamps to the minimum', () => {
  const start = { x: 0, y: 0, width: 1000, height: 1000 };
  assert.deepEqual(resizeRect(start, 'se', { x: 1500, y: 1200 }), {
    x: 0,
    y: 0,
    width: 1500,
    height: 1200,
  });
  assert.deepEqual(resizeRect(start, 'w', { x: 950, y: 0 }), {
    x: 900,
    y: 0,
    width: 100,
    height: 1000,
  });
  assert.deepEqual(resizeRect(start, 'n', { x: 0, y: -200 }), {
    x: 0,
    y: -200,
    width: 1000,
    height: 1200,
  });
  assert.deepEqual(rectHandlePoint(start, 'ne'), { x: 1000, y: 0 });
  assert.deepEqual(rectHandlePoint(start, 's'), { x: 500, y: 1000 });
});

test('nudge uses the snap step, a 10 mm fallback, and x10 with Shift', () => {
  assert.deepEqual(nudgeDelta('ArrowRight', 100, false), { x: 100, y: 0 });
  assert.deepEqual(nudgeDelta('ArrowUp', 0, false), { x: 0, y: -10 });
  assert.deepEqual(nudgeDelta('ArrowDown', 50, true), { x: 0, y: 500 });
  assert.equal(nudgeDelta('Enter', 100, false), null);
});

test('size label formats both units', () => {
  assert.equal(formatSizeLabel(1200, 800, 'metric'), '1.20 × 0.80 m');
  assert.equal(formatSizeLabel(304.8, 609.6, 'imperial'), '1 ft × 2 ft');
});
