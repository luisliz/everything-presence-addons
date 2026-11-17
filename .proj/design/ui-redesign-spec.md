# Zone Configurator UI redesign spec

Date: 2026-11-16. Status: proposal, awaiting owner decisions in §0.
Root for code paths: `everything-presence-mmwave-configurator/frontend/src`. Line numbers are from the current tree.
Inputs: before shots (`dev/.shots/before*`), `.proj/reports/ui-complaint-map.md` (cited as **map §n**), `.proj/design/panel-mock-v2.html` (cited as **mock**), `review-round-1.md`, `review-round-2.md`.

Conventions found in the product and kept:
- One device per room (`RoomConfig.deviceId`, `api/types.ts:306-322`).
- Three save models: zones are written to the device on Save (`ZoneEditorPage.tsx:1246`), the layout is saved as room config on Save (`RoomBuilderPage.tsx:1832`), and device settings are written per entity immediately (`DeviceSettingsModal.tsx:202-238`). This spec keeps all three and gives them one visual pattern (`ApplyBar`, §5).
- `HelpTooltip` (`components/HelpTooltip.tsx`) with `utils/tooltipPosition.ts` is the tooltip engine. It stays.
- `CanvasMobileSheet` (`components/CanvasLayout.tsx:121-206`) already does Escape, focus and `max-h-[82dvh]`. It becomes the base of `Sheet`.
- Class-based theme (`.light` / `.dark` on `<html>`, `contexts/ThemeContext.tsx`, `tailwind.config.cjs` `darkMode: 'class'`).

Patterns taken from the approved mock: list then room screen, selection-driven inspector (360 px right column, bottom sheet on phone), check icon inside the pressed segment (`.seg .ck`), `lrow` list rows with `aria-pressed` and check, status pill (`.state.on/.clear/.warn`), status strip for multi-step flows (`.strip`), 44 px targets on coarse pointers, "All changes saved" indicator in the toolbar.

---

## 0. Decisions the owner rules on before step 1

| # | Decision | Recommendation | Why it is not obvious |
|---|---|---|---|
| D1 | Lift `rooms`, `devices`, `profiles` into one `AppDataProvider` and drop the per-page fetches (`LiveTrackingPage.tsx:86-88`, `ZoneEditorPage.tsx:90-92`, `RoomBuilderPage.tsx:1182`, `SettingsPage.tsx:112`). | Yes. The room switcher in the shell needs the room list without a page mounted. | Structural; touches every page's load effect. |
| D2 | Three room routes (`live`, `zones`, `build`) on one room screen, versus the mock's single Edit mode holding zone and outline tools together. | Three routes now. The save models differ (device write vs room config). Merging into one Edit mode stays possible after step 3. | The mock merged them; the hash scheme in the brief separates them. |
| D3 | Flip `clipRadarToWalls` default to `false` (`hooks/useDisplaySettings.ts:48`) and `showDeviceRadar` to `true` (`:37`), plus a one-time migration of stored settings (add `version: 2` to the stored object; on load, if version < 2, set both to the new defaults). | Yes. Without the migration every existing user keeps the clipped cone. | Overwrites a stored user preference once. |
| D4 | Snap in room coordinates instead of device-frame coordinates (`ZoneCanvas.tsx:227-231` and five more sites, map §3). | Yes. A rotated device currently snaps to a grid the user cannot see. | Zone coordinates stored on the device stop being round numbers when the device is rotated. |
| D5 | Undo/redo in Zones mode, using a zones snapshot with the same functions as `utils/roomHistory.ts` (`pushRoomHistory`, `undoRoomHistory`, generic over the snapshot type). | Yes. Click-to-place drawing without undo is hostile. | New capability; `RoomSnapshot` (`roomHistory.ts:17-20`) excludes zones today. |
| D6 | Settings becomes one scrolling page with a section rail; the Rooms tab moves to the Rooms screen. | Yes. | Removes `SETTINGS_TABS` (`SettingsPage.tsx:44-53`). |
| D7 | Draw the Pro static-presence ranges (`staticPresenceMinRange`, `MaxRange`, `TriggerRange`) as rings on the canvas while the Sensor section is open. | Yes, as the Pro equivalent of the EP1 arcs. | New canvas layer; data is already in the device settings. |

---

## 1. Information architecture

### 1.1 Screens

Four screens replace five pages and five settings tabs.

| Screen | Route | Replaces |
|---|---|---|
| Rooms | `#/rooms` | Settings > Rooms tab (`SettingsPage.tsx:841-1010`), the room `<select>` on three pages, "Backup All / Import" header |
| Room | `#/room/<id>/live`, `#/room/<id>/zones`, `#/room/<id>/build` | `LiveTrackingPage`, `ZoneEditorPage`, `RoomBuilderPage`, `DeviceSettingsModal` |
| Settings | `#/settings/<section>` with `section` in `appearance, backups, assets, firmware, troubleshooting` | `SettingsPage` tabs |
| Setup | `#/wizard` | `WizardPage` (step stays in backend settings, `App.tsx:71-77`) |

The room screen keeps one canvas instance across the three modes, so zoom, pan and selection survive a mode switch. Mode is a `Segmented` in the room header, not a page change.

### 1.2 Persistent navigation

Breakpoints are Tailwind defaults. `useIsMobileCanvas` (`hooks/useMediaQuery.ts:31`, max-width 767) stays for canvas gestures only; layout switching moves to CSS.

```
>= lg (1024+)                         md (768-1023)               < md (phone)
+--------+--------------------------+ +--+-----------------------+ +-------------------------+
|Sidebar |  Screen                  | |R |  Screen               | | Top bar 56              |
| 240px  |                          | |a |                       | +-------------------------+
|        |                          | |i |                       | |  Screen                 |
|        |                          | |l |                       | |                         |
|        |                          | |64|                       | +-------------------------+
+--------+--------------------------+ +--+-----------------------+ | Bottom bar 56 + safe    |
                                                                   +-------------------------+
```

`AppShell` (new, `components/shell/AppShell.tsx`):

- `>= lg`: `Sidebar` 240 px, `fixed inset-y-0 left-0 w-60 border-r border-line bg-surface`.
  - Header: product name "Zone Configurator", version in `text-fg-subtle text-xs` (moves from `SettingsPage.tsx:1508`).
  - "Rooms" group: one `NavRoomItem` per room, sorted by name, default room first. Row: `StatusDot` (online / offline / no device), room name, model `Badge` ("Pro", "Lite", "One", from `profile.label`), `mdiStar` 14 px if default. Active row: `bg-accent-tint` plus `mdiCheck` at the right edge. Clicking keeps the current mode (`live` -> `live`), falling back to `live` when the target room cannot do the mode (One has no zones).
  - "All rooms" link (`mdiViewGridOutline`) to `#/rooms`.
  - "Add device" (`mdiPlus`) to `#/wizard`.
  - Footer: "Settings" (`mdiCog`), then a 3-icon theme `Segmented` (`mdiWhiteBalanceSunny`, `mdiWeatherNight`, `mdiThemeLightDark`), icon-only with tooltips "Light", "Dark", "Match Home Assistant".
- `md`: `Rail` 64 px. Same items, icon-only. Rooms collapse to one `IconButton` (`mdiHomeOutline`, tooltip "Rooms") that opens `RoomSwitcher` as a popover anchored to the rail. Settings and Add device as icon buttons with tooltips.
- `< md`: `TopBar` + `BottomBar`.
  - `TopBar` 56 px: left `IconButton mdiArrowLeft` "All rooms" when on a room, else app name. Centre: `RoomSwitcherButton` (room name + `mdiChevronDown`) that opens `RoomSwitcher` as a bottom `Sheet`. Right: room status pill (Occupied / Clear / Offline).
  - `BottomBar` 56 px + `pb-[env(safe-area-inset-bottom)]`, `role="navigation"`: Live (`mdiAccessPoint`), Zones (`mdiVectorPolygon`), Layout (`mdiFloorPlan`), Settings (`mdiCog`). Labels under icons, 11 px. Active item: `text-accent-ink` and a 3 px top indicator bar. Zones is `aria-disabled` with toast "The Everything Presence One reports distance only, so it has no zones" for One rooms.

Removed: the floating "Menu" button and dropdown on three pages × two variants (map §1, `LiveTrackingPage.tsx:1002-1071`, `ZoneEditorPage.tsx:1676-1737`, `RoomBuilderPage.tsx:2252-2320`, mobile sheets `2680-2734`, `2687+`, `~4016`), `showNavMenu` state, `activeMobileSheet === 'navigation'`, and the floating room `<select>` (`LiveTrackingPage.tsx:1576-1592`, `ZoneEditorPage.tsx:1995-2011`, `RoomBuilderPage.tsx:2660-2675`, mobile `957-968`, `1640-1652`, `2213-2226`).

### 1.3 Where the room switcher lives

- `>= lg`: the sidebar list is the switcher. No dropdown anywhere.
- `md`: rail popover.
- Phone: `TopBar` title button opens `RoomSwitcher` sheet: same `NavRoomItem` rows (56 px tall), "All rooms" and "Add device" at the bottom.
- Zones mode lists every room; rooms that cannot do zones show the row with `aria-disabled` and the One note, instead of being filtered out as `zoneCapableRooms` does today (`ZoneEditorPage.tsx:271`).

### 1.4 Hash router

New `src/router.ts`, no dependency, about 60 lines.

```ts
export type Route =
  | { name: 'rooms' }
  | { name: 'room'; roomId: string; mode: 'live' | 'zones' | 'build' }
  | { name: 'settings'; section: SettingsSection }
  | { name: 'wizard' };

export function parseHash(hash: string): Route;           // unknown -> { name: 'rooms' }
export function toHash(route: Route): string;
export function useRoute(): [Route, (next: Route, opts?: { replace?: boolean }) => void];
export function useLeaveGuard(dirty: boolean, message: string): void;
```

