# Map of the code behind each UI complaint

Root: `everything-presence-mmwave-configurator/frontend/src`. Paths relative to it. Mapped by reading only; no designs proposed here.

## 1. One device per room, a room dropdown at the top, a "Menu" button on wide screens

### How rooms, devices and profiles relate
`api/types.ts:306-322`
```ts
export interface RoomConfig {
  id: string;
  name: string;
  deviceId?: string;
  profileId?: string;
  units: 'metric' | 'imperial';
  zones: ZoneRect[];
  entityMappings?: EntityMappings;
  entityNamePrefix?: string;        // DEPRECATED
  roomShell?: RoomShell;
  ...
  devicePlacement?: DevicePlacement;
```
- Each room holds one optional `deviceId`, one `profileId`, one `devicePlacement` (`types.ts:155-171`: x, y, rotationDeg, mountType, heightMm, pitchDeg, coveragePresetId, h/v FOV, locked) and one `entityMappings`. At most one device per room.
- Rooms are created with a single device: `App.tsx:600-627` (`handleCreateRoom`, not wired to UI) and the wizard's `onCreateRoom` at `App.tsx:670-684`, both via `createRoom(...)` (`api/rooms.ts`).
- Device mappings are per `deviceId` (`contexts/DeviceMappingsContext.tsx`, `useDeviceMapping(room.deviceId)`). Live state: one WebSocket subscription per selected room's device (`App.tsx:183-547`, `{type:'subscribe', deviceId, profileId}`).
- Profile per room: `App.tsx:115-122` holds `selectedRoomId`/`selectedProfileId`; pages re-derive `room.profileId ?? selectedProfileId` (`ZoneEditorPage.tsx:156-159`).
- Zone Editor availability: `utils/zoneCapabilities.ts:128` (`roomSupportsZoneEditing`), guard `App.tsx:131-140`.
- `SettingsPage.tsx:936-985` shows link as text ("Device linked"/"No device linked"), "🔗 Unlink Device" (`handleUnlinkDevice`, 303). No way to link a second device.
- Every page keeps its own `rooms`, `devices`, `profiles`: `App.tsx:66`, `LiveTrackingPage.tsx:360`, `ZoneEditorPage.tsx:445`, `RoomBuilderPage.tsx:1182`, `SettingsPage.tsx:112`. Selection flows up via `onRoomChange(roomId, profileId)` (`App.tsx:643-646, 762-765, 781-784, 815-818`).

### State flow
`App` passes `initialRoomId`/`initialProfileId` down. Each page keeps its own `selectedRoomId` (`LiveTrackingPage.tsx:89`, `ZoneEditorPage.tsx:93`, `RoomBuilderPage.tsx:159`); `handleRoomSelection` (e.g. `LiveTrackingPage.tsx:810-816`) sets local state and calls `onRoomChange`.

### Room picker (a `<select>` duplicated per canvas page)
Desktop, floating top centre, `hidden ... md:flex`: `LiveTrackingPage.tsx:1576-1592`, `ZoneEditorPage.tsx:1995-2011` (only `zoneCapableRooms`, 271), `RoomBuilderPage.tsx:2660-2675`, `WizardPage.tsx:1592` (read-only label).
```tsx
<div className="absolute top-6 left-1/2 z-40 hidden -translate-x-1/2 ... md:flex">
  <span className="text-slate-400 font-medium">Room:</span>
  <select value={selectedRoomId ?? ''} onChange={(e) => handleRoomSelection(e.target.value || null)}>
    {rooms.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
  </select>
</div>
```
Mobile: same `<select>` as `title` of `CanvasTopBar`: `LiveTrackingPage.tsx:957-968`, `ZoneEditorPage.tsx:1640-1652`, `RoomBuilderPage.tsx:2213-2226`.

