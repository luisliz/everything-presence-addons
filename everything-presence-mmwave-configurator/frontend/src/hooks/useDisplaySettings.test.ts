// @ts-nocheck -- Node's built-in runner supplies these modules.
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDisplaySettings } from './useDisplaySettings.ts';

test('legacy settings receive marker appearance defaults', () => {
  const settings = normalizeDisplaySettings({ showWalls: false });
  assert.deepEqual([settings.deviceMarkerStyle, settings.deviceMarkerScale, settings.deviceMarkerOpacity], ['icon', 0.5, 1]);
});

test('valid marker appearance settings survive normalization', () => {
  const settings = normalizeDisplaySettings({ deviceMarkerStyle: 'node', deviceMarkerScale: 0.75, deviceMarkerOpacity: 0.4 });
  assert.deepEqual([settings.deviceMarkerStyle, settings.deviceMarkerScale, settings.deviceMarkerOpacity], ['node', 0.75, 0.4]);
});

test('marker values are finite, bounded, and opacity is quantized', () => {
  assert.equal(normalizeDisplaySettings({ deviceMarkerScale: Number.NaN }).deviceMarkerScale, 0.5);
  assert.equal(normalizeDisplaySettings({ deviceMarkerScale: 10 }).deviceMarkerScale, 2);
  assert.equal(normalizeDisplaySettings({ deviceMarkerOpacity: 0.66 }).deviceMarkerOpacity, 0.7);
  assert.equal(normalizeDisplaySettings({ deviceMarkerOpacity: -1 }).deviceMarkerOpacity, 0.1);
});

test('defaults show the unclipped cone', () => {
  const settings = normalizeDisplaySettings(undefined);
  assert.deepEqual([settings.showDeviceRadar, settings.clipRadarToWalls], [true, false]);
});

test('settings stored before version 2 get the cone defaults once', () => {
  const settings = normalizeDisplaySettings({ showDeviceRadar: false, clipRadarToWalls: true, showWalls: false });
  assert.deepEqual([settings.showDeviceRadar, settings.clipRadarToWalls, settings.showWalls], [true, false, false]);
  assert.equal('version' in settings, false);
});

test('version 2 settings keep the stored cone choices', () => {
  const settings = normalizeDisplaySettings({ version: 2, showDeviceRadar: false, clipRadarToWalls: true });
  assert.deepEqual([settings.showDeviceRadar, settings.clipRadarToWalls], [false, true]);
});