Rules:
- `#/` and empty hash: `replace` to `#/room/<defaultRoomId>/live` if a default exists (`App.tsx:79-90`), else first room, else `#/rooms`. First run with no rooms and `wizardCompleted === false` replaces to `#/wizard` (`App.tsx:93-96`).
- `#/settings/rooms` replaces to `#/rooms` (old bookmarks).
- `#/room/<id>/zones` for a room where `roomSupportsZoneEditing` (`utils/zoneCapabilities.ts:102`) is false replaces to `/live` and shows a toast. This replaces the view guard at `App.tsx:136-140`.
- Unknown room id: `#/rooms` with toast "That room no longer exists".
- `useLeaveGuard`: `navigate()` checks registered guards and shows `ConfirmDialog` ("Discard", "Save and leave", "Stay"). For browser back, the `hashchange` handler restores the previous hash with `history.replaceState`, then shows the same dialog. Zones and Layout register guards when their draft is dirty; the Sensor section registers one when its draft is dirty. This replaces the Room Builder unsaved prompt (`RoomBuilderPage.tsx:2100-2138`).
- `recordNavigation(view)` (`App.tsx:54-56`) receives `toHash(route)`.
- Selection is not in the URL.

`App.tsx` `view` state (`:45`) and the `onNavigate` / `onRoomChange` props on every page go away. Pages read `roomId` from the route.

---

## 2. Screens

Global surface classes (tokens in §5.2):
- App background: `bg-canvas-bg` behind the room screen, `bg-bg` elsewhere.
- Panel: `rounded-xl border border-line bg-surface`.
- Inspector column: `w-[360px] shrink-0 border-l border-line bg-surface overflow-y-auto` (md: `w-80`).
- Toolbar: `h-12 flex items-center gap-1 px-2 border-b border-line bg-surface`.
- Section heading inside inspector: `text-xs font-semibold uppercase tracking-wide text-fg-subtle`.

### 2.1 Rooms (`#/rooms`)

Job: see every room with its device and state, and manage rooms.

```
Desktop                                                      Phone
+--------+------------------------------------------------+  +-------------------------+
|Sidebar | Rooms                 [Backup all v] [+ Add device]| Rooms              [ : ]|
|        | 3 rooms, 3 devices                              |  +-------------------------+
|        | +--------------------+ +--------------------+   |  |[thumb] Office   Clear   |
|        | |[thumb] Office  (*) | |[thumb] Living  ... |   |  |  Lite Office ep1  *     |
|        | |  Occupied 1        | |  Clear for 4 min   |   |  |[thumb] Living  Occupied |
|        | |  [Lite] Office ep1 | |  [Pro] Pro 225500  |   |  | ...                     |
|        | |  2 zones  [:]      | |  4 zones   [:]     |   |  | (i) 2 devices not in a  |
|        | +--------------------+ +--------------------+   |  |     room   [Set up]     |
|        | (i) 2 devices are not in a room. [Set up]       |  +-------------------------+
+--------+------------------------------------------------+  | Live Zones Layout Set.  |
```

- Grid: `grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]` (mock `.grid-rooms`); phone one column.
- `RoomCard` (mock `.room`): 96 px thumbnail (room outline + zones from `roomShell.points` and `zones`, rendered by a small `RoomThumbnail` SVG, no RoomCanvas), name `text-base font-medium`, status pill, device chip (`StatusDot` + model `Badge` + device name), meta "N zones" or "Presence only" for One. Whole card is a link to `#/room/<id>/live`. Default room shows `mdiStar` filled, `text-warning`, tooltip "Default room".
- Card overflow `IconButton mdiDotsVertical` "Room actions" opens `Menu`:

| Item | Icon | Action today |
|---|---|---|
| Rename | `mdiPencilOutline` | inline edit on card name (today pencil at `SettingsPage.tsx` rooms list) |
| Set as default / Clear default | `mdiStarOutline` / `mdiStarOffOutline` | `Set Default` / `Clear Default` (`SettingsPage.tsx` 869, 963) |
| Re-sync entities | `mdiSync` | opens `EntityDiscovery` in a `Sheet` (`SettingsPage.tsx:1494-1505`) |
| Unlink device | `mdiLinkOff` | `handleUnlinkDevice` (`SettingsPage.tsx:303`), `ConfirmDialog` |
| Export | `mdiExport` | export JSON |
| Delete | `mdiDeleteOutline`, `text-danger-ink` | `ConfirmDialog` with red primary |

- Header: title "Rooms", sub-line counts. Primary `Button` "Add device" (`mdiPlus`) to `#/wizard`. Secondary `Button` "Backup all" (`mdiContentSaveOutline`) with an attached `IconButton mdiChevronDown` menu holding "Import rooms" (`mdiImport`).
- Unassigned devices row (mock `.unassigned`): devices from `fetchDevices` with no room. "Set up" opens `#/wizard` with that device preselected (`onSelectionChange`, `App.tsx:719-723`).
- States: loading (6 skeleton cards, same height), empty ("No rooms yet", explanation, primary "Add device", list of discovered devices; mock `.empty`), error (`Note tone=danger` with Retry), device offline (card thumbnail `grayscale opacity-50`, pill "Offline" with `mdiWifiOff`), room without device (chip "No device" `tone=neutral`, menu adds "Link a device" which opens the wizard at roomChoice with this room).

### 2.2 Room screen frame (shared by all three modes)

```
>= lg
+--------+----------------------------------------------------------------------+
|Sidebar | RoomHeader: Office [Lite] (o) Online  [Live|Zones|Layout]   status  [:]|
|        +-------------------------------------------------+--------------------+
|        | ModeToolbar (mode-specific)          saved/Save |                    |
|        +-------------------------------------------------+   Inspector 360    |
|        |                                                 |   (selection-      |
|        |                 RoomCanvas                      |    driven)         |
|        |  [preview chip]                                 |                    |
|        |                                     [+][-][fit] |                    |
|        |  legend / cursor readout (fine pointer only)    |                    |
+--------+-------------------------------------------------+--------------------+

< md
+-------------------------+
| TopBar  < Office v  (o) |
+-------------------------+
| ModeToolbar (scroll-x)  |   44 px icon buttons, one row
+-------------------------+
|                         |
|      RoomCanvas         |   min-h-[50dvh], pinch zoom, 2-finger pan
|                  [fit]  |
+-------------------------+
| Inspector sheet (peek)  |   88 px peek: selection title + primary action
+-------------------------+
| Live Zones Layout Set.  |
+-------------------------+
```

Components:
- `RoomScreen` (new, `pages/RoomScreen.tsx`): owns `roomId`, `mode`, viewport (`zoom`, `panOffsetMm`), `selection`, `sensorDraft`. Mounts one `RoomCanvas` / `ZoneCanvas` and swaps toolbars and inspector bodies by mode. Mode bodies live in `pages/room/LiveMode.tsx`, `ZonesMode.tsx`, `LayoutMode.tsx`, extracted from the current pages.
- `RoomHeader`: `h-14 flex items-center gap-3 px-4 border-b border-line bg-surface`. Room name `text-lg font-medium` (truncate), model `Badge`, `StatusDot` + "Online" / "Offline" / "No device" in `text-sm text-fg-muted`, mode `Segmented` (`Live` `mdiAccessPoint`, `Zones` `mdiVectorPolygon`, `Layout` `mdiFloorPlan`; check icon in pressed segment; Zones disabled with tooltip for One rooms), presence pill at the right (Occupied N / Clear for N min / Offline), room overflow `Menu` (same items as the Rooms card menu). Phone: header hidden, mode moves to `BottomBar`.
- Canvas overlays, absolutely positioned inside the canvas container, never over the inspector:
  - Top-left: `PreviewChip` when `sensorDraft` is non-empty (§4), or the entity-sync warning (§2.3).
  - Bottom-right: `ZoomCluster` vertical `IconButton` stack: `mdiPlus` "Zoom in (+)", `mdiMinus` "Zoom out (-)", `mdiFitToScreenOutline` "Fit room and coverage (F)". "Reset" (`LiveTrackingPage.tsx:2504-2512`) is dropped: Fit replaces it. Phone shows only Fit.
  - Bottom-left: legend (targets, zone kinds) and, on `(pointer: fine)`, cursor readout `X 1.20 m, Y 3.40 m` in `text-xs tabular-nums text-fg-muted` (replaces "Cursor: X --m, Y --m" panels).
- Inspector: `Inspector` component, `aria-label="Inspector"`. Header row `h-12` with back `IconButton mdiArrowLeft` "Back to room" when something is selected, a colour swatch or icon for the selection, title, overflow menu. Body is a stack of `Panel` sections. Selection rules:
  - Click on empty canvas: clear selection, inspector shows the mode's room panel.
  - Click on an object: select it, inspector shows that object's panel. On phone the sheet rises to `half` if it was at `peek`.
  - Esc: clear selection (or cancel the active drawing first).
  - Selection highlight on canvas: 2 px `stroke-accent` outline plus handles; selected list row in inspector `aria-pressed="true"` with `mdiCheck`.
- Phone sheet: `Sheet variant="docked"` with snap points `peek` 88 px, `half` 50dvh, `full` 92dvh; drag handle (mock `.insp .handle`); canvas keeps at least 50dvh (review round 2 N2). Peek row shows selection title and the mode's primary action (Save zones / Save layout / Apply).

States for the frame:
- Loading room: canvas skeleton (grid only) and inspector skeleton rows. No layout shift.
- Room has no outline: canvas shows device and coverage only, plus centred `EmptyHint` "No walls yet" with `Button` "Draw walls" (goes to `/build` with Wall tool active).
- Room has no device: Live inspector shows `Note` "No device linked" with "Link a device" (wizard).
- Device offline / no WS state for 10 s: presence pill "Offline" (`tone=warning`, `mdiWifiOff`), targets hidden, canvas `opacity-60`, Sensor section read-only with note.
- Error toasts: one `Toast` region, bottom-centre desktop, below `TopBar` on phone (mock `.toast`). Replaces the three absolute error banners (`LiveTrackingPage.tsx:911-916`, `ZoneEditorPage.tsx:1510-1520`, `RoomBuilderPage.tsx:2007`).

### 2.3 Live mode (`#/room/<id>/live`)

Job: see who is where now and tune the sensor while watching.

Toolbar (left to right):

