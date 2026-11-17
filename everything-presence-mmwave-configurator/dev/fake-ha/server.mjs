import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.resolve(HERE, '../../config/device-profiles');
const HOST = process.env.FAKE_HA_HOST ?? '127.0.0.1';
const PORT = Number(process.env.FAKE_HA_PORT ?? 8124);
const TICK_MS = Number(process.env.FAKE_HA_TICK_MS ?? 300);
const REQUIRED_TOKEN = process.env.FAKE_HA_TOKEN;
const BACKFILL_MINUTES = Number(process.env.FAKE_HA_BACKFILL_MINUTES ?? 20);
const TIME_SCALE = Number(process.env.FAKE_HA_TIME_SCALE ?? 2.5);
const HISTORY_CAP = 40000;
const HA_VERSION = '2026.11.1';

const md5 = (s) => createHash('md5').update(s).digest('hex');
const iso = (ms) => new Date(ms).toISOString();
const log = (...args) => console.log(new Date().toISOString(), '[fake-ha]', ...args);
const loadProfile = (id) => JSON.parse(fs.readFileSync(path.join(PROFILE_DIR, `${id}.json`), 'utf8'));
const fmtNumber = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
const WORDS = { mmwave: 'mmWave', co2: 'CO2', x: 'X', y: 'Y', pir: 'PIR', led: 'LED', ld2450: 'LD2450', pct: '%', ip: 'IP', wifi: 'WiFi' };
const humanize = (s) => s.split('_').map((w) => WORDS[w] ?? w[0].toUpperCase() + w.slice(1)).join(' ');

const AREAS = [
  { area_id: 'office', name: 'Office' },
  { area_id: 'living_room', name: 'Living Room' },
  { area_id: 'bedroom', name: 'Bedroom' },
];

const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
const rect = (pfx, i, [bx, ex, by, ey], keys = ['begin_x', 'end_x', 'begin_y', 'end_y']) =>
  Object.fromEntries(keys.map((k, j) => [`${pfx}_${i}_${k}`, [bx, ex, by, ey][j]]));
const PRO_RECT = ['start_x', 'end_x', 'start_y', 'end_y'];

const isPolygonKey = (k) => /^polygon/.test(k);
const isEntryExitKey = (k) =>
  /^(entry\d|entryExit|exitThreshold|assume)/.test(k);
const isRectCoordKey = (k) => /^(zone|exclusion|entry)\d(Begin|End)[XY]$/.test(k);

