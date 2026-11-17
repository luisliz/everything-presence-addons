// @ts-nocheck -- Node's built-in runner supplies these modules.
import assert from 'node:assert/strict';
import test from 'node:test';
import { conePolygon, resolveCanvasCoverage } from './coverage.ts';

const lite = {
  id: 'lite',
  limits: { maxRangeMeters: 6, fieldOfViewDegrees: 120 },
};
const pro = {
  id: 'pro',
  limits: { maxRangeMeters: 6, fieldOfViewDegrees: 120 },
  coverage: {
    defaultPresetId: 'ld2450',
    presets: {
      ld2450: {
        label: 'LD2450',
        horizontalFovDeg: 120,
        verticalFovDeg: 70,
        maxRangeMeters: 6,
      },
      sen0609: {
        label: 'SEN0609',
        horizontalFovDeg: 100,
        verticalFovDeg: 40,
        maxRangeMeters: 25,
      },
    },
  },
};
const ep1 = {
  id: 'ep1',
  limits: { maxRangeMeters: 25, fieldOfViewDegrees: 120 },
};

test('profile limits drive fov and range without sensor config', () => {
  assert.deepEqual(
    resolveCanvasCoverage(lite, { x: 0, y: 0, rotationDeg: 30 }),
    { fovDeg: 120, rangeMm: 6000, rotationDeg: 30 },
  );
});

test('placement preset picks fov and range', () => {
  assert.deepEqual(
    resolveCanvasCoverage(pro, { x: 0, y: 0, coveragePresetId: 'sen0609' }),
    { fovDeg: 100, rangeMm: 25000, rotationDeg: 0 },
  );
});

test('maxDistance in cm caps the range and installation angle adds to rotation', () => {
  assert.deepEqual(
    resolveCanvasCoverage(
      lite,
      { x: 0, y: 0, rotationDeg: 90 },
      { maxDistance: 450, installationAngle: -15 },
    ),
    { fovDeg: 120, rangeMm: 4500, rotationDeg: 75 },
  );
  assert.equal(
    resolveCanvasCoverage(lite, null, { maxDistance: 900 }).rangeMm,
    6000,
  );
});

test('EP1 caps by mmwaveDistanceMax', () => {
  assert.equal(
    resolveCanvasCoverage(ep1, null, { mmwaveDistanceMax: 800 }).rangeMm,
    8000,
  );
});

test('zero or non-finite config values are ignored', () => {
  const c = resolveCanvasCoverage(
    lite,
    { x: 0, y: 0, rotationDeg: Number.NaN },
    { maxDistance: 0, installationAngle: Number.NaN },
  );
  assert.deepEqual(c, { fovDeg: 120, rangeMm: 6000, rotationDeg: 0 });
});

test('without a profile the fallback values apply', () => {
  assert.deepEqual(
    resolveCanvasCoverage(
      null,
      { x: 0, y: 0, rotationDeg: 10 },
      { installationAngle: 5 },
      { fovDeg: 90, maxRangeMeters: 4 },
    ),
    { fovDeg: 90, rangeMm: 4000, rotationDeg: 15 },
  );
  assert.deepEqual(resolveCanvasCoverage(undefined, undefined), {
    fovDeg: 120,
    rangeMm: 6000,
    rotationDeg: 0,
  });
});

test('cone polygon points down the plan at rotation 0 and spans the fov', () => {
  const points = conePolygon(
    { x: 0, y: 0 },
    { fovDeg: 90, rangeMm: 1000, rotationDeg: 0 },
    { steps: 2 },
  );
  assert.equal(points.length, 4);
  assert.deepEqual(points[0], { x: 0, y: 0 });
  assert.ok(
    Math.abs(points[2].x) < 1e-9 && Math.abs(points[2].y - 1000) < 1e-9,
  );
  assert.ok(Math.abs(points[1].x - Math.SQRT1_2 * 1000) < 1e-9);
});

test('cone polygon clips rays at the nearest wall', () => {
  const square = [
    { x: -500, y: -500 },
    { x: 500, y: -500 },
    { x: 500, y: 500 },
    { x: -500, y: 500 },
  ];
  const points = conePolygon(
    { x: 0, y: 0 },
    { fovDeg: 60, rangeMm: 2000, rotationDeg: 0 },
    { steps: 2, clipTo: square },
  );
  assert.ok(Math.abs(points[2].y - 500) < 1e-9);
  assert.ok(points.slice(1).every((p) => Math.abs(p.y - 500) < 1e-9));
});
