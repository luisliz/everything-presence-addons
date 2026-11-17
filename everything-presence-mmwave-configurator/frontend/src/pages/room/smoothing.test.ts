import assert from 'node:assert/strict';
import { test } from 'node:test';
import { smoothStep } from './smoothing.ts';

test('eases toward targets and places new targets at their goal', () => {
  const prev = new Map([[1, { x: 0, y: 0 }]]);
  const next = smoothStep(
    prev,
    [
      { id: 1, x: 100, y: -100 },
      { id: 2, x: 5, y: 6 },
    ],
    0.5,
  );
  assert.deepEqual(
    [...next],
    [
      [1, { x: 50, y: -50 }],
      [2, { x: 5, y: 6 }],
    ],
  );
});

test('returns prev itself once every target is within 1 mm', () => {
  const prev = new Map([[1, { x: 99.5, y: 10.2 }]]);
  assert.equal(smoothStep(prev, [{ id: 1, x: 100, y: 10 }], 0.15), prev);
});

test('a target that left or joined keeps the step moving', () => {
  const prev = new Map([
    [1, { x: 0, y: 0 }],
    [2, { x: 0, y: 0 }],
  ]);
  const next = smoothStep(prev, [{ id: 1, x: 0, y: 0 }], 0.15);
  assert.notEqual(next, prev);
  assert.deepEqual([...next.keys()], [1]);
});