// path params: r0/rAmp in mm, w in rad/s, th in degrees
const DEVICES = [
  {
    key: 'pro',
    mac: '7c:d5:44:22:55:00',
    name: 'Everything Presence Pro 225500',
    nameByUser: null,
    model: 'Everything Presence Pro',
    sw: '1.1.3 (ESPHome 2025.10.5)',
    latest: '1.3.0',
    prefix: 'everything_presence_pro_225500',
    node: 'everything-presence-pro-225500',
    area: 'living_room',
    profile: 'everything_presence_pro',
    style: 'pro',
    include: (k) => !isPolygonKey(k) && !isEntryExitKey(k) && !/^entry/.test(k) && k !== 'co2',
    extras: [
      ['binary_sensor', 'motion', 'off', { device_class: 'motion' }],
      ['binary_sensor', 'static_presence', 'on', { device_class: 'occupancy' }],
      ['binary_sensor', 'mmwave_presence', 'on', { device_class: 'occupancy' }],
      ['binary_sensor', 'tracking_presence', 'on', { device_class: 'occupancy' }],
      ['sensor', 'temperature', '22.4', { unit_of_measurement: '°C', device_class: 'temperature' }],
      ['sensor', 'humidity', '46.2', { unit_of_measurement: '%', device_class: 'humidity' }],
      ['sensor', 'illuminance', '182.0', { unit_of_measurement: 'lx', device_class: 'illuminance' }],
    ],
    overrides: {
      tracking_detection_range: 600,
      tracking_sensor_angle: 0,
      tracking_presence_timeout: 30,
      stuck_target_timeout: 10,
      static_presence_min_range: 0.6,
      static_presence_max_range: 6,
      static_presence_trigger_range: 4,
      static_presence_timeout: 30,
      static_presence_sustain_sensitivity: 7,
      static_presence_trigger_sensitivity: 7,
      led_brightness: 0.5,
      occupancy_timeout: 30,
      motion_timeout: 5,
      static_presence_sensor_enable: 'on',
      auto_clear_stuck_targets: 'on',
      update_speed: 'Normal (0.3s)',
      target_tracking_detail: 'Above + Speed and Resolution',
      led_mode: 'Presence',
      relay_trigger_mode: 'Disabled',
      ...rect('zone', 1, [-1500, 1500, 500, 3000], PRO_RECT),
      ...rect('zone', 2, [-2600, -600, 3000, 5000], PRO_RECT),
      ...rect('exclusion_zone', 1, [1600, 2600, 4000, 5400], PRO_RECT),
    },
    paths: [
      { r0: 2200, rAmp: 1300, w: 0.11, phase: 0, th: 38, w2: 0.07, phase2: 0.3 },
      { r0: 3600, rAmp: 1500, w: 0.08, phase: 2.1, th: 42, w2: 0.05, phase2: 2.4 },
      null,
    ],
  },
  {
    key: 'liteRect',
    mac: '30:76:f5:ae:d0:c8',
    name: 'Everything Presence Lite aed0c8',
    nameByUser: null,
    model: 'Everything Presence Lite',
    sw: '1.3.0 (ESPHome 2025.6.2)',
    latest: '1.5.0',
    prefix: 'everything_presence_lite_aed0c8',
    node: 'everything-presence-lite-aed0c8',
    area: 'bedroom',
    profile: 'everything_presence_lite',
    style: 'liteRect',
    buildFlags: { model: 'everything-presence-lite', co2_enabled: false },
    include: (k) =>
      !isPolygonKey(k) && !isEntryExitKey(k) && !/^(entry\d(Begin|End)|exclusion2|staleTarget)/.test(k) && k !== 'co2',
    extras: [
      ['switch', 'extra_entities_update', 'off', {}],
      ['sensor', 'temperature', '20.8', { unit_of_measurement: '°C', device_class: 'temperature' }],
      ['sensor', 'humidity', '51.0', { unit_of_measurement: '%', device_class: 'humidity' }],
      ['sensor', 'illuminance', '35.0', { unit_of_measurement: 'lx', device_class: 'illuminance' }],
    ],
    overrides: {
      max_distance: 600,
      installation_angle: -20,
      occupancy_off_delay: 15,
      update_speed: 'Normal (0.3s)',
      tracking_behaviour: 'Above + Speed and Resolution',
      ...rect('zone', 1, [-1200, 1200, 300, 2500]),
      ...rect('zone', 2, [800, 2400, 2500, 4500]),
      ...rect('occupancy_mask', 1, [-2200, -1000, 3500, 4600]),
    },
    paths: [{ r0: 2600, rAmp: 1600, w: 0.09, phase: 1.0, th: 40, w2: 0.06, phase2: 1.2 }, null, null],
  },
  {
    key: 'office',
    mac: '8c:4f:00:60:3e:a4',
    name: 'Everything Presence Lite 603ea4',
    nameByUser: 'Office ep1',
    model: 'Everything Presence Lite',
    sw: '1.5.0 (ESPHome 2026.10.0)',
    latest: '1.5.0',
    prefix: 'office_office_ep1',
    node: 'everything-presence-lite-603ea4',
    area: 'office',
    profile: 'everything_presence_lite',
    style: 'litePoly',
    buildFlags: { model: 'everything-presence-lite', co2_enabled: true },
    include: (k) => !isRectCoordKey(k) && k !== 'polygonZonesEnabled' && k !== 'zone1TargetCount',
    extras: [
      ['sensor', 'temperature', '21.6', { unit_of_measurement: '°C', device_class: 'temperature' }],
      ['sensor', 'humidity', '43.5', { unit_of_measurement: '%', device_class: 'humidity' }],
      ['sensor', 'illuminance', '240.0', { unit_of_measurement: 'lx', device_class: 'illuminance' }],
    ],
    overrides: {
      max_distance: 600,
      installation_angle: 0,
      exit_threshold_pct: 10,
      assume_present_timeout: 1800,
      entry_exit_enabled: 'off',
      occupancy_off_delay: 15,
      stale_target_reset_timeout: 10,
      update_speed: 'Normal (0.3s)',
      tracking_behaviour: 'Above + Speed and Resolution',
      co2: '612',
      polygon_zone_1: '-1800:600;1500:400;2300:3100;600:4300;-1700:3200',
    },
    paths: [{ r0: 2500, rAmp: 1400, w: 0.1, phase: 0.4, th: 45, w2: 0.065, phase2: 0.8 }, null, null],
  },
  {
    key: 'livingRoom',
    mac: '8c:4f:00:62:5a:98',
    name: 'Everything Presence Lite 625a98',
    nameByUser: 'EP1 Living Room',
    model: 'Everything Presence Lite',
    sw: '1.5.0 (ESPHome 2026.10.0)',
    latest: '1.5.0',
    prefix: 'living_room_ep1_living_room',
    node: 'everything-presence-lite-625a98',
    area: 'living_room',
    profile: 'everything_presence_lite',
    style: 'litePoly',
    unavailable: true,
    buildFlags: { model: 'everything-presence-lite', co2_enabled: true },
    include: (k) => !isRectCoordKey(k) && k !== 'polygonZonesEnabled' && k !== 'zone1TargetCount',
    extras: [
      ['sensor', 'temperature', '0', { unit_of_measurement: '°C', device_class: 'temperature' }],
      ['sensor', 'humidity', '0', { unit_of_measurement: '%', device_class: 'humidity' }],
      ['sensor', 'illuminance', '0', { unit_of_measurement: 'lx', device_class: 'illuminance' }],
    ],
    overrides: {},
    paths: [null, null, null],
  },
  {
    key: 'ep1',
    mac: '11:22:33:44:55:66',
    name: 'Everything Presence One abc123',
    nameByUser: null,
    model: 'Everything Presence One',
    sw: '1.3.2 (ESPHome 2025.5.1)',
    latest: '1.3.2',
    prefix: 'everything_presence_one_abc123',
    node: 'everything-presence-one-abc123',
    area: 'bedroom',
    profile: 'everything_presence_one',
    style: 'ep1',
    include: (k) =>
      [
        'presence', 'mmwave', 'pir', 'temperature', 'humidity', 'illuminance', 'firmwareUpdate',
        'mmwaveOnLatency', 'mmwaveOffLatency', 'temperatureOffset', 'humidityOffset', 'illuminanceOffset', 'mmwaveLed',
      ].includes(k),
    extras: [
      ['number', 'mmwave_distance', 600, { min: 0, max: 900, step: 1, unit_of_measurement: 'cm', mode: 'box' }],
      ['number', 'mmwave_sensitivity', 7, { min: 0, max: 9, step: 1, mode: 'slider' }],
    ],
    overrides: {
      occupancy: 'on',
      mmwave: 'on',
      pir: 'off',
      temperature: '23.1',
      humidity: '48.7',
      illuminance: '96.0',
      mmwave_on_latency: 0,
      mmwave_off_latency: 15,
    },
    paths: [],
  },
];