### "Menu" button and drawer
Per-page `showNavMenu` (`LiveTrackingPage.tsx:92`, `ZoneEditorPage.tsx:113`, `RoomBuilderPage.tsx:207`). Desktop floating button + dropdown from `md` up, no wider breakpoint: `LiveTrackingPage.tsx:1002-1071`, `ZoneEditorPage.tsx:1676-1737`, `RoomBuilderPage.tsx:2252-2320`.
```tsx
<div className={`absolute top-6 left-6 hidden md:block ${showNavMenu ? 'z-[60]' : 'z-40'}`}>
  <button onClick={() => setShowNavMenu(!showNavMenu)} className="group rounded-xl ...">
    <span className="inline-block transition-transform group-hover:rotate-90">☰</span> Menu
  </button>
  {showNavMenu && (<>
    <div className="fixed inset-0 z-30" onClick={() => setShowNavMenu(false)} />
    <div className="absolute top-14 left-0 z-50 min-w-[200px] ...">
      <button ...>📡 Live Dashboard</button>
      <button ...>➕ Add Device</button>
      <button ...>🏠 Room Builder</button>
      <button ...>⚙️ Settings</button>
```
Mobile: "Menu" in `CanvasTopBar left` opens `CanvasMobileSheet open={activeMobileSheet==='navigation'}`: `LiveTrackingPage.tsx:948-955`/`2680-2734`, `ZoneEditorPage.tsx:1631-1638`/`2687+`, `RoomBuilderPage.tsx:2205-2212`/`~4016`.
Menu items hardcoded in 3 pages × 2 variants (6 copies). App-level navigation is `view` in `App.tsx:45`, no router. `SettingsPage` has "← Back" (`787-793`) and its own tab bar (`SETTINGS_TABS`, 44-53, 799-814).

### A fix touches
`App.tsx` (view switch, selection, per-view props); the three canvas pages' nav + room select blocks (desktop and mobile), `showNavMenu`, `activeMobileSheet==='navigation'`, `handleRoomSelection`; each page's own `fetchRooms`; `CanvasLayout.tsx` (`CanvasTopBar`). Multi-device rooms would also touch `RoomConfig`, `api/rooms.ts`, every `selectedRoom.deviceId` consumer, `SettingsPage` link/unlink and the backend rooms API (out of scope for a UI pass).

## 2. Detection cone cut off at the walls

### Where it is drawn
- `utils/coverage.ts:12-51` `resolveCoverageFov(profile, placement)`; `53-72` `resolveTrackingCoverageFov(profile)` (default preset only).
- Drawn by `components/RoomCanvas.tsx`; `ZoneCanvas` passes props through (`ZoneCanvas.tsx:519-536`: `devicePlacement`, `fieldOfViewDeg`, `maxRangeMeters`, `clipRadarToWalls`, `showRadar`, `heightCoverage`, `deviceInteractive={false}`).
- Two near-identical cone blocks in RoomCanvas: non-interactive `1875-2059` (Zone Editor, Live), interactive `2063-2240+` (Room Builder).

### Clipping (`RoomCanvas.tsx:1898-1972`, repeated `2087-2160`)
```ts
let radarPoints: Point[] = [deviceWorld];
if (clipRadarToWalls && safePoints.length >= 3) {
  for (let i = 0; i <= arcSteps; i++) {
    const rayEnd = { x: deviceWorld.x + Math.cos(angle) * range, ... };
    let clippedPoint = rayEnd;
    for (const wall of walls) { const intersection = lineIntersection(deviceWorld, rayEnd, wallStart, wallEnd); ... }
    radarPoints.push(clippedPoint);
```
- Default on: `hooks/useDisplaySettings.ts:48` `clipRadarToWalls: true` (localStorage key `everything-presence-zone-configurator-display-settings`). Cone itself off by default: `showDeviceRadar: false` (37).
- Height cone always clips when an outline exists regardless of toggle: `RoomCanvas.tsx:737` `clipToWalls: safePoints.length >= 3` → `buildHeightCoveragePolygon` (`172-300+`, branches 233, 285).
- EP1/EPL distance arcs: third copy of the ray loop, `components/EP1DistanceArc.tsx:89-118`, driven from `LiveTrackingPage.tsx:1426-1513`.
- "Clip radar to walls" toggle: `ZoneEditorPage.tsx:2120`, `LiveTrackingPage.tsx:2164`, `2867`, `RoomBuilderPage.tsx:3411`, `WizardPage.tsx` 2539/2849/2867/3851.

### viewBox and transform
- `RoomCanvas.tsx:132-134` `CANVAS_SIZE = 700`, `toCanvas = (v, range) => (v / range) * CANVAS_SIZE`.
- `709-717` `viewSize = CANVAS_SIZE / zoom`, `viewMin = (CANVAS_SIZE - viewSize)/2`, `toCanvasCoord = HALF + toCanvas(p - panOffsetMm, rangeMm)`.
- `1234-1281` `<svg width="100%" height={height} viewBox={`${viewMin} ${viewMin} ${viewSize} ${viewSize}`}>`; background rect 0..700; grid extends (`lineExtend`, 1287-1294).
- `rangeMm` constant 15000 (`LiveTrackingPage.tsx:95`, `ZoneEditorPage.tsx:97`; setter never called).
- Auto-zoom fits room outline bbox + 500 mm, not the cone (`ZoneEditorPage.tsx:1421-1463`, `LiveTrackingPage.tsx:~790-808`).
- Rotation inconsistent: cone uses only `devicePlacement.rotationDeg` (`RoomCanvas.tsx:1878`, `+90`); zones and targets use `rotationDeg + installationAngle` (`ZoneCanvas.tsx:164-165`, `LiveTrackingPage.tsx:217`, `App.tsx:558`). `EP1DistanceArc.tsx:72` ignores installation angle.
- Zone Editor cone uses tracking FOV/range (`ZoneEditorPage.tsx:1840-1841`); Live uses placement-aware `coverageFov` (`LiveTrackingPage.tsx:1147-1148`).

