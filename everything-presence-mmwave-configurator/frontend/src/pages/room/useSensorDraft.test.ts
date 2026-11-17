import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyPlan,
  EMPTY_DRAFT,
  sensorConfigFrom,
  sensorDraftReducer,
} from './useSensorDraft.ts';

const set = (key: string, value: number, deviceValue?: number) =>
  ({ type: 'set', key, value, deviceValue }) as const;

test('set marks a value dirty and clears its old row state', () => {
  const failed = sensorDraftReducer(EMPTY_DRAFT, {
    type: 'status',
    key: 'maxDistance',
    status: 'error',
    error: 'nope',
  });
  const next = sensorDraftReducer(failed, set('maxDistance', 450, 600));
  assert.deepEqual(next.values, { maxDistance: 450 });
  assert.deepEqual(next.status, {});
  assert.deepEqual(next.error, {});
});

test('setting the device value back makes the row clean', () => {
  const dirty = sensorDraftReducer(
    EMPTY_DRAFT,
    set('installationAngle', 20, -20),
  );
  const clean = sensorDraftReducer(dirty, set('installationAngle', -20, -20));
  assert.deepEqual(clean.values, {});
});

test('ok drops the applied value; error keeps it for retry', () => {
  let draft = sensorDraftReducer(EMPTY_DRAFT, set('a', 1, 0));
  draft = sensorDraftReducer(draft, set('b', 2, 0));
  draft = sensorDraftReducer(draft, { type: 'status', key: 'a', status: 'ok' });
  draft = sensorDraftReducer(draft, {
    type: 'status',
    key: 'b',
    status: 'error',
    error: 'Out of range',
  });
  assert.deepEqual(draft.values, { b: 2 });
  assert.deepEqual(draft.status, { a: 'ok', b: 'error' });
  assert.deepEqual(draft.error, { b: 'Out of range' });
  draft = sensorDraftReducer(draft, {
    type: 'status',
    key: 'a',
    status: 'idle',
  });
  assert.deepEqual(draft.status, { b: 'error' });
});

test('discard drops dirty values and their row state, keeps immediate-write state', () => {
  let draft = sensorDraftReducer(EMPTY_DRAFT, set('a', 1, 0));
  draft = sensorDraftReducer(draft, {
    type: 'status',
    key: 'a',
    status: 'error',
  });
  draft = sensorDraftReducer(draft, {
    type: 'status',
    key: 'led',
    status: 'ok',
  });
  draft = sensorDraftReducer(draft, { type: 'discard' });
  assert.deepEqual(draft, { values: {}, status: { led: 'ok' }, error: {} });
});

test('applyPlan follows profile order and presses the group apply button last', () => {
  const groups = [
    {
      group: 'Tracking Radar',
      settings: [
        { key: 'maxDistance', entityId: 'n.a', controlType: 'number' },
        { key: 'installationAngle', entityId: 'n.b', controlType: 'number' },
      ],
    },
    {
      group: 'Static Presence Range',
      settings: [
        {
          key: 'staticPresenceMinRange',
          entityId: 'n.c',
          controlType: 'number',
        },
        {
          key: 'staticPresenceMaxRange',
          entityId: 'n.d',
          controlType: 'number',
        },
        {
          key: 'applyStaticRangeSettings',
          entityId: 'b.e',
          controlType: 'button',
        },
      ],
    },
    {
      group: 'Device',
      settings: [
        { key: 'ledBrightness', entityId: 'n.f', controlType: 'number' },
      ],
    },
  ];
  const plan = applyPlan(groups, {
    staticPresenceMaxRange: 4,
    installationAngle: 20,
    maxDistance: 400,
  });
  assert.deepEqual(plan, [
    { keys: ['maxDistance', 'installationAngle'] },
    { keys: ['staticPresenceMaxRange'], button: 'applyStaticRangeSettings' },
  ]);
});

test('sensorConfigFrom lays the draft over live config', () => {
  assert.deepEqual(
    sensorConfigFrom(
      { installationAngle: -20, distanceMax: 600 },
      { installationAngle: 20 },
    ),
    { installationAngle: 20, maxDistance: 600 },
  );
  assert.deepEqual(sensorConfigFrom(null, { mmwaveDistanceMax: 300 }), {
    installationAngle: undefined,
    maxDistance: 300,
  });
});