const COMMON_EXTRAS = (d) => [
  ['sensor', 'wifi_signal', '-58', { unit_of_measurement: 'dBm', device_class: 'signal_strength' }, 'diagnostic'],
  ['sensor', 'uptime', '86400', { unit_of_measurement: 's', device_class: 'duration' }, 'diagnostic'],
  ['sensor', 'ip_address', `192.168.1.${40 + DEVICES.indexOf(d)}`, {}, 'diagnostic'],
  ['button', 'restart', 'unknown', { device_class: 'restart' }, 'config'],
];

// ─── registries and state store ────────────────────────────────────

const states = new Map();
const entityRegistry = new Map();
const deviceRegistry = [];
const configEntries = [];
const history = new Map();
const services = {
  homeassistant: ['update_entity', 'reload_core_config'],
  number: ['set_value'],
  select: ['select_option', 'select_first', 'select_last', 'select_next', 'select_previous'],
  switch: ['turn_on', 'turn_off', 'toggle'],
  light: ['turn_on', 'turn_off', 'toggle'],
  input_boolean: ['turn_on', 'turn_off', 'toggle'],
  text: ['set_value'],
  button: ['press'],
  update: ['install', 'skip', 'clear_skipped'],
  esphome: [],
};
const RESPONSE_SERVICES = new Set();
const SETTING_DOMAINS = new Set(['number', 'select', 'switch', 'text', 'light', 'button', 'update']);

const tracking = {
  x: { unit_of_measurement: 'mm', device_class: 'distance' },
  y: { unit_of_measurement: 'mm', device_class: 'distance' },
  distance: { unit_of_measurement: 'mm', device_class: 'distance' },
  resolution: { unit_of_measurement: 'mm', device_class: 'distance' },
  speed: { unit_of_measurement: 'm/s', device_class: 'speed' },
  angle: { unit_of_measurement: '°' },
  energy: {},
  targetCount: {},
};

const domainAttrs = (domain, obj, def) => {
  switch (domain) {
    case 'number':
      if (def.coord) {
        return { min: /X$/.test(def.coord) ? -6000 : 0, max: 6000, step: 1, mode: 'box', unit_of_measurement: 'mm' };
      }
      return {
        min: def.min ?? 0,
        max: def.max ?? 6000,
        step: def.step ?? 1,
        mode: 'box',
        ...(def.unit ? { unit_of_measurement: def.unit === 'deg' ? '°' : def.unit } : {}),
      };
    case 'select':
      return { options: def.options ?? ['Default'] };
    case 'text':
      return { mode: 'text', min: 0, max: 255, pattern: null };
    case 'light':
      return { supported_color_modes: ['onoff'], color_mode: null, supported_features: 0 };
    case 'event':
      return { event_types: ['entry', 'exit', 'cancelled'], event_type: null };
    case 'binary_sensor':
      if (/(occupancy|presence|mmwave|pir|assumed_present)$/.test(obj)) return { device_class: 'occupancy' };
      if (/motion$/.test(obj)) return { device_class: 'motion' };
      return {};
    case 'sensor': {
      if (def.property && tracking[def.property]) return { state_class: 'measurement', ...tracking[def.property] };
      if (obj === 'co2') return { state_class: 'measurement', unit_of_measurement: 'ppm', device_class: 'carbon_dioxide' };
      if (/target_count$/.test(obj)) return { state_class: 'measurement' };
      if (obj === 'assumed_present_remaining') return { unit_of_measurement: 's', device_class: 'duration' };
      return { state_class: 'measurement' };
    }
    default:
      return {};
  }
};

const defaultState = (domain, attrs) => {
  switch (domain) {
    case 'number':
      return Math.min(Math.max(0, attrs.min), attrs.max);
    case 'select':
      return attrs.options[0];
    case 'text':
      return '';
    case 'button':
    case 'event':
      return 'unknown';
    case 'sensor':
      return '0';
    default:
      return 'off';
  }
};

const versionOf = (sw) => sw.split(' ')[0];

const addEntity = (d, deviceId, entryId, domain, obj, { state, attrs = {}, name, category = null }) => {
  const entityId = `${domain}.${d.prefix}_${obj}`;
  const originalName = name ?? humanize(obj);
  const displayName = d.nameByUser ?? d.name;
  const value = d.unavailable ? 'unavailable' : domain === 'number' ? fmtNumber(Number(state)) : String(state);
  const now = Date.now();
  states.set(entityId, {
    entity_id: entityId,
    state: value,
    attributes: { ...attrs, friendly_name: `${displayName} ${originalName}` },
    last_changed: iso(now),
    last_reported: iso(now),
    last_updated: iso(now),
    context: { id: randomUUID().replace(/-/g, ''), parent_id: null, user_id: null },
  });
  entityRegistry.set(entityId, {
    area_id: null,
    categories: {},
    config_entry_id: entryId,
    config_subentry_id: null,
    created_at: 0,
    device_id: deviceId,
    disabled_by: null,
    entity_category: category ?? (SETTING_DOMAINS.has(domain) ? 'config' : null),
    entity_id: entityId,
    has_entity_name: true,
    hidden_by: null,
    icon: null,
    id: md5(`entity:${d.mac}:${domain}:${obj}`),
    labels: [],
    modified_at: 0,
    name: null,
    options: {},
    original_name: originalName,
    platform: 'esphome',
    translation_key: null,
    unique_id: `${d.mac.toUpperCase()}-${domain}-${obj}`,
  });
};

