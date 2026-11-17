import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAnchorPosition, calculateTooltipPosition } from './tooltipPosition.ts';

const trigger = { left: 100, top: 100, right: 120, bottom: 120, width: 20, height: 20 };
const tooltip = { width: 80, height: 40 };
const viewport = { width: 320, height: 240 };

test('prefers the top placement when it fits', () => {
  assert.deepEqual(calculateTooltipPosition(trigger, tooltip, viewport), { left: 70, top: 52, placement: 'top' });
});

test('flips below when there is no room above', () => {
  const result = calculateTooltipPosition({ ...trigger, top: 10, bottom: 30 }, tooltip, viewport);
  assert.equal(result.placement, 'bottom');
  assert.equal(result.top, 38);
});

test('clamps the tooltip inside both horizontal viewport edges', () => {
  assert.equal(calculateTooltipPosition({ ...trigger, left: 0, width: 10 }, tooltip, viewport).left, 8);
  assert.equal(calculateTooltipPosition({ ...trigger, left: 310, width: 10 }, tooltip, viewport).left, 232);
});

test('uses current geometry so callers can recompute after scroll or resize', () => {
  const moved = calculateTooltipPosition({ ...trigger, top: 20, bottom: 40 }, tooltip, { width: 200, height: 160 });
  assert.deepEqual(moved, { left: 70, top: 48, placement: 'bottom' });
});

test('honours a preferred side and falls back when it does not fit', () => {
  assert.equal(calculateTooltipPosition(trigger, tooltip, viewport, 8, 8, 'bottom').placement, 'bottom');
  assert.deepEqual(calculateTooltipPosition(trigger, tooltip, viewport, 8, 8, 'right'), { left: 128, top: 90, placement: 'right' });
  assert.equal(calculateTooltipPosition({ ...trigger, left: 10, right: 30 }, tooltip, viewport, 8, 8, 'left').placement, 'top');
});

test('anchors a layer under its trigger, end-aligned, and flips above near the bottom edge', () => {
  const anchor = { left: 200, top: 100, right: 240, bottom: 140, width: 40, height: 40 };
  assert.deepEqual(calculateAnchorPosition(anchor, { width: 100, height: 60 }, viewport, 'end'), { left: 140, top: 144, placement: 'bottom' });
  const low = calculateAnchorPosition({ ...anchor, top: 190, bottom: 230 }, { width: 100, height: 60 }, viewport, 'start');
  assert.deepEqual(low, { left: 200, top: 126, placement: 'top' });
});
