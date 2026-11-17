import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampNumber,
  formatNumber,
  isInRange,
  parseNumberInput,
} from './numberInput.ts';
import { resolveSnap, snapHeight } from './sheetSnap.ts';

test('number input parses complete numbers only, with either decimal mark', () => {
  assert.equal(parseNumberInput(' 12.5 '), 12.5);
  assert.equal(parseNumberInput('12,5'), 12.5);
  assert.equal(parseNumberInput('-3'), -3);
  assert.equal(parseNumberInput('.5'), 0.5);
  assert.equal(parseNumberInput('4.'), 4);
  for (const partial of ['', '-', '.', '1e3', '12a', '1.2.3'])
    assert.equal(parseNumberInput(partial), null, partial);
});

test('number input clamps, range-checks and formats to the step precision', () => {
  assert.equal(clampNumber(700, 0, 600), 600);
  assert.equal(clampNumber(-1, 0), 0);
  assert.equal(clampNumber(5), 5);
  assert.equal(isInRange(5, 0, 10), true);
  assert.equal(isInRange(11, 0, 10), false);
  assert.equal(formatNumber(1.23456, 0.1), '1.2');
  assert.equal(formatNumber(449.6, 1), '450');
  assert.equal(formatNumber(1.23456), '1.235');
});

test('sheet snap heights follow the viewport', () => {
  assert.equal(snapHeight('peek', 800), 88);
  assert.equal(snapHeight('half', 800), 400);
  assert.equal(snapHeight('full', 800), 736);
});

test('sheet settles on the nearest snap, or the next one in the direction of a fling', () => {
  assert.equal(resolveSnap(120, 800), 'peek');
  assert.equal(resolveSnap(380, 800), 'half');
  assert.equal(resolveSnap(700, 800), 'full');
  assert.equal(resolveSnap(120, 800, 1), 'half');
  assert.equal(resolveSnap(500, 800, 1), 'full');
  assert.equal(resolveSnap(780, 800, 1), 'full');
  assert.equal(resolveSnap(380, 800, -1), 'peek');
  assert.equal(resolveSnap(60, 800, -1), 'peek');
});
