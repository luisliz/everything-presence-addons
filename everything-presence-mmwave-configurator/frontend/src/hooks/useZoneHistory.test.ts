// @ts-nocheck -- Node's built-in runner supplies these modules.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { useZoneHistory } from './useZoneHistory.ts';

const state = (x) => ({
  zones: [
    { id: 'Zone 1', type: 'regular', x, y: 0, width: 1000, height: 1000 },
  ],
  polygonZones: [],
});

// The API reads refs only, so one server render gives a usable handle.
const mount = (initial) => {
  let api = null;
  const Probe = () => {
    api = useZoneHistory(initial);
    return null;
  };
  renderToString(createElement(Probe));
  return api;
};

test('push, undo and redo walk the zones timeline', () => {
  const history = mount(state(0));
  assert.equal(history.canUndo, false);
  assert.equal(history.push(state(100)), true);
  assert.equal(history.push(state(200)), true);

  assert.equal(history.undo().zones[0].x, 100);
  assert.equal(history.undo().zones[0].x, 0);
  assert.equal(history.undo(), null);
  assert.equal(history.redo().zones[0].x, 100);
  assert.equal(history.redo().zones[0].x, 200);
  assert.equal(history.redo(), null);
});

test('an unchanged push records nothing and a gesture coalesces', () => {
  const history = mount(state(0));
  assert.equal(history.push(state(0)), false);
  for (let x = 10; x <= 50; x += 10)
    history.push(state(x), { coalesceKey: 'drag:Zone 1' });
  assert.equal(history.undo().zones[0].x, 0);
  assert.equal(history.undo(), null);
});

test('reset drops every step', () => {
  const history = mount(state(0));
  history.push(state(1));
  history.reset();
  assert.equal(history.undo(), null);
});