### A fix touches
`RoomCanvas.tsx` both cone blocks, `getHeightCoveragePathData`/`buildHeightCoveragePolygon` (forced clip 737), viewBox math; `EP1DistanceArc.tsx`; `useDisplaySettings.ts` default; `handleAutoZoom` copies; `ZoneCanvas.tsx` pass-through; `utils/coverage.ts`.

## 3. Drawing zones

### Rectangle mode
- Zones are fixed slots: `ZoneEditorPage.tsx:276-322` (`allPossibleZones`) makes `Zone N`/`Exclusion N`/`Entry N` placeholders 1000×1000 `enabled:false` from `resolveZoneLimits(profile)`; `displayZones` (325-341), `enabledZones` (344-346).
- "+ Zone" → `enableZoneSlot` (1115-1140) drops next free 1000×1000 at outline centroid; "Delete" → `disableZoneSlot` (1142-1148). Edits via `handleZonesChange` (740-755); persisted only by `handleSaveZones` (1246+).
- Canvas (`ZoneCanvas.tsx:657-793`): drag body sets `draggingId`; 8 resize handles when selected (696-705), fixed `r={11}` not zoom-scaled (RoomCanvas uses `clampHandleSize`, `703-708`). Move/resize in `onCanvasMove` (328-402), 100 mm min, snapping 368-374/393-397.
- `components/ZoneEditor.tsx` (108 lines) numeric X/Y/W/H form used only by `WizardPage.tsx:3105`.

### Polygon mode
- `polygonModeStatus.enabled` (`ZoneEditorPage.tsx:115-119`); toggle button 2022-2053 → confirm modal `showModeChangeConfirm` (1560-1619) → `handleTogglePolygonMode` (1150-1196) writes mode to the device via `setPolygonMode(...)`, refetches polygons.
- "+ Zone/Exclusion/Entry" (2290-2345) insert a hardcoded triangle; no click-to-draw:
```ts
vertices: [{ x: 0, y: 1000 }, { x: 1000, y: 1000 }, { x: 500, y: 0 }],
```
- Add vertex: click midpoint circle (`ZoneCanvas.tsx:954-999`, r=8, selected only). Drag vertex: `startPolygonVertexDrag` (593-609) then `applyPolygonPointerDrag` (211-258) or duplicate path in `onCanvasMove` (404-450). Handles selected-only (907-934, r=11/13). Move polygon: `startPolygonDrag` (571-592), centroid-based, delta snaps (260-307, dup 452-506).
- Delete vertex: SVG ✕ badge (1002-1039), panel "Delete node" (`ZoneEditorPage.tsx:2469-2495`), Delete/Backspace (856-883) → `deletePolygonVertex` (817-832), `MIN_POLYGON_VERTICES` in `utils/polygonVertices.ts`. Selection `selectedVertex` (95), `handleVertexSelect` (807-815).
- Ceiling-slice mode (`isCeilingSliceMode`, 184): vertex editing disabled, one-axis drags (`polygonLateralOnlyAxis`).
- One shape type at a time: `ZoneCanvas.tsx:1058-1059`.

### Snap grid
`snapGridMm` (`ZoneEditorPage.tsx:102`, default 100). Desktop panel 2147-2169 (`[0,50,100,200]`, "Off"/"Nmm", cursor readout). Mobile "Zoom & Snap" sheet ~2740-2805. Snapping `Math.round(v/step)*step` in ZoneCanvas 227-231, 273-277, 368-374, 393-397, 417-421, 469-473; snaps device-frame coordinates, not room coordinates.

### Toggles
`ZoneEditorPage.tsx:2015-2020` `{showZoneList ? '✕ Hide' : '☰ Show'} Zone Slots (x/y)`; `2044-2048` `'⬡ Polygon Mode' | '▢ Rectangle Mode'` + `' ⚠️'`. Zone list panel `showZoneList` 2171-2650: right drawer `md:w-96` on desktop, bottom sheet on mobile, covers the canvas.