const seed = () => {
  const now = Date.now() / 1000;
  for (const d of DEVICES) {
    const deviceId = md5(`device:${d.mac}`);
    const entryId = md5(`entry:${d.mac}`).slice(0, 26).toUpperCase();
    d.deviceId = deviceId;
    d.entryId = entryId;
    configEntries.push({
      entry_id: entryId,
      domain: 'esphome',
      title: d.name,
      source: 'zeroconf',
      state: 'loaded',
      supports_options: true,
      supports_remove_device: true,
      supports_unload: true,
      disabled_by: null,
      reason: null,
      data: { host: '127.0.0.1', port: 6053, device_name: d.node },
    });
    deviceRegistry.push({
      area_id: d.area,
      configuration_url: null,
      config_entries: [entryId],
      config_entries_subentries: { [entryId]: [null] },
      connections: [['mac', d.mac]],
      created_at: now - 86400 * 90,
      disabled_by: null,
      entry_type: null,
      hw_version: null,
      id: deviceId,
      identifiers: [],
      labels: [],
      manufacturer: 'Everything Smart Technology',
      model: d.model,
      model_id: null,
      modified_at: now - 3600,
      name_by_user: d.nameByUser,
      name: d.name,
      primary_config_entry: entryId,
      serial_number: null,
      sw_version: d.sw,
      via_device_id: null,
    });

    const profile = loadProfile(d.profile);
    for (const [key, def] of Object.entries(profile.entities)) {
      if (!d.include(key)) continue;
      const [domain, objTemplate] = def.template.split('.');
      const obj = objTemplate.replace('${name}_', '');
      let attrs = domainAttrs(domain, obj, def);
      let state = d.overrides[obj] ?? defaultState(domain, attrs);
      if (domain === 'update') {
        const installed = versionOf(d.sw);
        attrs = {
          auto_update: false,
          display_precision: 0,
          installed_version: installed,
          in_progress: false,
          latest_version: d.latest,
          release_summary: null,
          release_url: 'https://github.com/EverythingSmartHome',
          skipped_version: null,
          title: d.model,
          update_percentage: null,
          supported_features: 1,
        };
        state = installed === d.latest ? 'off' : 'on';
      }
      addEntity(d, deviceId, entryId, domain, obj, { state, attrs, name: def.label });
    }
    for (const [domain, obj, state, attrs, category] of [...d.extras, ...COMMON_EXTRAS(d)]) {
      addEntity(d, deviceId, entryId, domain, obj, {
        state,
        attrs: domain === 'sensor' && !attrs.state_class && obj !== 'ip_address' ? { state_class: 'measurement', ...attrs } : attrs,
        category,
      });
    }
    if (d.buildFlags) {
      const node = d.node.replace(/-/g, '_');
      services.esphome.push(`${node}_get_build_flags`, `${node}_set_update_manifest`);
      RESPONSE_SERVICES.add(`esphome.${node}_get_build_flags`);
      d.esphomeServiceNode = node;
    }
  }
};

// ─── state changes and subscriptions ───────────────────────────────

const connections = new Set();

const recordHistory = (s) => {
  let list = history.get(s.entity_id);
  if (!list) history.set(s.entity_id, (list = []));
  list.push({ state: s.state, attributes: s.attributes, last_changed: s.last_changed, last_updated: s.last_updated });
  if (list.length > HISTORY_CAP) list.splice(0, list.length - HISTORY_CAP);
};

const setState = (entityId, value, { attributes, at = Date.now(), emit = true, force = false } = {}) => {
  const old = states.get(entityId);
  if (!old) return null;
  const nextAttrs = attributes ? { ...old.attributes, ...attributes } : old.attributes;
  const stateChanged = old.state !== String(value);
  const attrsChanged = JSON.stringify(nextAttrs) !== JSON.stringify(old.attributes);
  if (!stateChanged && !attrsChanged && !force) return old;
  const next = {
    ...old,
    state: String(value),
    attributes: nextAttrs,
    last_changed: stateChanged ? iso(at) : old.last_changed,
    last_reported: iso(at),
    last_updated: iso(at),
    context: { id: randomUUID().replace(/-/g, ''), parent_id: null, user_id: null },
  };
  states.set(entityId, next);
  recordHistory(next);
  if (emit) broadcast(entityId, old, next);
  return next;
};

const send = (ws, msg) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
};

const broadcast = (entityId, oldState, newState) => {
  const timeFired = newState.last_updated;
  for (const conn of connections) {
    for (const [subId, sub] of conn.subs) {
      if (sub.kind === 'events') {
        send(conn.ws, {
          id: subId,
          type: 'event',
          event: {
            event_type: 'state_changed',
            data: { entity_id: entityId, old_state: oldState, new_state: newState },
            origin: 'LOCAL',
            time_fired: timeFired,
            context: newState.context,
          },
        });
      } else if (sub.kind === 'trigger' && sub.entityIds.has(entityId)) {
        send(conn.ws, {
          id: subId,
          type: 'event',
          event: {
            variables: {
              trigger: {
                id: '0',
                idx: '0',
                alias: null,
                platform: 'state',
                entity_id: entityId,
                from_state: oldState,
                to_state: newState,
                for: null,
                attribute: null,
                description: `state of ${entityId}`,
              },
            },
            context: newState.context,
          },
        });
      }
    }
  }
};

