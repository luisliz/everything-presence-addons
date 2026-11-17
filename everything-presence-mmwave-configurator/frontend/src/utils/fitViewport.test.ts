// @ts-nocheck -- Node's built-in runner supplies these modules.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  coverageBounds,
  fitViewport,
  parseStoredViewport,
} from './fitViewport.ts';

const close = (a, b, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('bounds include the unclipped cone past the room outline', () => {
  const room = [
    { x: 0, y: 0 },
    { x: 3000, y: 0 },
    { x: 3000, y: 3000 },
    { x: 0, y: 3000 },
  ];
  const b = coverageBounds({
    room,
    device: { x: 1500, y: 0 },
    coverage: { fovDeg: 120, rangeMm: 6000, rotationDeg: 0 },
  });
  close(b.maxY, 6000);
  close(b.minX, 1500 - 6000 * Math.sin(Math.PI / 3));
  close(b.maxX, 1500 + 6000 * Math.sin(Math.PI / 3));
  close(b.minY, 0);
});

test('no-outline room fits cone and device only', () => {
  const b = coverageBounds({
    device: { x: 0, y: 0 },
    coverage: { fovDeg: 90, rangeMm: 1000, rotationDeg: 0 },
  });
  close(b.minY, 0);
  close(b.maxY, 1000);
  close(b.maxX, Math.SQRT1_2 * 1000);
});

test('bounds are null without any finite point', () => {
  assert.equal(coverageBounds({ room: [{ x: Number.NaN, y: 0 }] }), null);
});

test('fit uses the minimum 300 mm pad on small bounds and centers the pan', () => {
  const v = fitViewport(
    { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
    { width: 500, height: 500 },
    { rangeMm: 6000 },
  );
  close(v.zoom, 6000 / 1600);
  assert.deepEqual(v.panOffsetMm, { x: 500, y: 500 });
});

test('fit pads 6% of the larger side and uses the wide axis of the container', () => {
  const bounds = { minX: -5000, minY: 0, maxX: 5000, maxY: 6000 };
  const pad = 600;
  const v = fitViewport(
    bounds,
    { width: 1600, height: 800 },
    { rangeMm: 15000 },
  );
  close(
    v.zoom,
    Math.min((15000 * 2) / (10000 + 2 * pad), 15000 / (6000 + 2 * pad)),
  );
  const square = fitViewport(
    bounds,
    { width: 800, height: 800 },
    { rangeMm: 15000 },
  );
  assert.ok(v.zoom > square.zoom);
});

test('fit clamps zoom and handles missing bounds or container', () => {
  assert.equal(
    fitViewport({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, null, {
      rangeMm: 15000,
    }).zoom,
    5,
  );
  assert.deepEqual(
    fitViewport(null, { width: 10, height: 10 }, { rangeMm: 15000 }),
    { zoom: 1, panOffsetMm: { x: 0, y: 0 } },
  );
});

test('stored viewports parse only when well formed', () => {
  assert.deepEqual(
    parseStoredViewport('{"zoom":2,"panOffsetMm":{"x":1,"y":2}}'),
    { zoom: 2, panOffsetMm: { x: 1, y: 2 } },
  );
  assert.equal(
    parseStoredViewport('{"zoom":0,"panOffsetMm":{"x":1,"y":2}}'),
    null,
  );
  assert.equal(parseStoredViewport('nope'), null);
  assert.equal(parseStoredViewport(null), null);
});