### Glyph/emoji buttons (no icon library; deps are react + react-dom only)
- ZoneEditorPage: 1574 ⚠️, 1672 ←, 1682 ☰, 1703 📡, 1712 ➕, 1721 🏠, 1730 ⚙️, 1766 📂, 2019 ✕/☰, 2046 ⬡/▢, 2047 ⚠️, 2099 🎨, 2177 ⬡, 2183 ✕, 2499 →, literal "+" at 2307/2325/2343/2285/2523/2537/2551.
- ZoneCanvas: vertex-delete ✕ is an SVG path (1029-1036).
- LiveTrackingPage (24 lines): 924 ⚠, 998 ←, 1008 ☰, 1029 ➕, 1046 📐, 1055 🏠, 1064 ⚙️, 1078 📡, 1089 📂, 1638 ⬡/▢, 1794 −/+, 1893 ●/○, 2230 ↻, 2369 💡, 2374 ✕, 2412/2421/2430 →, 2489 "+", 2495 "−", 2528 🎨, 2536 🔧, 2546 📜, 2562 💡, 2603 ●.
- RoomBuilderPage 34 lines (2257 ☰, 2280 📡, 2289 ➕, 2305 📐, 2314 ⚙️, 2235 "Save •"); WizardPage 65; SettingsPage 12 (826 ✓, 854 💾, 861 📤, 947 ✓, 951 ⚠, 974 🔄, 984 🔗, 992 📥, 792 ←); DoorEditor 4.

### State as text instead of icon/badge
- ZoneEditorPage: 2019 `(x/y)`; 2056 "Polygon mode active"; 2188-2190 "N of M slots configured"; add buttons `(n/max)`; 2385-2394 & 2590-2599 chips "Disabled"/"Unavailable"; 2399 "N vertices"; 2473-2474 "Node X of Y selected"; 1543/1552/1613/1660/1749 "Recovering..."/"Restoring..."/"Switching..."/"Saving"; 2663 mobile badge `'Slices'|'Poly'|'Rect'`.
- LiveTrackingPage: 1638 "⬡ Polygon / ▢ Rectangle"; 1046 "(Not Available)"; 1655-1657 "Active (Ns)"/"Inactive"; 2816 "Occupied"/"Clear"; 2835 "Active"/"Inactive"; 986 "Status".
- DeviceSettingsModal: 259-273 "Disabled"/"Unavailable"/"Hidden"; 337-349 "Value unavailable" etc.
- SettingsPage: 937 "Device linked"/"No device linked"; 947 "✓ Entities synced"; 951 "⚠ Entities not synced"; 962-966 "Default Room"/"Setting...".

### A fix touches
`ZoneEditorPage.tsx` 1115-1196, 1490-1506, 2013-2169, 2171-2683; `ZoneCanvas.tsx` 211-516 (duplicated drag paths), 657-1042; `RoomCanvas` `renderOverlay` contract (1864-1874); `utils/polygonVertices.ts`; `ZoneEditor.tsx`/`WizardPage.tsx:3105` if the wizard changes; the glyph and text spots above.

## 4. Settings not previewed live

### DeviceSettingsModal (`components/DeviceSettingsModal.tsx`, 442 lines)
- Opened only from LiveTrackingPage: `showDeviceSettings` (104), desktop "🔧 Device" (2531-2537), mobile "Device" (2665-2668), mount 2943-2952. Not from Zone Editor or Room Builder.
- Full-screen modal, `bg-black/60 backdrop-blur-sm` (375), hides the canvas.
- Controls write straight to HA on blur/Enter/click; no draft, no Save. Footer "Changes apply immediately" (435-437). `updateSetting` (202-238) POSTs `api/live/${deviceId}/entity`.
- `NumberInput` (26-74) local string, `onSave` on blur/Enter only.
- `liveState` prop accepted (12/80) but never read; values fetched per entity (`api/live/ha/states/...`, 95-200).

