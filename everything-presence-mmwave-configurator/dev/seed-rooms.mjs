// Seeds realistic rooms into a running local backend (dev/run-local.sh).
// Usage: node dev/seed-rooms.mjs [http://127.0.0.1:42069]
const base = process.argv[2] ?? 'http://127.0.0.1:42069';

const json = async (path, init) => {
  const res = await fetch(`${base}${path}`, init);
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
};
const put = (path, body) => json(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const post = (path, body) => json(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const PROFILE_BY_MODEL = {
  'Everything Presence Pro': 'everything_presence_pro',
  'Everything Presence Lite': 'everything_presence_lite',
  'Everything Presence One': 'everything_presence_one',
};

const rect = (w, d) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: d }, { x: 0, y: d }];

const ROOMS = [
  {
    match: 'Office ep1',
    name: 'Office',
    roomShell: { points: [{ x: 0, y: 0 }, { x: 4200, y: 0 }, { x: 4200, y: 3600 }, { x: 2400, y: 3600 }, { x: 2400, y: 4800 }, { x: 0, y: 4800 }] },
    devicePlacement: { x: 2100, y: 0, rotationDeg: 0, mountType: 'wall', heightMm: 1200 },
    floorMaterial: 'wood-oak',
    zones: [
      { id: 'zone-1', type: 'regular', x: -1800, y: 600, width: 1600, height: 1400, enabled: true, label: 'Desk' },
      { id: 'zone-2', type: 'regular', x: 400, y: 2200, width: 1500, height: 1200, enabled: true, label: 'Sofa' },
      { id: 'exclusion-1', type: 'exclusion', x: 1200, y: 200, width: 800, height: 600, enabled: true, label: 'Fan' },
    ],
    doors: [{ id: 'door-1', style: 'single', segmentIndex: 5, positionOnSegment: 0.3, widthMm: 900, swingDirection: 'in', swingSide: 'left' }],
  },
  {
    match: 'Everything Presence Pro 225500',
    name: 'Living Room',
    roomShell: { points: rect(5600, 4400) },
    devicePlacement: { x: 2800, y: 0, rotationDeg: 0, mountType: 'wall', heightMm: 1500 },
    floorMaterial: 'carpet-gray',
    zones: [
      { id: 'zone-1', type: 'regular', x: -2200, y: 1800, width: 2400, height: 1600, enabled: true, label: 'Couch' },
      { id: 'zone-2', type: 'regular', x: 800, y: 600, width: 1600, height: 1200, enabled: true, label: 'Dining' },
      { id: 'entry-1', type: 'entry', x: 1800, y: 3400, width: 1000, height: 900, enabled: true, label: 'Hall door' },
    ],
    doors: [{ id: 'door-1', style: 'single', segmentIndex: 2, positionOnSegment: 0.8, widthMm: 900, swingDirection: 'in', swingSide: 'right' }],
  },
  {
    match: 'Everything Presence Lite aed0c8',
    name: 'Bedroom',
    roomShell: { points: rect(3800, 4000) },
    devicePlacement: { x: 1900, y: 0, rotationDeg: 0, mountType: 'wall', heightMm: 1100 },
    floorMaterial: 'wood-walnut',
    zones: [
      { id: 'zone-1', type: 'regular', x: -900, y: 1200, width: 1800, height: 2000, enabled: true, label: 'Bed' },
    ],
    doors: [],
  },
];

const { devices } = await json('/api/devices');
for (const spec of ROOMS) {
  const device = devices.find((d) => d.name === spec.match);
  if (!device) throw new Error(`device not found: ${spec.match}`);
  const profileId = PROFILE_BY_MODEL[device.model];
  const discovery = await json(`/api/devices/${device.id}/discover-entities?profileId=${profileId}`);
  const mappings = Object.fromEntries(
    discovery.results.filter((r) => r.matchedEntityId).map((r) => [r.templateKey, r.matchedEntityId]),
  );
  const now = new Date().toISOString();
  await put(`/api/device-mappings/${device.id}`, {
    deviceId: device.id,
    profileId,
    deviceName: device.name,
    discoveredAt: now,
    lastUpdated: now,
    confirmedByUser: true,
    autoMatchedCount: discovery.matchedCount,
    manuallyMappedCount: 0,
    mappings,
  });
  const { room } = await post('/api/rooms', {
    name: spec.name,
    deviceId: device.id,
    profileId,
    units: 'metric',
    entityMappings: mappings,
    zones: spec.zones,
    roomShell: spec.roomShell,
    roomShellFillMode: 'material',
    floorMaterial: spec.floorMaterial,
    devicePlacement: spec.devicePlacement,
    doors: spec.doors,
  });
  console.log(`room ${room.name} (${room.id}) -> ${device.name}`);
}
await put('/api/settings', { wizardCompleted: true });
console.log('done');