// ─── service calls ─────────────────────────────────────────────────

class ServiceError extends Error {
  constructor(status, message, code = 'service_validation_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const toIds = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

const resolveTargets = (data, target) => {
  const ids = new Set([...toIds(data.entity_id), ...toIds(target?.entity_id)]);
  for (const deviceId of [...toIds(data.device_id), ...toIds(target?.device_id)]) {
    for (const e of entityRegistry.values()) if (e.device_id === deviceId) ids.add(e.entity_id);
  }
  return [...ids];
};

const buildFlagsResponse = (service) => {
  const d = DEVICES.find((dev) => dev.esphomeServiceNode && service === `${dev.esphomeServiceNode}_get_build_flags`);
  if (!d) return null;
  return {
    model: d.buildFlags.model,
    ethernet_enabled: false,
    co2_enabled: d.buildFlags.co2_enabled,
    bluetooth_enabled: false,
    board_revision: '1.2',
    sensor_variant: '',
    firmware_channel: 'stable',
  };
};

const callService = (domain, service, data = {}, target = undefined, returnResponse = false) => {
  if (!services[domain]?.includes(service)) {
    throw new ServiceError(400, `Service ${domain}.${service} not found`, 'service_not_found');
  }
  const qualified = `${domain}.${service}`;
  const supportsResponse = RESPONSE_SERVICES.has(qualified);
  if (returnResponse && !supportsResponse) {
    throw new ServiceError(400, 'Service does not support responses. Remove return_response from request.');
  }
  if (!returnResponse && supportsResponse) {
    throw new ServiceError(400, 'Service call requires responses but caller did not ask for responses');
  }
  if (domain === 'esphome') {
    log(`esphome action ${service}`, JSON.stringify(data));
    return { changed: [], response: buildFlagsResponse(service) };
  }
  if (domain === 'update' && service === 'install') {
    throw new ServiceError(400, 'fake-ha does not simulate OTA installs');
  }

  const changed = [];
  for (const entityId of resolveTargets(data, target)) {
    if (!entityId.startsWith(`${domain}.`) && !(domain === 'homeassistant')) continue;
    const cur = states.get(entityId);
    if (!cur || cur.state === 'unavailable') continue;
    let next = null;
    switch (qualified) {
      case 'number.set_value': {
        const v = Number(data.value);
        const { min, max } = cur.attributes;
        if (!Number.isFinite(v)) throw new ServiceError(400, `expected float for dictionary value @ data['value']`);
        if (v < min || v > max) {
          throw new ServiceError(400, `Value ${v} for ${entityId} is outside valid range ${min} - ${max}`);
        }
        next = setState(entityId, fmtNumber(v));
        break;
      }
      case 'text.set_value': {
        const v = String(data.value ?? '');
        if (v.length > (cur.attributes.max ?? 255)) {
          throw new ServiceError(400, `Value ${v} for ${entityId} is too long (maximum length ${cur.attributes.max})`);
        }
        next = setState(entityId, v);
        break;
      }
      case 'select.select_option':
        if (!cur.attributes.options.includes(data.option)) {
          throw new ServiceError(400, `Option ${data.option} is not valid for entity ${entityId}`);
        }
        next = setState(entityId, data.option);
        break;
      case 'select.select_first':
      case 'select.select_last':
      case 'select.select_next':
      case 'select.select_previous': {
        const opts = cur.attributes.options;
        const idx = opts.indexOf(cur.state);
        const pick = {
          select_first: 0,
          select_last: opts.length - 1,
          select_next: (idx + 1) % opts.length,
          select_previous: (idx - 1 + opts.length) % opts.length,
        }[service];
        next = setState(entityId, opts[pick]);
        break;
      }
      case 'switch.turn_on':
      case 'light.turn_on':
      case 'input_boolean.turn_on':
        next = setState(entityId, 'on');
        break;
      case 'switch.turn_off':
      case 'light.turn_off':
      case 'input_boolean.turn_off':
        next = setState(entityId, 'off');
        break;
      case 'switch.toggle':
      case 'light.toggle':
      case 'input_boolean.toggle':
        next = setState(entityId, cur.state === 'on' ? 'off' : 'on');
        break;
      case 'button.press':
        next = setState(entityId, iso(Date.now()));
        break;
      case 'update.skip':
        next = setState(entityId, 'off', { attributes: { skipped_version: cur.attributes.latest_version } });
        break;
      case 'update.clear_skipped':
        next = setState(entityId, cur.attributes.installed_version === cur.attributes.latest_version ? 'off' : 'on', {
          attributes: { skipped_version: null },
        });
        break;
      case 'homeassistant.update_entity':
        next = setState(entityId, cur.state, { force: true });
        break;
      default:
        break;
    }
    if (next && next !== cur) changed.push(next);
  }
  if (changed.length) log(`${qualified}`, changed.map((s) => `${s.entity_id}=${s.state}`).join(', '));
  return { changed, response: null };
};

// ─── simulation ────────────────────────────────────────────────────

const parsePolygon = (text) =>
  (text ?? '')
    .split(';')
    .map((p) => p.match(/^(-?\d+):(-?\d+)$/))
    .filter(Boolean)
    .map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));