### Canvas-affecting settings
| Setting | Canvas consumer | Value source | Updates before save? |
|---|---|---|---|
| Installation angle | `App.tsx:550-573` `deviceToRoom`; `ZoneCanvas.tsx:164-209`; `LiveTrackingPage.tsx:182-227, 1517-1567`; `ZoneEditorPage.tsx:262-263` | `liveState.config.installationAngle` from WS `state_update` (`App.tsx:379-382`) | No. Cone ignores it (`RoomCanvas.tsx:1878`). |
| Max distance | `LiveTrackingPage.tsx:1419` (EP1 arc), `1484-1513` (EPL arc) | `liveState.config.distanceMax` (`App.tsx:375-378`) | No. Not in Zone Editor; its cone range is the profile preset. |
| Upside-down | `liveState.config.upsideDownMounting` (`App.tsx:383-386`) | WS | No canvas effect (firmware normalises; `App.tsx:562-564`). |
| Trigger distance (EP1) | `LiveTrackingPage.tsx:1443-1458` | WS | No. |
| Rotation, mount, height, pitch, preset, FOV (room geometry) | RoomCanvas cone | `RoomBuilderPage.tsx:428-436` `updateDevicePlacement` → `commitRoom`; controls 3153-3351 | Yes, live in Room Builder; saved by `handleSaveRoom` (1832). |
| Installation-angle suggestion | `RoomBuilderPage.tsx:524-560` | POSTs to HA | No preview. |

### SettingsPage (1514 lines)
No canvas, no sensor settings. Tabs `rooms | backups | assets | firmware | troubleshooting` (44-53): rename, default room, re-sync, unlink, export, delete; zone backups; custom floors/furniture; `FirmwareUpdateSection`; `TroubleshootingCard`.

### A fix touches
`DeviceSettingsModal.tsx`; `LiveTrackingPage.tsx` (mount, 182-185, 1419/1484); `App.tsx` liveState reducer (375-386); `ZoneCanvas`/`RoomCanvas` rotation inputs; `ZoneEditorPage.tsx:262`, `RoomBuilderPage.tsx:471`.

## 5. Shells, primitives, theme, mobile

### `components/CanvasLayout.tsx` (222)
- `CanvasPageShell` (12-16) unused; pages write their own `fixed inset-0 bg-slate-950` (`ZoneEditorPage.tsx:1509`).
- `CanvasTopBar` (26-46) used only inside `md:hidden`.
- `CanvasBottomToolbar` (53-66) `role="toolbar"`.
- `CanvasToolbarButton` (78-109) `label`, optional glyph `icon`, `badge`; no call site passes `icon`.
- `CanvasMobileSheet` (121-206) `md:hidden`, Escape, focus Close, `max-h-[82dvh]`.
- `CanvasFloatingPanel` (213-222) unused; desktop panels repeat `rounded-xl border border-slate-700/50 bg-slate-900/90 backdrop-blur ... shadow-xl` inline.

### Mobile
`hooks/useMediaQuery.ts:31` `useIsMobileCanvas` = `(max-width: 767px)`. Desktop/mobile are two JSX sets switched by `hidden md:flex`/`md:hidden`; only `md`, nothing at `lg`/`xl`. Sheet state per page: `LiveTrackingPage.tsx:69`, `ZoneEditorPage.tsx:78`. Zone Editor zone list/display panels are custom divs (`ZoneEditorPage.tsx:2104-2105`, `2172-2173`).

### Primitives
`LabeledControl.tsx` (22) unused. `HelpTooltip.tsx` (83) portal tooltip, widely used. `DisplaySettingsControls.tsx` (110), `DisplayAppearanceControls.tsx` (108), `ThemeSwitcher.tsx` (65). `.glass-card` (`index.css:133-149`) only via `Card` in `App.tsx:20-25`, never rendered.

### Theme
`tailwind.config.cjs`: `midnight.{900,800,700}`, `aqua.{500,600,700}`, fonts `display`/`body`. Code uses `aqua-100` (60×), `aqua-200`, `aqua-300` (4), `aqua-400` (42), none defined (no CSS emitted; `index.css:263` hand-adds `.light .text-aqua-100`). CSS vars in `index.css:6-38` unused by components. Light mode = `!important` overrides under `.light` (`index.css:151-603`). SVG colours hardcoded: `RoomCanvas.tsx:659-664` `canvasColors`, `ZoneCanvas.tsx:684-692, 816-825`, `RoomCanvas.tsx:2000-2013`, page `targetColors`.

### Page sizes
| Page | Lines |
|---|---|
| RoomBuilderPage.tsx | 4344 |
| WizardPage.tsx | 4311 |
| LiveTrackingPage.tsx | 2965 |
| ZoneEditorPage.tsx | 2805 |
| SettingsPage.tsx | 1514 |

Other large: `FirmwareUpdateSection.tsx` 3058, `RoomCanvas.tsx` 2474, `ZoneCanvas.tsx` 1065, `EntityDiscovery.tsx` 853, `DeviceLogsModal.tsx` 566, `DeviceSettingsModal.tsx` 442, `App.tsx` 842, `index.css` 603.
