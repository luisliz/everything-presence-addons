import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isCanvasStep,
  nextBlocker,
  profileIdForModel,
  resumeStep,
  stepsFor,
} from './steps.ts';

test('a new room walks every drawing step, zones only when the profile edits zones', () => {
  assert.deepEqual(stepsFor('new', true), [
    'device',
    'entityDiscovery',
    'roomChoice',
    'roomDetails',
    'outline',
    'placement',
    'doors',
    'furniture',
    'zones',
    'finish',
  ]);
  assert.equal(stepsFor('new', false).includes('zones'), false);
  assert.deepEqual(stepsFor(null, true), stepsFor('new', true));
});

test('an existing room skips the outline, doors and furniture; skip goes straight to zones', () => {
  assert.deepEqual(stepsFor('existing', true).slice(3), [
    'roomDetails',
    'placement',
    'zones',
    'finish',
  ]);
  assert.deepEqual(stepsFor('skip', true).slice(3), ['zones', 'finish']);
  assert.deepEqual(stepsFor('skip', false).slice(3), ['finish']);
});

test('resume restores a saved step only when the current order has it', () => {
  const steps = stepsFor(null, true);
  assert.equal(resumeStep('placement', steps), 'placement');
  assert.equal(resumeStep('finish', stepsFor(null, false)), 'finish');
  assert.equal(resumeStep('zones', stepsFor(null, false)), 'device');
  assert.equal(resumeStep('bogus', steps), 'device');
  assert.equal(resumeStep(undefined, steps), 'device');
});

test('canvas steps block Next until their progress flag is set', () => {
  const none = { outlineDone: false, placementDone: false, zonesReady: false };
  assert.match(nextBlocker('outline', none) ?? '', /outline/);
  assert.match(nextBlocker('placement', none) ?? '', /device/);
  assert.match(nextBlocker('zones', none) ?? '', /zone/);
  assert.equal(nextBlocker('doors', none), null);
  assert.equal(nextBlocker('furniture', none), null);
  assert.equal(nextBlocker('outline', { ...none, outlineDone: true }), null);
  assert.equal(isCanvasStep('doors'), true);
  assert.equal(isCanvasStep('finish'), false);
});

test('a device maps to the profile with the same model', () => {
  const profiles = [
    { id: 'everything_presence_lite', model: 'Everything Presence Lite' },
    { id: 'everything_presence_pro', model: 'Everything Presence Pro' },
  ];
  assert.equal(
    profileIdForModel('Everything Presence Pro', profiles),
    'everything_presence_pro',
  );
  assert.equal(profileIdForModel('Unknown', profiles), null);
  assert.equal(profileIdForModel(undefined, profiles), null);
});