const pointInPolygon = ({ x, y }, poly) => {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

const num = (id) => {
  const v = parseFloat(states.get(id)?.state);
  return Number.isFinite(v) ? v : null;
};

const rectFrom = (p, base, keys) => {
  const [bx, ex, by, ey] = keys.map((k) => num(`number.${p}_${base}_${k}`));
  if ([bx, ex, by, ey].some((v) => v === null)) return null;
  if (bx === ex || by === ey) return null;
  return { x0: Math.min(bx, ex), x1: Math.max(bx, ex), y0: Math.min(by, ey), y1: Math.max(by, ey) };
};
const inRect = (pt, r) => r && pt.x >= r.x0 && pt.x <= r.x1 && pt.y >= r.y0 && pt.y <= r.y1;

const zoneShapes = (d) => {
  const p = d.prefix;
  if (d.style === 'litePoly') {
    const poly = (kind, i) => parsePolygon(states.get(`text.${p}_polygon_${kind}_${i}`)?.state);
    return {
      zones: range(4).map((i) => ({ i, contains: (pt) => pointInPolygon(pt, poly('zone', i)) })),
      exclusions: range(2).map((i) => (pt) => pointInPolygon(pt, poly('exclusion', i))),
    };
  }
  const [zoneBase, exclBase, keys] =
    d.style === 'pro' ? ['zone', 'exclusion_zone', PRO_RECT] : ['zone', 'occupancy_mask', ['begin_x', 'end_x', 'begin_y', 'end_y']];
  return {
    zones: range(4).map((i) => {
      const r = rectFrom(p, `${zoneBase}_${i}`, keys);
      return { i, contains: (pt) => inRect(pt, r) };
    }),
    exclusions: range(2).map((i) => {
      const r = rectFrom(p, `${exclBase}_${i}`, keys);
      return (pt) => inRect(pt, r);
    }),
  };
};

const pathPoint = (c, tSec) => {
  const t = tSec * TIME_SCALE;
  const r = c.r0 + c.rAmp * Math.sin(c.w * t + c.phase) + 0.25 * c.rAmp * Math.sin(2.3 * c.w * t + 0.7);
  const thDeg = c.th * Math.sin(c.w2 * t + c.phase2) + 8 * Math.sin(3.1 * c.w2 * t);
  const rr = Math.min(Math.max(r, 350), 5700);
  const th = (Math.min(Math.max(thDeg, -58), 58) * Math.PI) / 180;
  return { x: rr * Math.sin(th), y: rr * Math.cos(th) };
};

const stepDevice = (d, tSec, at, emit) => {
  const p = d.prefix;
  const set = (id, v) => setState(id, v, { at, emit });
  const maxCm = num(`number.${p}_${d.style === 'pro' ? 'tracking_detection_range' : 'max_distance'}`) ?? 600;
  const flip = states.get(`switch.${p}_upside_down_mounting`)?.state === 'on';
  const { zones, exclusions } = zoneShapes(d);
  const counts = new Map(zones.map((z) => [z.i, 0]));
  let present = 0;
  let moving = false;

  d.paths.forEach((c, idx) => {
    const n = idx + 1;
    let pt = c ? pathPoint(c, tSec) : null;
    if (pt && Math.hypot(pt.x, pt.y) > maxCm * 10) pt = null;
    if (!pt) {
      for (const k of ['x', 'y', 'speed', 'distance', 'angle', 'resolution']) set(`sensor.${p}_target_${n}_${k}`, '0');
      set(`binary_sensor.${p}_target_${n}_active`, 'off');
      return;
    }
    const prev = pathPoint(c, tSec - TICK_MS / 1000);
    const dist = Math.hypot(pt.x, pt.y);
    const speed = (dist - Math.hypot(prev.x, prev.y)) / TICK_MS;
    const reported = { x: Math.round(flip ? -pt.x : pt.x), y: Math.round(pt.y) };
    set(`sensor.${p}_target_${n}_x`, String(reported.x));
    set(`sensor.${p}_target_${n}_y`, String(reported.y));
    set(`sensor.${p}_target_${n}_distance`, String(Math.round(dist)));
    set(`sensor.${p}_target_${n}_angle`, (Math.atan2(reported.x, reported.y) * (180 / Math.PI)).toFixed(1));
    set(`sensor.${p}_target_${n}_speed`, speed.toFixed(2));
    set(`sensor.${p}_target_${n}_resolution`, '360');
    set(`binary_sensor.${p}_target_${n}_active`, 'on');
    if (Math.abs(speed) > 0.08) moving = true;
    if (exclusions.some((inside) => inside(reported))) return;
    present += 1;
    for (const z of zones) if (z.contains(reported)) counts.set(z.i, counts.get(z.i) + 1);
  });

  const onOff = (b) => (b ? 'on' : 'off');
  const zoneOccSuffix = d.style === 'pro' ? 'presence' : 'occupancy';
  for (const [i, count] of counts) {
    set(`sensor.${p}_zone_${i}_target_count`, String(count));
    set(`binary_sensor.${p}_zone_${i}_${zoneOccSuffix}`, onOff(count > 0));
  }
  set(`binary_sensor.${p}_occupancy`, onOff(present > 0));
  if (d.style === 'pro') {
    set(`binary_sensor.${p}_tracking_presence`, onOff(present > 0));
    set(`binary_sensor.${p}_motion`, onOff(moving));
  }
};

const animated = () => DEVICES.filter((d) => !d.unavailable && d.paths.some(Boolean));
const tick = (atMs, emit) => {
  for (const d of animated()) stepDevice(d, atMs / 1000, atMs, emit);
};

// ─── REST API ──────────────────────────────────────────────────────

const authorized = (token) => Boolean(token) && (!REQUIRED_TOKEN || token === REQUIRED_TOKEN);

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve(undefined);
      }
    });
  });

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const haConfig = () => ({
  allowlist_external_dirs: [],
  allowlist_external_urls: [],
  components: ['esphome', 'history', 'diagnostics', 'number', 'select', 'switch', 'text', 'update', 'websocket_api'],
  config_dir: '/config',
  config_source: 'storage',
  country: 'US',
  currency: 'USD',
  elevation: 0,
  external_url: null,
  internal_url: null,
  language: 'en',
  latitude: 52.37,
  location_name: 'Home',
  longitude: 4.89,
  radius: 100,
  recovery_mode: false,
  safe_mode: false,
  state: 'RUNNING',
  time_zone: 'Europe/Amsterdam',
  unit_system: { length: 'km', accumulated_precipitation: 'mm', mass: 'g', pressure: 'Pa', temperature: '°C', volume: 'L', wind_speed: 'm/s' },
  version: HA_VERSION,
  whitelist_external_dirs: [],
});

