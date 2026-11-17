import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  ZoneAvailability,
  ZonePolygon,
  ZoneRect,
} from '../../../api/types';
import {
  availabilityKey,
  changedZoneCount,
  fingerprints,
  isSlotUnavailable,
  kindSlots,
  outOfRangeZones,
  renumberPolygons,
} from './zoneSlots.ts';

const LIMITS = { maxZones: 4, maxExclusionZones: 2, maxEntryZones: 2 };
const rect = (id: string, type: ZoneRect['type'] = 'regular'): ZoneRect => ({
  id,
  type,
  x: 0,
  y: 500,
  width: 1000,
  height: 1000,
});
const poly = (id: string, type: ZonePolygon['type']): ZonePolygon => ({
  id,
  type,
  vertices: [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 0, y: 1000 },
  ],
});

test('the next slot is the lowest free number of the kind', () => {
  const slots = kindSlots([rect('Zone 1'), rect('Zone 3')], 'regular', LIMITS);
  assert.deepEqual(slots, {
    kind: 'regular',
    total: 4,
    used: 2,
    next: 'Zone 2',
  });
});

test('unavailable slots are skipped and a full kind has no next slot', () => {
  const skip = kindSlots(
    [rect('Zone 1')],
    'regular',
    LIMITS,
    (id) => id === 'Zone 2',
  );
  assert.equal(skip.next, 'Zone 3');
  const full = kindSlots(
    [rect('Exclusion 1', 'exclusion'), rect('Exclusion 2', 'exclusion')],
    'exclusion',
    LIMITS,
  );
  assert.equal(full.next, null);
  assert.equal(full.used, 2);
});

test('polygons renumber per kind in list order', () => {
  const ids = renumberPolygons([
    poly('Zone 2', 'regular'),
    poly('Exclusion 2', 'exclusion'),
    poly('Zone 4', 'regular'),
  ]).map((zone) => zone.id);
  assert.deepEqual(ids, ['Zone 1', 'Exclusion 1', 'Zone 2']);
});

test('availability keys differ between rectangle and polygon mode', () => {
  assert.equal(availabilityKey('Zone 3', 'regular', false), 'zone3');
  assert.equal(availabilityKey('Entry 2', 'entry', false), 'entry2');
  assert.equal(availabilityKey('Zone 3', 'regular', true), 'Zone 3');
  const availability: ZoneAvailability = {
    zone2: { enabled: false, disabledBy: 'user', status: 'disabled' },
  };
  assert.equal(
    isSlotUnavailable(availability, 'Zone 2', 'regular', false),
    true,
  );
  assert.equal(
    isSlotUnavailable(availability, 'Zone 1', 'regular', false),
    false,
  );
});

test('changed zones count additions, removals and edits once each', () => {
  const baseline = fingerprints([rect('Zone 1'), rect('Zone 2')]);
  assert.equal(changedZoneCount(baseline, [rect('Zone 1'), rect('Zone 2')]), 0);
  const moved = { ...rect('Zone 1'), x: 200 };
  const renamed = { ...rect('Zone 2'), label: 'Desk' };
  assert.equal(changedZoneCount(baseline, [moved, renamed, rect('Zone 3')]), 3);
  assert.equal(changedZoneCount(baseline, []), 2);
});

test('zones past the range are reported by id', () => {
  const far = { ...rect('Zone 2'), y: 5800 };
  assert.deepEqual(outOfRangeZones([rect('Zone 1'), far], 6000), ['Zone 2']);
});