| Control | Form | Replaces |
|---|---|---|
| Record path | `IconButton` `mdiRecordCircleOutline`, pressed state `mdiStopCircleOutline` + `text-danger` + `animate-pulse` dot; badge = recorded point count | "Record Path" / "Stop Recording" panel (`LiveTrackingPage.tsx:2568-2608`) |
| Clear recorded path | `IconButton mdiEraser` "Clear path", only when points > 0 | "Clear" button |
| Trails | `IconButton mdiMapMarkerPath`, toggle (`aria-pressed`) | "Movement trails" checkbox in Display panel |
| Heatmap | `IconButton mdiFire`, toggle | heatmap checkbox (`2189+`) |
| separator | | |
| Layers | `IconButton mdiLayersOutline` opens `Popover` with `DisplayLayers` (§2.3.4) | "🎨 Display" (`2528`) |
| Device logs | `IconButton mdiTextBoxSearchOutline` "Device logs" | "📜 Logs" (`2546`) |
| spacer | | |
| Polygon/rect status | removed from toolbar; shown in Zones mode only | "⬡ Polygon / ▢ Rectangle" (`1638`) |

Inspector, nothing selected (`LiveRoomPanel`), sections top to bottom:
1. **Status** (always open). Big presence row (mock `.vstate`): dot + "Occupied" / "Clear for 4 min" `text-2xl font-medium`. Below, rows: Targets count, Assumed present (`Badge tone=accent` "Assumed present, 12 min left" or nothing), PIR / static presence for Pro. Zone tiles (mock `.ztile`): one per enabled zone, colour stripe, name, state "Occupied" with `tone=accent` and `mdiAccount` count, or "Clear". Click a tile selects the zone.
   - EP1 rooms: Status body is `EP1Dashboard` sections in this order: sensor comparison (`ep1/EP1SensorComparisonPanel`), mini charts, environmental (`EP1EnvironmentalPanel`, CO2 panel when present), activity log, stats. Same components, restyled to `Panel`.
   - Entity mappings missing (`LiveTrackingPage.tsx:918-935`): `Note tone=warning` at the top "Entity mappings are not set up" with `Button size=sm` "Re-sync" that opens `EntityDiscovery` in a `Sheet` here, with no navigation away.
2. **Sensor** (§4). Collapsed by default; opens and scrolls into view when the device marker is clicked.
3. **Activity** (collapsed; auto-open when heatmap is on): heatmap period `Segmented` (1 h, 6 h, 24 h, 7 d, values from current `aria-label="Heatmap time period"` select), threshold slider with "More detail / Less noise" end labels, `IconButton mdiRefresh` "Refresh heatmap", `HeatmapLegend`, `ZoneStatsPanel`, `HourlyActivityChart`. Recording summary: "142 points recorded" when points exist.
4. **Suggestions** (EP1 only): replaces the "💡 Tips" popup (`LiveTrackingPage.tsx:2364-2478`). Room metrics and tips as `Note tone=info` rows with `mdiLightbulbOnOutline`.

Inspector, target selected (click a target dot): title "Target 1" with its colour swatch; rows Distance, Speed, Angle (from `targetPositions`, `App.tsx:575-597`), "In zone: Desk" or "Not in a zone". Replaces the "Detailed Tracking" expandable (`LiveTrackingPage.tsx:1787-1946`) and its `−/+` toggle (`1794`).

Inspector, zone selected: zone name, live state, time in state, and that zone's off-delay setting (`zoneNOffDelay`) as a `NumberField` bound to the sensor draft (§4).

Inspector, device marker selected: Sensor section expanded, other sections collapsed.

#### 2.3.4 `DisplayLayers` (one component for all three modes)

Replaces `DisplaySettingsControls` + `DisplayAppearanceControls` + the inline checkbox list (`LiveTrackingPage.tsx:2076-2360`, `ZoneEditorPage.tsx:2103-2145`, `RoomBuilderPage.tsx` settings `570-578`). All values still come from `useDisplaySettings`.

| Group | Control | Form |
|---|---|---|
| Coverage | Show coverage | `Toggle` (`showDeviceRadar`) |
| | Clip to walls | `Toggle` (`clipRadarToWalls`), default off (D3) |
| | Max distance ring | `Toggle` (`showMaxDistanceOverlay`) |
| | Trigger distance ring (EP1) | `Toggle` (`showTriggerDistanceOverlay`) |
| | Aligned direction | `Toggle` (`showAlignedDirection`) |
| Room | Walls, Doors, Furniture, Zones, Zone labels, Targets, Device marker | one `Toggle` each |
| Appearance | Device marker style | `Segmented` Icon / Dot (`deviceMarkerStyle`) |
| | Device marker size, opacity, target size, zone label size | slider rows (mock `.sl-row`) with value output |
| Tracking | Smooth tracking | `Toggle` (`smoothTracking`, today page state) |

Theme is removed from this panel (`LiveTrackingPage.tsx:2355-2357`, `2903`); it lives in the sidebar footer and Settings > Appearance.

### 2.4 Zones mode (`#/room/<id>/zones`)

Job: draw and adjust detection zones, then write them to the device.

Toolbar:

| Control | Form | Replaces |
|---|---|---|
| Tool | `Segmented` icon+label: Select (`mdiCursorDefaultOutline`, V), Polygon (`mdiVectorPolygon`, P, polygon device mode only), Rectangle (`mdiVectorRectangle`, R) | "+ Zone / + Exclusion / + Entry" buttons that drop a 1000×1000 square or hardcoded triangle (`ZoneEditorPage.tsx:1115-1140`, `2290-2345`) |
| Kind (visible while Polygon or Rectangle tool is active) | `Segmented`: Zone, Exclusion, Entry; each segment has a `Badge` with free slots ("3 left"); full kinds disabled with tooltip "All 4 zone slots are used" | `(n/max)` text on add buttons |
| Undo / Redo | `IconButton mdiUndo` / `mdiRedo` (D5) | none |
| Snap | `IconButton mdiMagnet` toggle, tooltip "Snap to 10 cm (Alt to bypass)" | Snap Grid panel (`2147-2169`) |
| Layers | `IconButton mdiLayersOutline` popover | "🎨 Display" (`2099`) |
| spacer | | |
| Save state | `SaveState` (§5): "All changes saved" with `mdiCloudCheckOutline`, or "3 unsaved changes" `text-fg-muted`, then `Button variant=primary` "Save zones" (`mdiContentSaveOutline`), spinner while saving | "Save Zones" / "Saving Zones..." (`1739-1750`) |

Removed: "Show/Hide Zone Slots (x/y)" toggle (`2013-2020`), "Polygon mode active" button (`2022-2060`), the right drawer that covers the canvas (`2171-2650`), "Zone Backups" floating button (`1751-1758`). Their content moves into the inspector.

Inspector, nothing selected (`ZonesRoomPanel`):
1. **Zones** list (mock `.lrow`): one row per enabled zone, grouped Zone / Exclusion / Entry, each with colour swatch, name, kind `Badge`, vertex count in `text-xs text-fg-muted` ("5 points"). Slot counter in section header: `Badge` "4 of 8 used". Empty slot rows are not listed; the Kind segmented carries free counts. Availability per slot (`zoneAvailability`, `polygonAvailability`): unavailable slots show `mdiAlertCircleOutline` with tooltip "Zone 3 entities are missing in Home Assistant" instead of the "Unavailable" / "Disabled" chips (`2385-2394`, `2590-2599`).
2. **Zone shape** (Lite/Pro with `polygonZonesEnabled` mapped): `Segmented` Rectangles (`mdiVectorRectangle`) / Polygons (`mdiVectorPolygon`), check in pressed segment. Changing it opens the existing confirmation (`showModeChangeConfirm`, `1560-1619`) restyled as `ConfirmDialog` with `mdiAlertOutline` in `text-warning-ink`; while writing, the segmented shows a spinner in the target segment and is disabled ("Switching..." text removed).
3. **Recovery** (only when `polygonModeStatus.enabled && polygonZones.length === 0` and a source exists, `1521-1558`): `Note tone=info` with the existing copy and two `Button size=sm`: "Recover room zones", "Restore latest backup". Busy state: spinner inside the button, label unchanged.
4. **Backups**: "Latest backup 14 Nov, 21:04" or "No backups yet". `Button size=sm` "Back up now" (`mdiContentSaveOutline`), `Button size=sm variant=ghost` "All backups" opens `ZoneBackupsSheet` (the Backups list from Settings, filtered to this device: restore, download, delete).
5. **Canvas**: Snap `Segmented` Off / 5 cm / 10 cm / 20 cm (values `[0,50,100,200]` mm from `ZoneEditorPage.tsx:2147-2169`; imperial shows 2 in / 4 in / 8 in), units shown read-only with link to Layout where units are set.
6. **Ceiling-slice note** (Pro on ceiling, `isCeilingSliceMode`, `ZoneEditorPage.tsx:184`): `Note tone=info` "Ceiling mount: zones are distance slices. Drag their edges; corner editing is off." Polygon tool is hidden in this state.

Inspector, zone selected (`ZonePanel`, one template for all kinds, mock "zone selected"):
- Header: swatch, name, kind `Badge`, overflow menu: "Delete zone" (`mdiDeleteOutline`, danger).
- Name `Field` (text, placeholder "e.g. Bed, Desk"); help tooltip text from today's "Friendly name ?" (`2432+`).
- Kind (read-only `Badge`; changing kind = delete and redraw, because slots are typed).
- Geometry:
  - Rectangle: X, Y, Width, Height `NumberField`s in display units (replaces coordinate text `2639+`).
  - Polygon: points table, one row per vertex: index, X, Y `NumberField`s, `IconButton mdiDeleteOutline` "Delete point" disabled at `MIN_POLYGON_VERTICES` (`utils/polygonVertices.ts:11`) with tooltip "A zone needs at least 3 points". Selected vertex row is `aria-pressed` with `mdiCheck`. Replaces "Node X of Y selected" + "Delete node" (`2468-2495`) and the vertex summary text `(-1.8, 0.6) → ... +2 more` (`2496+`).
- Off delay (Lite/Pro zones 1-4): `NumberField` bound to `zoneNOffDelay` via the sensor draft (§4).
- Live: "Occupied" / "Clear" state row while the device streams.

Inspector, drawing in progress: title "New polygon zone" / "New rectangle zone", instructions as a 3-row key list (`Kbd` chips): "Click to add a point", "Enter or click the first point to finish", "Backspace removes the last point, Esc cancels". Point count "3 points" live.

Wizard hook: `onWizardZonesReady` (`App.tsx:746-750`) fires on first successful Save when the route was entered from the wizard.

### 2.5 Layout mode (`#/room/<id>/build`)

Job: shape the room, place doors, furniture and the device, then save.

Toolbar:

| Control | Form | Replaces (`RoomBuilderPage.tsx`) |
|---|---|---|
| Tool | `Segmented`: Select (`mdiCursorDefaultOutline`, V), Walls (`mdiVectorPolyline`, A), Door (`mdiDoor`, D), Furniture (`mdiSofaOutline`, opens `FurnitureLibrary` sheet, then places) | "✏️ Add wall (A)", "🚪 Add Door", "🪑 Add Furniture" (2679-2803) |
| Shapes | `IconButton mdiShapeOutline` "Start from a shape" opens `BasicRoomShapesPicker` in a `Popover` | "▭ Basic Shapes" |
| Finish wall | `Button size=sm` "Finish" (`mdiCheck`), only while drawing walls, Enter | "✓ Finish (Enter)" |
| Undo / Redo | `IconButton mdiUndo` / `mdiRedo` | "↶ Undo" / "↷ Redo" |
| Rotate | `IconButton mdiRotateLeftVariant` "Rotate 90° left (Shift+R)", `mdiRotateRightVariant` "Rotate 90° right (R)", attached `IconButton mdiChevronDown` menu: "Rotate everything" / "Keep sensor fixed" (check on the active scope), "Turn end to end", "Custom angle..." | "↺ 90°", "↻ 90°", "Rotating: Rotate everything · change" text |
| Lock | `IconButton mdiLockOutline` / `mdiLockOpenVariantOutline` menu: Lock walls, Lock device position, Lock all furniture (checks show state) | "Locking" group (Settings panel ~3436-3500) |
| Layers | `IconButton mdiLayersOutline` popover | Display group in Settings panel |
| overflow | `IconButton mdiDotsVertical`: "Clear walls" (`mdiDeleteSweepOutline`, danger, existing confirm 2139-2172 with in-session recovery 2174-2240 kept) | "🗑️ Clear" |
| spacer | | |
| Save state | `SaveState` + `Button primary` "Save layout" | "Save Room" / "Save •" (2235, 2321-2338) |

Zoom controls ("Zoom +", "Zoom -", "Reset", "Auto Zoom", "Settings", right column) become the shared `ZoomCluster`. "Settings" disappears: its content is the room panel below.

Inspector, nothing selected (`LayoutRoomPanel`):
1. **Room**: size readout (bounding width × depth), wall count, lock summary ("Walls locked" `Badge` with `mdiLock`).
2. **Canvas**: Snap `Segmented` Off / 5 / 10 / 20 cm; Wall angle `Segmented` 45° / Free (replaces "Wall Snap Angle: 45 deg / Free"); Units `Segmented` Metric / Imperial. Replaces the bottom-left info bar (`3506+`) and the "Tips:" paragraph (shortcuts move to the `?` shortcuts sheet, §3.4).
3. **Floor**: Fill `Segmented` Overlay / Material, Material picker as a swatch grid (`FloorMaterials`) with check on the active material; "Manage custom materials" link to `#/settings/assets`.
4. **Position on grid**: centre button and the rotation custom angle field, from the Settings panel (`2841+`, "Rotate floor plan", "Position on grid").
5. **Display**: `DisplayLayers`.

Inspector, wall selected (replaces the floating wall editor `~3600-3800`): length `NumberField` (feet/inches pair in imperial), offset, lock `Toggle` "Lock this wall", "Split wall" button, delete point. Locked: `Note` "This wall is locked. Unlock it to move or split it."

Inspector, door selected: `DoorEditor` content restyled: type `Segmented` Hinged / Sliding / Opening (from `DoorStyleIcon`), swing side `Segmented` with door icons, width, position along wall, lock, delete.

Inspector, furniture selected: `FurnitureEditor` content: type, width, depth, rotation, colour swatches with check, lock, delete. "Selected furniture" heading text (`RoomBuilderPage.tsx:4187`) is replaced by the inspector title (item name).