const servicesList = () =>
  Object.entries(services).map(([domain, names]) => ({
    domain,
    services: Object.fromEntries(names.map((n) => [n, { name: humanize(n), description: '', fields: {} }])),
  }));

const historyFor = (ids, startMs, endMs, minimal) => {
  const out = [];
  for (const id of ids) {
    const list = history.get(id) ?? [];
    let initial = null;
    const within = [];
    for (const h of list) {
      const t = Date.parse(h.last_changed);
      if (t <= startMs) initial = h;
      else if (t <= endMs) within.push(h);
    }
    const series = [];
    const cur = states.get(id);
    const first = initial ?? (within.length ? null : cur);
    if (first) {
      series.push({ entity_id: id, state: first.state, attributes: first.attributes, last_changed: iso(startMs), last_updated: iso(startMs) });
    }
    for (const h of within) {
      if (!series.length) series.push({ entity_id: id, state: h.state, attributes: h.attributes, last_changed: h.last_changed, last_updated: h.last_updated });
      else if (minimal) series.push({ state: h.state, last_changed: h.last_changed });
      else series.push({ entity_id: id, ...h });
    }
    if (series.length) out.push(series);
  }
  return out;
};

const handleRest = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  if (!p.startsWith('/api')) return json(res, 404, { message: 'Not found' });
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!authorized(token)) return json(res, 401, { message: '401: Unauthorized' });

  if (req.method === 'GET' && (p === '/api/' || p === '/api')) return json(res, 200, { message: 'API running.' });
  if (req.method === 'GET' && p === '/api/config') return json(res, 200, haConfig());
  if (req.method === 'GET' && p === '/api/states') return json(res, 200, [...states.values()]);
  if (req.method === 'GET' && p === '/api/services') return json(res, 200, servicesList());

  let m = p.match(/^\/api\/states\/(.+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (req.method === 'GET') {
      const s = states.get(id);
      return s ? json(res, 200, s) : json(res, 404, { message: 'Entity not found.' });
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (!body || body.state === undefined) return json(res, 400, { message: 'No state specified.' });
      if (!states.has(id)) return json(res, 400, { message: 'fake-ha only updates seeded entities' });
      return json(res, 200, setState(id, body.state, { attributes: body.attributes, force: true }));
    }
  }

  m = p.match(/^\/api\/services\/([^/]+)\/([^/]+)$/);
  if (m && req.method === 'POST') {
    const body = await readBody(req);
    if (body === undefined) return json(res, 400, { message: 'Data should be valid JSON.' });
    try {
      const wantResponse = url.searchParams.has('return_response');
      const { changed, response } = callService(m[1], m[2], body, undefined, wantResponse);
      return json(res, 200, wantResponse ? { changed_states: changed, service_response: response } : changed);
    } catch (err) {
      return json(res, err.status ?? 500, { message: err.message });
    }
  }

  m = p.match(/^\/api\/history\/period(?:\/(.+))?$/);
  if (m && req.method === 'GET') {
    const startMs = m[1] ? Date.parse(decodeURIComponent(m[1])) : Date.now() - 86400000;
    const endMs = url.searchParams.get('end_time') ? Date.parse(url.searchParams.get('end_time')) : Date.now();
    const ids = (url.searchParams.get('filter_entity_id') ?? '').split(',').filter(Boolean);
    if (!ids.length) return json(res, 400, { message: 'filter_entity_id is missing' });
    return json(res, 200, historyFor(ids, startMs, endMs, url.searchParams.has('minimal_response')));
  }

  if (req.method === 'GET' && p === '/api/config/config_entries/entry') {
    const domain = url.searchParams.get('domain');
    return json(res, 200, configEntries.filter((e) => !domain || e.domain === domain).map(({ data, ...e }) => e));
  }

  m = p.match(/^\/api\/diagnostics\/config_entry\/([^/]+)$/);
  if (m && req.method === 'GET') {
    const entry = configEntries.find((e) => e.entry_id === decodeURIComponent(m[1]));
    if (!entry) return json(res, 404, { message: 'Config entry not found' });
    return json(res, 200, {
      home_assistant: { version: HA_VERSION },
      integration_manifest: { domain: 'esphome', name: 'ESPHome' },
      data: { config: { domain: 'esphome', title: entry.title, data: { ...entry.data, noise_psk: '**REDACTED**' } } },
    });
  }

  if (p === '/api/template') return json(res, 400, { message: 'fake-ha does not render Jinja templates' });
  return json(res, 404, { message: 'Not found' });
};