Inspector, device selected (`DevicePanel`), two sections with different save targets, each labelled:
1. **Placement** ("Saved with the layout"): X, Y `NumberField`s; Rotation slider + field; Mount `Segmented` Wall / Ceiling; Height; Pitch; Coverage preset `Select` (`coveragePresetId`) with Custom revealing Horizontal and Vertical FOV; Lock position `Toggle` ("Rotation stays adjustable"). Values update the canvas immediately (today's behaviour, `RoomBuilderPage.tsx:428-436`) and enter undo history.
2. **Sensor** ("Written to the device", §4), including Installation angle with the "Suggest angle" action. The suggestion modal (`2040-2099`) becomes an inline `Note` in this section with the suggested value, a preview on the canvas (draft), and Apply / Dismiss.

### 2.6 Settings (`#/settings/<section>`)

One page, `max-w-3xl mx-auto px-4 py-6`, `>= lg` with a sticky left section rail (`w-48`, inside the content area, not the app sidebar). Each section is a `Panel` with `id`. The route section scrolls into view; scrolling updates the hash with `replace` (IntersectionObserver). Phone: rail becomes a horizontal chip row under the title, sticky.

| Section | Content | Changes |
|---|---|---|
| Appearance | Theme `Segmented` Light / Dark / Match Home Assistant with icons and check; Units default (if kept global, else omitted) | `ThemeSwitcher` emoji options (`ThemeSwitcher.tsx:12-16`) replaced |
| Backups | Device `Select`, device facts (profile, firmware, entity mappings as `Badge`s), "Back up now", refresh `IconButton mdiRefresh`, backup rows: date, zone count, `IconButton`s Restore (`mdiBackupRestore`), Download (`mdiDownload`), Delete (`mdiDeleteOutline`). Header: "Download all" (`mdiDownload`), "Import" (`mdiImport`) | `SettingsPage.tsx:1011-1178` |
| Custom assets | Floor materials and furniture types lists with add/edit/delete | `1180-1462` |
| Firmware | Device list as `ChoiceList` rows (radio semantics): icon, name, model, version, area; selected row `bg-accent-tint` + `mdiCheckCircle` at the right. "Check for updates" primary. Advanced: Manual firmware URL, LAN configuration, Cache, each a `Disclosure` with `mdiChevronRight` rotating | `FirmwareUpdateSection.tsx:2705-2772` ("Selected" pill at `2738-2742`, "No device selected" badge `1245-1246`), `+`/`-` disclosure glyphs (`2960`) |
| Troubleshooting | `TroubleshootingCard` (debug mode, bundles) | unchanged content |

Room management leaves Settings for the Rooms screen (§2.1).

### 2.7 Setup wizard (`#/wizard`)

Job: bind a device to a room and get it drawn, without losing place.

Layout `>= lg`: app sidebar stays. Content is a two-column frame: left `StepList` (`w-64`, vertical, steps from `steps` `WizardPage.tsx:440-462`), right the step body. Phone: `StepList` collapses to a header line "Step 3 of 10, Choose room" with a thin progress bar and a `mdiFormatListNumbered` `IconButton` that opens the list in a sheet.

`StepList` rows: number circle for upcoming, `mdiCheck` in accent circle for done (review round 1 "stepper bug": completed steps must show checks), current row `bg-accent-tint font-medium`. Done steps are clickable to go back; future steps are not.

Steps:
- device: `ChoiceList` of devices. Devices already in a room (today "🔒 Already configured in 'Living Room'", greyed, `before/08-wizard.png`) render as disabled rows with `mdiLockOutline`, `Badge` "In Living room" and a `Button variant=ghost size=sm` "Open room" linking to that room. Selected row: check icon, not just a border.
- entityDiscovery: `EntityDiscovery` restyled; its ✓/✗/✎/▶/▼ glyphs map per §2.8.
- roomChoice: `ChoiceList` New room / Existing room / Skip, each with icon (`mdiHomePlusOutline`, `mdiHomeOutline`, `mdiDebugStepOver`).
- roomDetails: name `Field`, existing-room `ChoiceList`.
- outline, placement, doors, furniture, zones: render `RoomScreen` in `build` or `zones` mode with `wizardStep` set. A `StepStrip` (mock `.strip`) sits above the canvas: step title, one-line instruction (from `WizardPage.tsx:1625-1634`, icons replaced), `Button` "Back", primary "Next" (disabled with tooltip until the step's condition: `outlineDone`, `placementDone`, `zonesReady`). This removes the duplicated canvas code in `WizardPage.tsx` (zone list, display, polygon banners at `2470`, `3896`, `ZoneEditor` numeric form at `3105`).
- finish: summary of the room with `RoomThumbnail`, primary "Open room".

Header: "Set up a device" title, `IconButton mdiClose` "Exit setup" (was "← Dashboard"), overflow menu "Start over" (`mdiRestart`, was "↻ Restart"). Theme buttons removed from the wizard header. "APP V2.2.5" badge removed (version is in the sidebar).

### 2.8 Glyph and emoji to `@mdi/js`

Every glyph from map §3 "Glyph/emoji buttons" plus the per-file inventory (`grep` of non-ASCII in `pages/` and `components/`). Import as `import { mdiX } from '@mdi/js'`, render with `<Icon path={mdiX} />`.

| Glyph | Where (examples) | Meaning | `@mdi/js` |
|---|---|---|---|
| ☰ | Menu (`Live 1008`, `Zone 1682`, `RB 2257`), "Show Zone Slots" (`Zone 2019`) | nav / list | removed (nav); list -> `mdiFormatListBulleted` |
| ← | Back (`Live 998`, `Zone 1672`, `Settings 792`) | back | `mdiArrowLeft` |
| → | links (`Live 2412-2430`, `Zone 2499`) | go to | `mdiChevronRight` |
| 📡 | Live Dashboard menu, wizard device step | live | `mdiAccessPoint` |
| ➕, + | Add Device, "+ Zone" etc. | add | `mdiPlus` |
| 📐 | Zone Editor menu | zones | `mdiVectorPolygon` |
| 🏠, 🏗 | Room Builder menu, outline step | layout | `mdiFloorPlan` |
| ⚙️ | Settings | settings | `mdiCog` |
| 📂, 📁 | Zone backups, wizard folder | backups | `mdiBackupRestore` (backups), `mdiFolderOutline` (generic) |
| ✕ | close, hide, vertex delete badge (`ZoneCanvas 1029-1036`) | close / delete | `mdiClose` (close); vertex delete moves to inspector `mdiDeleteOutline` |
| ⬡ | polygon mode (`Zone 2046`, `Live 1638`) | polygon | `mdiVectorPolygon` |
| ▢, ⬜, ▭ | rectangle mode, basic shapes | rectangle / shapes | `mdiVectorRectangle`; shapes `mdiShapeOutline` |
| ⚠️, ⚠ | warnings (`Zone 1574, 2047`, `Live 924`, `Settings 951`, `DoorEditor`) | warning | `mdiAlertOutline` |
| 🎨 | Display (`Live 2528`, `Zone 2099`), Settings assets | display layers / assets | `mdiLayersOutline` (layers), `mdiPaletteOutline` (assets) |
| −, + (zoom) | `Live 1794`, zoom stack | zoom / expand | `mdiMinus`, `mdiPlus` (zoom); expand/collapse `mdiChevronDown` / `mdiChevronUp` |
| ●, ○ | record, status (`Live 1893`, `2603`) | recording / status | `mdiRecordCircleOutline`, stop `mdiStopCircleOutline`; status uses `StatusDot` |
| ↻, ↺, ⤺ | refresh (`Live 2230`), rotate (`RB`), restart (wizard) | refresh / rotate / restart | `mdiRefresh`; `mdiRotateRightVariant`, `mdiRotateLeftVariant`; `mdiRestart` |
| ↶, ↷ | Undo / Redo (`RB`) | undo / redo | `mdiUndo`, `mdiRedo` |
| 💡 | Tips (`Live 2369, 2562`), EP1 helper | suggestions | `mdiLightbulbOnOutline` |
| 🔧 | Device (`Live 2536`) | sensor settings | `mdiTune` |
| 📜 | Logs (`Live 2546`) | logs | `mdiTextBoxSearchOutline` |
| 💾 | Backup All (`Settings 854`) | save backup | `mdiContentSaveOutline` |
| 📤, 📥 | Export / Import (`Settings 861, 992`) | export / import | `mdiExport`, `mdiImport` |
| ✓ | synced, finish, EP1 checks | done / ok | `mdiCheck`; status `mdiCheckCircleOutline` |
| ✗ | EP1 / EntityDiscovery fail | failed | `mdiCloseCircleOutline` |
| 🔄 | Re-sync (`Settings 974`) | re-sync | `mdiSync` |
| 🔗 | Unlink (`Settings 984`) | unlink | `mdiLinkOff` |
| 🔒, 🔓 | locks (`RB` 9 each, wizard, DeviceLogs) | lock state | `mdiLockOutline`, `mdiLockOpenVariantOutline` |
| 🗑️ | Clear walls, delete | delete | `mdiDeleteOutline`; clear walls `mdiDeleteSweepOutline` |
| ✏️, ✎ | Add wall, rename, edit mapping | draw / edit | walls `mdiVectorPolyline`; edit `mdiPencilOutline` |
| 🚪 | Add Door, DoorEditor | door | `mdiDoor` |
| 🚫 | DoorEditor "no swing" | none | `mdiCancel` |
| 🪑 | Add Furniture | furniture | `mdiSofaOutline` |
| ✨, ⚡ | wizard highlights, EP1 comparison | auto / fast | `mdiAutoFix`, `mdiFlashOutline` |
| 🔍 | wizard search | search | `mdiMagnify` |
| 📍 | wizard placement | place device | `mdiMapMarkerOutline` |
| 📋 | wizard summary | summary | `mdiClipboardTextOutline` |
| 🎯 | wizard zones / calibrate | target | `mdiTarget` |
| ☀️, 🌙, 💻 | `ThemeSwitcher` | theme | `mdiWhiteBalanceSunny`, `mdiWeatherNight`, `mdiThemeLightDark` |
| 💧, 🌡, 🌬 | EP1 environmental / CO2 | humidity, temp, air | `mdiWaterPercent`, `mdiThermometer`, `mdiMoleculeCo2` |
| 📊 | `HourlyActivityChart` | chart | `mdiChartBar` |
| 🔥 | `ZoneStatsPanel` | heatmap | `mdiFire` |
| 📏, 👤 | EP1 mini charts | distance, person | `mdiRuler`, `mdiAccountOutline` |
| ▲, ▼, ▶ | trends, disclosures | up / down / expand | trends `mdiTriangleSmallUp` / `mdiTriangleSmallDown`; disclosure `mdiChevronRight` (rotates 90° open) |
| ↓ | DeviceLogs scroll to end | follow | `mdiArrowDown` |
| ■ | Settings stop (debug) | stop | `mdiStop` |
| `+` / `-` (firmware disclosure, `FirmwareUpdateSection.tsx:2960`) | expand | | `mdiChevronRight` rotating |
| `?` (help trigger) | `HelpTooltip` | info | `mdiInformationOutline` 16 px |

Exceptions kept as text: `°`, `×`, `₂` in CO₂, `·` separators, box-drawing `─` in RB comments (not rendered).

Note: names are `@mdi/js` v7 exports. A wrong name is a TypeScript import error, so the build verifies the table.

### 2.9 Text-as-state to visual state

| Current text | Where | New form |
|---|---|---|
| "Selected" pill on a device card | `FirmwareUpdateSection.tsx:2738-2742` | `ChoiceList` row `aria-checked`, `bg-accent-tint`, `mdiCheckCircle` `text-accent-ink` at row end |
| "No device selected" badge | `FirmwareUpdateSection.tsx:1245-1246`, screenshot `04b` | removed; "Check for updates" disabled with tooltip "Pick a device first" |
| Selected device card by border only | wizard device step, `FirmwareUpdateSection` | same `ChoiceList` check |
| `(x/y)` in "Show Zone Slots (1/8)" | `ZoneEditorPage.tsx:2019` | `Badge` "1 of 8 used" in Zones section header |
| "Polygon mode active" | `ZoneEditorPage.tsx:2056`, wizard `2470`, `3896` | pressed "Polygons" segment with check in Zone shape `Segmented` |
| "N of M slots configured" | `ZoneEditorPage.tsx:2188-2190` | same `Badge` |
| `(n/max)` on add buttons | `2290-2345` | per-kind `Badge` "3 left" in Kind segmented; disabled when 0 |
| "Disabled" / "Unavailable" chips on zones | `2385-2394`, `2590-2599` | row icon `mdiAlertCircleOutline` `text-warning-ink` + tooltip with cause |
| "N vertices" | `2399` | `text-xs text-fg-muted` "5 points" in the row second line (data, not state) |
| "Node X of Y selected" | `2473-2474` | selected vertex row pressed + filled accent handle on canvas |
| "Recovering..." / "Restoring..." / "Switching..." / "Saving" | `1543, 1552, 1613, 1660, 1749` | spinner (`Icon` `mdiLoading` with `animate-spin`) in the button; label unchanged; button `aria-busy` |
| `'Slices' | 'Poly' | 'Rect'` mobile badge | `2663` | shape `Segmented` state in the inspector; toolbar tool icons |
| "⬡ Polygon / ▢ Rectangle" zone mode row | `LiveTrackingPage.tsx:1638` | removed from Live; shape shown by zone outlines |
| "(Not Available)" menu suffix | `LiveTrackingPage.tsx:1046` | disabled nav item with tooltip |
| "Active (Ns)" / "Inactive" assumed present | `1655-1657` | `Badge tone=accent` "Assumed present, 12 s left" when active, nothing when inactive |
| "Occupied" / "Clear" | `2816` | status pill (mock `.state.on` / `.clear`) |
| "Active" / "Inactive" | `2835` | `StatusDot` + word |
| "Status" button text | `986` | presence pill in `TopBar` |
| "Disabled" / "Unavailable" / "Hidden" setting chips | `DeviceSettingsModal.tsx:259-273` | row icon (`mdiCancel` disabled, `mdiCloudOffOutline` unavailable, `mdiEyeOffOutline` hidden) with tooltip naming `disabledBy` / `hiddenBy`; control disabled |
| "Value unavailable", "Status unknown" | `337-349` | value cell shows "n/a" in `text-fg-subtle` plus the same icon |
| "Device linked" / "No device linked" | `SettingsPage.tsx:937` | device chip on room card (`StatusDot` + model + name) or chip "No device" |
| "✓ Entities synced" / "⚠ Entities not synced" | `947`, `951` | `mdiCheckCircleOutline` `text-success-ink` tooltip "Entities synced", or `mdiAlertOutline` `text-warning-ink` with menu action "Re-sync" |
| "Default Room" / "Setting..." | `962-966` | `mdiStar` on card and sidebar row; spinner while setting |
| "Rotating: Rotate everything · change" | Room Builder | check inside the rotate scope menu |
| "Changes apply immediately • Press Enter..." footer | `DeviceSettingsModal.tsx:435-437` | removed; per-row write state (§4.3) |

---

## 3. Canvas

### 3.1 Full cone visible

Current cause (map §2): clip on by default (`useDisplaySettings.ts:48`), height cone always clipped (`RoomCanvas.tsx:737`), auto-zoom fits the room bbox + 500 mm only (`ZoneEditorPage.tsx:1421-1463`, `LiveTrackingPage.tsx:~790-808`), cone ignores installation angle (`RoomCanvas.tsx:1878`, `EP1DistanceArc.tsx:72`), Zone Editor and Live use different FOV sources (`ZoneEditorPage.tsx:1840-1841` vs `LiveTrackingPage.tsx:1147-1148`).

Changes:
1. **Clip default off** (D3). The height-coverage polygon follows the same flag: replace `clipToWalls: safePoints.length >= 3` at `RoomCanvas.tsx:737` with `clipToWalls: clipRadarToWalls && safePoints.length >= 3`.
2. **Unclipped cone, styled to read as coverage, not as room**: fill `fill-cv-cover` (10% accent), edge `stroke-cv-ring stroke-[1.5] opacity-70`; the part outside the room outline gets the hatch pattern (mock `#hatch` + `mask#outside`), so "the sensor sees past this wall" is visible without clipping. When clip is on, the outside part is not drawn.
3. **One coverage resolver**: new `resolveCanvasCoverage(profile, placement, sensorConfig)` in `utils/coverage.ts` returning `{ fovDeg, rangeMm, rotationDeg }`:
   - `fovDeg` from `resolveCoverageFov` (`coverage.ts:12-51`).
   - `rangeMm = min(profile.limits.maxRangeMeters*1000, sensorConfig.maxDistance*10)` for Lite/Pro (`maxDistance` is cm, 0-600); `mmwaveDistanceMax` for EP1.
   - `rotationDeg = (placement.rotationDeg ?? 0) + (sensorConfig.installationAngle ?? 0)`, the same sum `deviceToRoom` uses (`App.tsx:557`).
   - `sensorConfig` is `{ ...liveState.config, ...sensorDraft }` so previews flow through (§4).
   - Both cone blocks in `RoomCanvas` (`1875-2059`, `2063-2240`), `EP1DistanceArc` and the aligned-direction indicator (`LiveTrackingPage.tsx:1516-1567`) read from it. The two near-identical cone blocks collapse into one `CoverageLayer` component with an `interactive` prop.
4. **Fit** (`F`, Fit button, and on first open of a room per session):
   - Bounds = union of room outline points, the unclipped cone polygon (device, both edge endpoints, arc samples every 5°), enabled zones, furniture, device.
   - Padding 6% of the larger side, minimum 300 mm.
   - Fit against the real container aspect. The SVG today uses a square viewBox (`RoomCanvas.tsx:709-717`, `1234-1281`) inside a non-square box, which wastes the wide axis. Change: `RoomCanvas` measures its container with `ResizeObserver` and builds `viewBox` from `(viewW, viewH)` = container aspect scaled by zoom. `toCanvasCoord` is unchanged; only `viewMin`/`viewSize` become per-axis.
   - Viewport (zoom, pan) per room is kept in `sessionStorage` key `zc:viewport:<roomId>`; a stored viewport skips the auto fit.
   - One `fitViewport(bounds, container)` util replaces the two `handleAutoZoom` copies.
5. **No-outline rooms** fit cone ∪ device, so a new room shows the full coverage before any wall exists.

### 3.2 Zone drawing

Tools and modes are in §2.4. Interaction detail:

Rectangle tool:
- Pointer down on empty canvas starts a rectangle at the snapped point; drag sets the opposite corner; pointer up commits if both sides ≥ 100 mm (existing minimum, `ZoneCanvas.tsx:328-402`), else cancels.
- Shift constrains to a square. Alt disables snap during the drag.
- Live size label at the moving corner: "1.20 × 0.80 m", `text-xs` with halo.

Polygon tool:
- Click places a vertex at the snapped cursor. A rubber-band segment follows the cursor from the last vertex. Segment length label on the rubber band.
- Shift constrains the rubber band to 0/45/90° (same 45° behaviour as walls).
- Finish: click the first vertex (it gets a 2 px accent ring when the cursor is within the hit radius), double-click, or Enter. Needs ≥ 3 vertices; with fewer, Enter does nothing and the inspector line "Add at least 3 points" turns `text-warning-ink`.
- Backspace removes the last placed vertex; Esc cancels the draft.
- On finish the zone takes the next free slot of the selected kind, the tool returns to Select, the zone is selected and the inspector focuses Name.

Editing a selected zone (both shapes):
- Vertex handles always visible on the selected zone, hidden on others. Hovering a zone shows its outline at 2 px and a pointer cursor.
- Drag body to move (centroid snapping as today, `ZoneCanvas.tsx:260-307`), drag a vertex to reshape. Rectangles show 8 handles as today.
- Midpoint handles on polygons: smaller hollow circles at each edge centre; drag or click inserts a vertex there (`ZoneCanvas.tsx:954-999` behaviour kept).
- Delete a vertex: select it, then Delete/Backspace, or the row button in the points table. Alt+click a vertex deletes it directly. The on-canvas ✕ badge (`ZoneCanvas.tsx:1002-1039`) is removed.
- Arrow keys nudge the selected vertex or zone by the snap step (10 mm when snap is off); Shift×10.
- Ceiling-slice mode: vertex handles hidden, only the lateral edges are draggable (`polygonLateralOnlyAxis`), cursor `ns-resize`/`ew-resize` on those edges.
- The duplicated drag paths in `ZoneCanvas.tsx` (`211-258` vs `404-450`, `260-307` vs `452-506`) merge into one pointer handler per gesture; that is an implementation note, not a behaviour change.

Snap grid: setting lives in the inspector (Zones and Layout room panels), quick toggle in the toolbar (`mdiMagnet`), Alt bypass. Snap applies in room coordinates (D4). Snap grid lines render only when snap is on and zoom shows at least 8 px per step.

### 3.3 Handle sizing

Replace fixed `r={11}` in `ZoneCanvas.tsx:696-705, 907-934` and the zoom clamp `clampHandleSize` (`RoomCanvas.tsx:703-708`) with screen-constant sizes:

```ts
// in RoomCanvas, exposed to overlays through renderOverlay's context
const pxToSvg = viewW / containerWidthPx;     // svg units per CSS pixel
const coarse = matchMedia('(pointer: coarse)').matches;
const handle = {
  r: (coarse ? 9 : 6) * pxToSvg,              // visible radius
  hitR: (coarse ? 22 : 12) * pxToSvg,         // transparent hit circle
  midR: (coarse ? 7 : 4.5) * pxToSvg,
  stroke: 2 * pxToSvg,
};
```

`renderOverlay` (`RoomCanvas.tsx:1864-1874`) receives `{ toCanvasCoord, fromCanvasCoord, pxToSvg, handle }`. Handles: `fill-surface stroke-accent`; selected vertex `fill-accent`. Hit circles are separate transparent elements so visual size and touch target differ (review round 2 note: 22 px handle hit).

### 3.4 Keyboard

Global on the room screen (ignored while focus is in an input):

| Key | Action | Mode |
|---|---|---|
| 1 / 2 / 3 | Live / Zones / Layout | all |
| F | Fit | all |
| + / - | zoom | all |
| Space + drag, middle drag | pan | all |
| Esc | cancel drawing, else clear selection | all |
| V | Select tool | zones, build |
| P / R | Polygon / Rectangle tool | zones |
| A / D | Walls / Door tool | build |
| Enter | finish polygon or wall | zones, build |
| Backspace | remove last drawn point; else delete selected vertex | zones, build |
| Delete | delete selected vertex, else selected object (with undo) | zones, build |
| Arrows / Shift+Arrows | nudge | zones, build |
| R / Shift+R | rotate plan 90° | build (existing) |
| Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z | undo / redo | zones (D5), build |
| Ctrl/Cmd+S | Save zones / Save layout | zones, build |
| ? | shortcuts sheet | all |

The "Tips:" paragraph (`RoomBuilderPage.tsx` info bar) and the keyboard hint (`2014-2039`) move into the `?` sheet; every toolbar tooltip names its key.

---

## 4. Live sensor settings in the inspector

### 4.1 Placement

`DeviceSettingsModal` (`components/DeviceSettingsModal.tsx`, full-screen `bg-black/60` modal, opened only from Live) is replaced by `SensorSection`, a `Panel` inside the room inspector:
- Live mode: section 2 of the room panel; expands when the device marker is selected.
- Zones mode: zone off-delay fields in `ZonePanel`; the full section via the device marker.
- Layout mode: part of `DevicePanel` (§2.5).

`SensorSection` reuses the data layer of the modal unchanged: `useDeviceMapping`, `useDeviceSettings` (`contexts/DeviceMappingsContext.tsx`), the per-entity fetch (`DeviceSettingsModal.tsx:95-200`) and `updateSetting` (`202-238`, POST `api/live/${deviceId}/entity`). Groups come from the profile (`config/device-profiles/*.json`), rendered as collapsible sub-panels in this order: canvas-affecting groups first, then the rest.

### 4.2 Draft model

```ts
interface SensorDraft {
  values: Record<string, number>;     // number entities only
  status: Record<string, 'idle' | 'writing' | 'ok' | 'error'>;
  error?: Record<string, string>;
}
function useSensorDraft(deviceId?: string): {
  draft: SensorDraft;
  set(key: string, value: number): void;
  discard(): void;
  apply(): Promise<void>;             // sequential updateSetting per dirty key
  dirtyCount: number;
};
```

- Owned by `RoomScreen`, so the canvas and every inspector body read the same draft.
- Number entities (`controlType: 'number'`) edit the draft. The value commits to the draft on every slider move and on each valid keystroke (not on blur, unlike `NumberInput`, `DeviceSettingsModal.tsx:26-74`), so the canvas updates while dragging.
- Switches, lights, selects and buttons keep the immediate write (`DeviceSettingsModal.tsx` current behaviour), with per-row spinner and check.
- `ApplyBar` at the bottom of `SensorSection` (sticky inside the inspector scroll, mock `.applybar`): "2 changes not on the device", `Button variant=ghost` "Discard", `Button variant=primary` "Apply". Phone: the sheet peek row shows the same Apply.
- Apply writes keys in profile order. Grouped applies: Pro "Static Presence Range" writes `staticPresenceMinRange`, `MaxRange`, `TriggerRange`, then presses `applyStaticRangeSettings`; same for the sensitivity pair and `applyStaticSensitivitySettings`. The separate "Apply" button rows for those entities are hidden, since the group Apply covers them.
- Per-row state after Apply: `mdiCheck` `text-success-ink` for 2 s, or `mdiAlertCircleOutline` `text-danger-ink` with the error as tooltip and the draft value kept for retry.
- A dirty row shows a 6 px accent dot left of the label and the device value as `text-xs text-fg-muted` "On device: 450 cm".
- Leaving the room or switching rooms with a dirty draft triggers `useLeaveGuard`.
- `PreviewChip` on the canvas top-left while dirty: `Badge tone=accent` "Previewing 2 unapplied changes" + `Button size=sm` Apply + `IconButton mdiClose` Discard.

### 4.3 What previews what

Profile keys from `config/device-profiles/*.json`.

| Setting (key) | Device | Preview on canvas | Write |
|---|---|---|---|
| Installation angle / Tracking sensor angle (`installationAngle`, −45..45°) | Lite, Pro | Cone, zones and targets rotate by `placement.rotationDeg + draft`. Exact, because the rotation is applied client-side in `deviceToRoom` (`App.tsx:550-573`) and `ZoneCanvas.tsx:164-165`. Aligned-direction arrow follows. | draft + Apply |
| Max distance / Tracking detection range (`maxDistance`, cm) | Lite, Pro | Cone radius and max ring use the draft. Targets beyond the draft range render hollow (`fill-none stroke-target-n`) to show they will be dropped. | draft + Apply |
| Upside-down mounting (`upsideDownMounting`) | Lite, Pro | None. Firmware normalises orientation (`App.tsx:562-564`). Row shows `Note` "No effect on the plan; the device flips its own readings." | immediate |
| Minimum / Maximum / Trigger distance (`mmwaveDistanceMin`, `mmwaveDistanceMax`, `mmwaveTriggerDistance`, cm) | One | `EP1DistanceArc` rings (min dashed, trigger accent, max wall colour, mock `.r-min/.r-trig/.r-max`) move with the draft; live distance arc stays. | draft + Apply |
| Static presence min / max / trigger range (`staticPresence*Range`, m) | Pro | New rings around the device, same styling as the One rings, visible while the Static Presence Range group is open (D7). | grouped draft + Apply (+ apply button entity) |
| Zone off delays (`zone1OffDelay`..`zone4OffDelay`) | Lite, Pro | None; edited in `ZonePanel` for the matching slot. | draft + Apply |
| Occupancy off delay, assume-present timeout, exit threshold, stale-target timeout, latencies, sensitivities, threshold factor, LED brightness, environmental offsets | all | None. | draft + Apply |
| Update speed, target update rate, tracking behaviour, mmWave mode, update rate, relay modes, LED mode | all | None. | immediate (select) |
| Entry/exit enabled, stale target reset, assumed presence, static sensor enable, micro motion, LEDs, LD2450 Bluetooth | all | None (entry/exit toggles show/hide the Entry kind badge counts in Zones). | immediate |
| Polygon zones (`polygonZonesEnabled`) | Lite, Pro | Not shown in Sensor; controlled only by Zone shape in Zones mode, to keep one control per setting. | existing confirm + write |
| Firmware info/build selects (`firmwareBle`, `firmwareCo2`, `firmwareNetwork`) | all | Not shown in Sensor. Shown read-only in Settings > Firmware next to the device, where they belong. | unchanged |

Placement fields (rotation, mount, height, pitch, FOV) already preview live in Layout (`RoomBuilderPage.tsx:428-436`) and stay in the layout draft.

### 4.4 States

- Loading: 4 skeleton rows.
- Profile mismatch (`DeviceSettingsModal.tsx` "Device mapping needs re-sync"): `Note tone=warning` with the existing copy and "Re-sync" opening `EntityDiscovery` in a sheet.
- Load error: `Note tone=danger` with "Retry".
- No settings: "This device exposes no settings to Home Assistant."
- Device offline: fields disabled, `Note` "Offline. Changes can be applied when it reconnects." Draft kept.

---

## 5. Primitives and tokens

### 5.1 Components (`src/components/ui/`)

| Component | Props | Notes |
|---|---|---|
| `Icon` | `path: string; size?: 16 \| 20 \| 24 (default 20); className?; title?` | `<svg viewBox="0 0 24 24" aria-hidden={!title} role={title ? 'img' : undefined}><path d={path} fill="currentColor"/></svg>` |
| `IconButton` | `icon: string; label: string; onClick?; pressed?: boolean; disabled?; busy?; variant?: 'ghost' \| 'outline' \| 'solid'; size?: 'sm' \| 'md'; badge?: ReactNode; shortcut?: string` | `label` is required; it sets `aria-label` and the `Tooltip` ("Undo (Ctrl+Z)"). `md` = `h-10 w-10`, coarse pointer `h-11 w-11`. Pressed: `bg-accent-tint text-accent-ink ring-1 ring-accent/40`. |
| `Button` | `variant?: 'primary' \| 'secondary' \| 'ghost' \| 'danger'; size?: 'sm' \| 'md'; icon?: string; busy?: boolean; disabled?; type?` | primary `bg-accent text-accent-fg hover:bg-accent/90`; secondary `border border-line bg-surface hover:bg-surface-2`; ghost `text-accent-ink hover:bg-accent-tint`; danger `bg-danger text-white` only in confirm dialogs. `busy` shows `mdiLoading` spinning in place of `icon`, keeps the label, sets `aria-busy`. |
| `Segmented<T>` | `value: T; onChange(v: T); options: { value: T; label: string; icon?: string; disabled?: boolean; tooltip?: string; badge?: ReactNode }[]; size?: 'sm' \| 'md'; iconOnly?: boolean; ariaLabel: string; busyValue?: T` | `role="radiogroup"`, buttons `role="radio" aria-checked`. Pressed: `bg-accent-tint font-medium` + `mdiCheck` 16 px before the label (mock `.seg .ck`). `iconOnly` keeps the label as tooltip and `aria-label`. |
| `Toggle` | `checked: boolean; onChange(v: boolean); label: string; description?: string; busy?; disabled?` | `role="switch"`; track `w-11 h-6` (coarse `w-[52px] h-8`), `bg-accent` when on. Whole row is the click target. |
| `Badge` | `tone?: 'neutral' \| 'accent' \| 'success' \| 'warning' \| 'danger'; icon?: string; children` | `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs`; tones use `*-tint` bg and `*-ink` text. |
| `StatusDot` | `state: 'online' \| 'offline' \| 'busy' \| 'none'; label?: string` | 8 px dot; offline is a hollow ring (mock `.dot.off`), so state does not rely on colour alone. |
| `Panel` | `title?: string; actions?: ReactNode; collapsible?: boolean; defaultOpen?: boolean; id?: string; children` | Inspector section: `border-t border-line pt-4` inside inspector; standalone `rounded-xl border border-line bg-surface p-4` elsewhere. Collapsible header uses `mdiChevronRight` rotating 90°. |
| `Field` | `label: string; help?: ReactNode; unit?: string; error?: string; layout?: 'row' \| 'stack'; htmlFor?; children` | Replaces unused `LabeledControl.tsx`. `help` renders the `Tooltip` info trigger. Persistent label, never placeholder-as-label. |
| `NumberField` | `value: number; onChange(v: number); min?; max?; step?; unit?; dirty?: boolean; deviceValue?: number; disabled?` | Commits on valid input; clamps on blur; `inputMode="decimal"`, `tabular-nums`. |
| `Tooltip` | `content: ReactNode; children: ReactElement; side?: 'top' \| 'bottom' \| 'left' \| 'right'` | Generalised from `HelpTooltip` (portal, `calculateTooltipPosition`). Hover + focus on fine pointers, long-press on touch. `HelpTooltip` becomes `<Tooltip content=...><IconButton icon={mdiInformationOutline} .../></Tooltip>`. |
| `Sheet` | `open; onClose; title; variant?: 'side' \| 'bottom' \| 'docked'; snap?: 'peek' \| 'half' \| 'full'; onSnapChange?; footer?; children` | Built from `CanvasMobileSheet`. `side` = right panel 420 px on desktop (logs, backups list, entity discovery, furniture library); same content as `bottom` on phone. `docked` is the inspector on phone. |
| `Menu` | `trigger: ReactElement; items: { label; icon?; onSelect; danger?; checked?; disabled? }[]` | `role="menu"`, arrow keys, `checked` renders `mdiCheck`. |
| `Popover` | `trigger; children; align?` | for Layers and Shapes. |
| `ConfirmDialog` | `title; body; confirmLabel; tone?: 'default' \| 'danger'; onConfirm; onCancel; busy?` | Replaces the bespoke confirm modals (mode change, clear walls, unlink, delete). |
| `ApplyBar` / `SaveState` | `dirtyCount; onApply / onSave; onDiscard?; busy; lastError?; savedLabel?` | One visual pattern for Sensor Apply, Save zones, Save layout. |
| `ChoiceList<T>` | `value; onChange; options: { value; title; subtitle?; icon?; disabled?; trailing? }[]` | Radio list with check icon; wizard device step, firmware device, room choice. |
| `Note` | `tone: 'info' \| 'warning' \| 'danger'; title?; children; actions?` | Mock `.note`. |
| `Toast` | via `useToast()` | single region. |
| `Kbd` | `children` | shortcut chips. |

Deleted after migration: `Card` in `App.tsx:20-25`, `.glass-card` (`index.css:133-149`), `CanvasPageShell`, `CanvasFloatingPanel`, `CanvasTopBar`, `CanvasBottomToolbar`, `CanvasToolbarButton` (`CanvasLayout.tsx`), `LabeledControl.tsx`, `ThemeSwitcher.tsx` (replaced by a `Segmented`), `DisplaySettingsControls.tsx` + `DisplayAppearanceControls.tsx` (merged into `DisplayLayers`), `DeviceSettingsModal.tsx` (to `SensorSection`), `ZoneEditor.tsx` (wizard uses Zones mode).

### 5.2 Tokens (`tailwind.config.cjs` + `index.css`)

Colours are CSS variables holding RGB channels, so one class works in both themes and opacity modifiers still work. No hex in JSX or SVG attributes.

```js
// tailwind.config.cjs
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        midnight: { 900: '#0f172a', 800: '#111827', 700: '#1f2937' },   // kept until unused
        aqua: {
          50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7',
          400: '#51dda8', 500: '#34d399', 600: '#10b981', 700: '#0ea271',
          800: '#047857', 900: '#064e3b',
        },
        bg: v('bg'),
        surface: { DEFAULT: v('surface'), 2: v('surface-2'), 3: v('surface-3') },
        line: { DEFAULT: v('line'), strong: v('line-strong') },
        fg: { DEFAULT: v('fg'), muted: v('fg-muted'), subtle: v('fg-subtle') },
        accent: { DEFAULT: v('accent'), fg: v('accent-fg'), ink: v('accent-ink'), tint: 'rgb(var(--accent) / 0.15)' },
        success: { DEFAULT: v('success'), ink: v('success-ink'), tint: 'rgb(var(--success) / 0.15)' },
        warning: { DEFAULT: v('warning'), ink: v('warning-ink'), tint: 'rgb(var(--warning) / 0.16)' },
        danger: { DEFAULT: v('danger'), ink: v('danger-ink'), tint: 'rgb(var(--danger) / 0.15)' },
        cv: {
          bg: v('cv-bg'), grid: v('cv-grid'), 'grid-major': v('cv-grid-major'),
          room: v('cv-room'), wall: v('cv-wall'), cover: v('cv-cover'), ring: v('cv-ring'),
          dim: v('cv-dim'), halo: v('cv-halo'),
        },
        zone: { regular: v('zone-regular'), exclusion: v('zone-exclusion'), entry: v('zone-entry') },
        target: { 1: v('target-1'), 2: v('target-2'), 3: v('target-3') },
      },
      fontFamily: { display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'], body: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'] },
      boxShadow: { e1: '0 1px 2px rgb(0 0 0 / 0.20), 0 2px 8px rgb(0 0 0 / 0.12)', e2: '0 2px 4px rgb(0 0 0 / 0.24), 0 8px 24px rgb(0 0 0 / 0.18)' },
    },
  },
};
```

`aqua-100..400` are defined, which fixes the 100+ dead `text-aqua-100` / `text-aqua-400` classes (map §5) and lets `index.css:263` go.

```css
/* index.css, replaces :root vars at 6-38 */
:root, :root.dark {
  --bg: 2 6 23;            /* slate-950 */
  --surface: 15 23 42;     /* slate-900 */
  --surface-2: 30 41 59;   /* slate-800 */
  --surface-3: 51 65 85;   /* slate-700 */
  --line: 51 65 85;  --line-strong: 71 85 105;
  --fg: 241 245 249;  --fg-muted: 148 163 184;  --fg-subtle: 100 116 139;
  --accent: 52 211 153;  --accent-fg: 4 36 26;  --accent-ink: 110 231 183;
  --success: 34 197 94;  --success-ink: 134 239 172;
  --warning: 245 158 11; --warning-ink: 252 211 77;
  --danger: 244 63 94;   --danger-ink: 253 164 175;
  --cv-bg: 11 17 32; --cv-grid: 148 163 184; --cv-grid-major: 148 163 184;
  --cv-room: 30 41 59; --cv-wall: 203 213 225; --cv-cover: 110 231 183; --cv-ring: 110 231 183;
  --cv-dim: 148 163 184; --cv-halo: 11 17 32;
  --zone-regular: 96 165 250; --zone-exclusion: 251 113 133; --zone-entry: 74 222 128;
  --target-1: 96 165 250; --target-2: 52 211 153; --target-3: 251 191 36;
}
:root.light {
  --bg: 248 250 252; --surface: 255 255 255; --surface-2: 241 245 249; --surface-3: 226 232 240;
  --line: 226 232 240; --line-strong: 203 213 225;
  --fg: 15 23 42; --fg-muted: 71 85 105; --fg-subtle: 100 116 139;
  --accent: 4 120 87; --accent-fg: 255 255 255; --accent-ink: 4 120 87;
  --success: 22 163 74; --success-ink: 21 128 61;
  --warning: 217 119 6; --warning-ink: 146 64 14;
  --danger: 225 29 72; --danger-ink: 190 18 60;
  --cv-bg: 248 250 252; --cv-grid: 100 116 139; --cv-grid-major: 100 116 139;
  --cv-room: 255 255 255; --cv-wall: 51 65 85; --cv-cover: 4 120 87; --cv-ring: 4 120 87;
  --cv-dim: 71 85 105; --cv-halo: 248 250 252;
  --zone-regular: 37 99 235; --zone-exclusion: 225 29 72; --zone-entry: 22 163 74;
  --target-1: 37 99 235; --target-2: 4 120 87; --target-3: 180 83 9;
}
```

Notes:
- Tints (`bg-accent-tint`, `bg-warning-tint`, ...) are the base colour at a fixed alpha, defined in the config, so they need no extra variables and follow the theme.
- Light accent is emerald-700 (`#047857`): white text on it is 5.5:1; emerald-600 with white fails 4.5:1 (review round 2 N6 is the same trap).
- Grid lines use `stroke-cv-grid/10` (minor) and `/20` (major).
- Canvas colours move out of `RoomCanvas.tsx:659-664` (`canvasColors`), `2000-2013`, `ZoneCanvas.tsx:684-692, 816-825` and page `targetColors` into classes: `className="fill-cv-room stroke-cv-wall"`, zones `fill-zone-regular/20 stroke-zone-regular`.
- `index.css:151-603` `.light` `!important` overrides are deleted per screen as each screen migrates; step 5 deletes the remainder.
- Floor material patterns (`floors/patterns.tsx`) keep their own colours (they are content, not chrome).

---

## 6. Migration order

Each step builds, passes `npm test`, and is releasable on its own.

1. **Foundation**
   - Add `@mdi/js`. Add tokens (§5.2) and `components/ui/*` primitives.
   - `router.ts`, `AppShell` (sidebar / rail / top+bottom bar), `RoomSwitcher`, `AppDataProvider` (D1).
   - Existing pages mount inside the shell, reading `roomId` from the route. Remove each page's Menu, `showNavMenu`, room `<select>` and `onNavigate`/`onRoomChange` plumbing. Settings tabs read `#/settings/<tab>` (tabs still visible until step 5).
   - Display settings migration (D3).
   - Ships: persistent navigation, no menu button, working back/forward, deep links.
2. **Live**
   - `RoomScreen` frame with `RoomHeader`, mode `Segmented` (Zones and Layout segments route to the old pages until steps 3 and 4), `Inspector`, `ZoomCluster`, `Toast`.
   - `LiveMode` toolbar and inspector; `DisplayLayers`; `SensorSection` + `useSensorDraft` + `PreviewChip`; delete `DeviceSettingsModal`.
   - Canvas: `resolveCanvasCoverage`, single `CoverageLayer`, clip-follow for height cone, container-aspect viewBox, `fitViewport`, screen-constant handle sizes.
   - `DeviceLogsModal` into a `side` `Sheet`.
   - Ships: complaints 2 (cone), 6 (live settings).
3. **Zones**
   - `ZonesMode` toolbar, tools, kind segmented, click-to-place polygon, drag rectangle, points table, Zone shape segmented, recovery and backups sections, D4 snap, D5 undo.
   - Delete the zone drawer and `ZoneEditorPage` shell; logic moves to `pages/room/ZonesMode.tsx`.
   - Ships: complaint 3 (drawing).
4. **Layout**
   - `LayoutMode` toolbar and inspector bodies (room, wall, door, furniture, device). Wall editor, door and furniture editors move into the inspector. Installation-angle suggestion inline.
   - Delete `RoomBuilderPage` shell and its floating panels.
5. **Rooms and Settings**
   - Rooms screen (§2.1) with room actions; Settings single page with section rail; firmware `ChoiceList`; theme in Appearance.
   - Delete `SETTINGS_TABS`, `ThemeSwitcher`, `.light` overrides left in `index.css`.
   - Ships: complaints 1, 5, 8.
6. **Wizard polish**
   - `StepList`, `ChoiceList` device step with lock rows, canvas steps rendered by `RoomScreen` + `StepStrip`, header actions. Delete the duplicated canvas code inside `WizardPage.tsx` and `ZoneEditor.tsx`.

Glyph replacement happens inside each step for the files it touches; step 6 closes the remainder (`EntityDiscovery`, `ep1/*`, `HourlyActivityChart`, `ZoneStatsPanel`).

---

## 7. Phone (< 768 px)

One component tree; layout differences are CSS breakpoints and the `Sheet` variant. Nothing is rendered twice (today's `hidden md:flex` / `md:hidden` pairs go away).

| Element | Desktop | Phone | Where it went |
|---|---|---|---|
| Navigation | sidebar / rail | `TopBar` + `BottomBar` | Settings in bottom bar; Add device and All rooms in the room switcher sheet |
| Room switcher | sidebar list | `TopBar` title button, bottom sheet | |
| Mode switch | header `Segmented` | `BottomBar` items | |
| Toolbar | full row with labels where they fit | one row, icon-only 44 px, horizontal scroll with fade edges; Save/Apply move to sheet peek row | |
| Inspector | right column | `docked` sheet, peek 88 px / half / full | |
| Zoom + / − | `ZoomCluster` | pinch zoom; only Fit button floats | |
| Cursor readout | bottom-left | hidden (`pointer: coarse`) | |
| Layers, Shapes popovers | popover | bottom sheet | |
| Device logs, backups list, entity discovery, furniture library | right `side` sheet | bottom sheet 92dvh | |
| Confirm dialogs | centred dialog | centred dialog, full-width buttons | |
| Settings section rail | sticky left rail | sticky horizontal chip row | |
| Wizard step list | left column | header line + list sheet | |
| Rooms grid | auto-fill grid | one column, 72 px thumbnails | |

Touch rules: 44 px minimum targets, handle hit radius 22 px (§3.3), long-press shows tooltips, two-finger pan (`touchPanEnabled` on `RoomCanvas`), drawing tools treat a single-finger drag as drawing and two fingers as pan. Canvas keeps `min-h-[50dvh]`; when the sheet is at `full`, the canvas is covered and the sheet header shows a `mdiChevronDown` to return to `half`.

---

## 8. Complaint checklist

| Owner complaint (verbatim) | Resolved in |
|---|---|
| "rooms that seem to be associated with everything presence pro" | §2.1 room cards and §1.2 sidebar rows show each room's device model and name, unassigned devices listed; §2.7 wizard shows which room holds a device instead of a greyed card. One device per room unchanged. |
| "I can't see the full cone" | §3.1 clip off by default with migration (D3), height cone follows the flag, hatch outside walls, one coverage resolver with installation angle, fit to room ∪ cone against real container aspect. |
| "Drawing is annoying" | §2.4 tools and kind selector, §3.2 click-to-place polygon and drag rectangle, always-visible handles, points table, snap in inspector with Alt bypass, §3.3 screen-constant handles, §3.4 keyboard, D5 undo. |
| "has an ugly vibe coded emoji button" | §2.8 glyph table to `@mdi/js`, §5.1 `Icon` / `IconButton` with required label and tooltip. |
| "'selected' instead of checkmark or using the ui" | §2.9 (`FirmwareUpdateSection.tsx:2738-2742` "Selected" pill to `ChoiceList` check, and every other text-as-state row), `Segmented` / `Menu` / list rows render `mdiCheck`. |
| "we are already in home assistant so I should be able to change settings and see the effect in the sidebar" | §4 `SensorSection` in the inspector with draft preview on the canvas, Apply, immediate toggles; §2.3 Status updates live next to it. |
| "Choosing a room from top and pressing menu button when already enough space also sucks" | §1.2 persistent sidebar on ≥ lg, rail on md; §1.3 room switcher in the sidebar; Menu button and room `<select>` removed. |
| "I still think this could be done better without so many tabs" | §1.1 three pages become one room screen with a mode switch on one canvas; §2.6 Settings tabs become one page; Rooms tab becomes the Rooms screen; D2 keeps the option to merge Zones and Layout into one Edit mode. |