// ─── WebSocket API ─────────────────────────────────────────────────

const result = (id, payload) => ({ id, type: 'result', success: true, result: payload });
const failure = (id, code, message) => ({ id, type: 'result', success: false, error: { code, message } });

const servicesForTarget = (target) => {
  const ids = resolveTargets({}, target);
  const domains = new Set(ids.map((id) => id.split('.')[0]));
  return [...domains].flatMap((dom) => (services[dom] ?? []).map((s) => `${dom}.${s}`)).sort();
};

const handleWsCommand = (conn, msg) => {
  const { id, type } = msg;
  switch (type) {
    case 'ping':
      return { id, type: 'pong' };
    case 'supported_features':
      return result(id, null);
    case 'get_states':
      return result(id, [...states.values()]);
    case 'get_config':
      return result(id, haConfig());
    case 'get_services':
      return result(id, Object.fromEntries(servicesList().map((s) => [s.domain, s.services])));
    case 'get_services_for_target':
      return result(id, servicesForTarget(msg.target ?? {}));
    case 'config/device_registry/list':
      return result(id, deviceRegistry);
    case 'config/entity_registry/list':
      return result(id, [...entityRegistry.values()]);
    case 'config/area_registry/list':
      return result(
        id,
        AREAS.map((a) => ({ ...a, aliases: [], floor_id: null, humidity_entity_id: null, icon: null, labels: [], picture: null, temperature_entity_id: null, created_at: 0, modified_at: 0 }))
      );
    case 'config/entity_registry/update': {
      const entry = entityRegistry.get(msg.entity_id);
      if (!entry) return failure(id, 'not_found', 'Entity not found');
      if ('name' in msg) entry.name = msg.name;
      const s = states.get(msg.entity_id);
      const dev = deviceRegistry.find((dv) => dv.id === entry.device_id);
      setState(msg.entity_id, s.state, {
        attributes: { friendly_name: `${dev?.name_by_user ?? dev?.name ?? ''} ${entry.name ?? entry.original_name}`.trim() },
      });
      return result(id, { entity_entry: entry });
    }
    case 'subscribe_events':
      if (msg.event_type && msg.event_type !== 'state_changed') {
        conn.subs.set(id, { kind: 'other' });
      } else {
        conn.subs.set(id, { kind: 'events' });
      }
      return result(id, null);
    case 'subscribe_trigger': {
      const triggers = toIds(msg.trigger);
      const entityIds = new Set(triggers.flatMap((t) => (t.platform ?? t.trigger) === 'state' ? toIds(t.entity_id) : []));
      conn.subs.set(id, { kind: 'trigger', entityIds });
      return result(id, null);
    }
    case 'unsubscribe_events':
      if (!conn.subs.delete(msg.subscription)) return failure(id, 'not_found', 'Subscription not found.');
      return result(id, null);
    case 'call_service':
      try {
        const { response } = callService(msg.domain, msg.service, msg.service_data ?? {}, msg.target, Boolean(msg.return_response));
        return result(id, { context: { id: randomUUID().replace(/-/g, ''), parent_id: null, user_id: null }, response });
      } catch (err) {
        return failure(id, err.code ?? 'home_assistant_error', err.message);
      }
    default:
      return failure(id, 'unknown_command', `Unknown command: ${type}`);
  }
};

// ─── boot ──────────────────────────────────────────────────────────

seed();
const backfillStart = Date.now() - BACKFILL_MINUTES * 60_000;
for (let t = backfillStart; t < Date.now(); t += 1000) tick(t, false);
tick(Date.now(), false);

const server = http.createServer((req, res) => {
  handleRest(req, res).catch((err) => {
    log('REST error', err);
    json(res, 500, { message: String(err?.message ?? err) });
  });
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://x').pathname !== '/api/websocket') return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
});

wss.on('connection', (ws) => {
  const conn = { ws, authed: false, subs: new Map() };
  send(ws, { type: 'auth_required', ha_version: HA_VERSION });
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!conn.authed) {
      if (msg.type === 'auth' && authorized(msg.access_token ?? msg.api_password)) {
        conn.authed = true;
        connections.add(conn);
        return send(ws, { type: 'auth_ok', ha_version: HA_VERSION });
      }
      send(ws, { type: 'auth_invalid', message: 'Invalid access token or password' });
      return ws.close();
    }
    for (const m of Array.isArray(msg) ? msg : [msg]) send(ws, handleWsCommand(conn, m));
  });
  ws.on('close', () => connections.delete(conn));
});

const timer = setInterval(() => tick(Date.now(), true), TICK_MS);

server.listen(PORT, HOST, () => {
  log(`listening on http://${HOST}:${PORT} (ws at /api/websocket), ${states.size} entities, ${DEVICES.length} devices`);
  for (const d of DEVICES) log(`  ${d.deviceId}  ${d.nameByUser ?? d.name}  [${d.model}, ${d.sw}]${d.unavailable ? ' unavailable' : ''}`);
});

const shutdown = () => {
  clearInterval(timer);
  for (const c of connections) c.ws.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
