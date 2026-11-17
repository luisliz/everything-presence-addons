# Everything Presence Grid: issues and proposed changes

Repo: `/code/cloned/everything-presence-pro-grid` (clone of clintongormley/everything-presence-pro-grid, v1.11.0, git). Paths below are repo-relative. Date: 2026-11-16.

Pending: fork survey and numerics/efficiency audit are still running. Their findings get appended under ISSUES 4 and 5.

---

## ISSUES

### 1. UI

| # | Issue | Where | Root cause |
|---|---|---|---|
| U1 | Every view is stamped with the HA area ("room") | `frontend/src/eppgrid-panel.ts:3182` labels the device picker `name (area)` | No room entity exists. One device = one 20x20 grid = one room. The area name is decoration. |
| U2 | Full radar cone is never visible | `frontend/src/lib/room-geometry.ts:174` (`getVisibleRoomBounds`), used by `epp-grid.ts` `_getScan` (~line 755) | Render window = bounding box of in-range inside cells + 1 cell. The 120° wedge (`constants.ts:456`) is clipped to the painted room. Grid is 20 cells x 300 mm = 6 m = `MAX_RANGE`, so the cone can never extend past the canvas anyway. |
| U3 | Drawing is slow and fiddly | `frontend/src/lib/cell-painting.ts:30-72`, pointer handlers `epp-grid.ts:667-945` | Per-cell brush only. First cell decides set/clear for the stroke. No rectangle, polygon, or flood fill. Cell size is hardcoded at 300 mm (`grid.ts:21`). |
| U4 | Text-glyph "emoji" button | `frontend/src/components/epp-zone-color-picker.ts:214` renders `✎` / `+` in a 15 px bold span | Project already depends on `@mdi/js`; this one component bypassed it. |
| U5 | Selection state shown as styling or text instead of a check | `epp-flasher-view.ts:1535-1565` (model/variant buttons toggle `variant="primary"` only), `epp-zone-sidebar.ts:219,255` (`.active` background only), `epp-overlay-sidebar.ts:109` | No selected-indicator convention in the design system. Owner reports seeing a literal "selected" label somewhere; not found in `translations/en.json`. Needs the exact view. |
| U6 | Settings changes have no live effect | `frontend/src/components/epp-settings-view.ts:209-275` props + `dirty`/`saving` flags | Changes go through a save bar and a backend round trip before anything on the grid or sidebar updates, although client-side classification (`classifyCellInSensor`, `room-geometry.ts:73`) could preview range changes instantly. |
| U7 | Kebab menu hides primary navigation on desktop | `_liveMenuItems` at `eppgrid-panel.ts:2150-2180`; breakpoint 819 px at `:370` | Zones, overlays, furniture, settings, calibration, delete calibration all live behind `epp-kebab-menu` regardless of width. |
| U8 | Device picker as a top dropdown | `_renderHeader`, `eppgrid-panel.ts:3170-3195` | Single `ha-select`; switching devices also resets clipboard and reloads config. Fine for 1 device, wrong for several. |
| U9 | Recalibration wipes all zones | `custom_components/eppgrid/websocket_api/_devices.py:308` discards `room_layout` on `set_setup` | Grid is re-initialised as a centred rectangle (`eppgrid-panel.ts:3070`, `grid.ts:242`). No warning in the wizard. |

### 2. Device capability (which calibration is physically possible)

| Device | Radar | Position data | Calibration possible |
|---|---|---|---|
| Lite | LD2450 | 3 targets, int16 mm XY, 10 Hz, ±60° az, ±35° pitch, 6 m | 4-corner homography (built), N-point least squares (not built), radial range cap |
| Pro | LD2450 + SEN0609 read as a GPIO bit only (`firmware/common/sen0609-base.yaml:6-11`) | same as Lite | same as Lite; SEN0609 min/max/trigger range is blind 1D tuning. Cross-sensor range calibration needs firmware to parse SEN0609 UART. |
| One, rev ≤1.4 | SEN0395 | binary presence only | Range gate in 15 cm steps, verified by walking. Device never reports distance. |
| One, rev ≥1.5 | SEN0609 | one radial distance per 0.3–0.5 s in Distance mode, no angle | Measured 1D range: walk to far wall, read distance, set min/max/trigger. |

- The One is not supported by this repo. `DeviceModel = "pro" | "lite"` (`frontend/src/lib/device-model.ts:21`); no LD2450 YAML in the upstream EP1 firmware tree.
- No device has an IMU. Height and pitch cannot be measured, only absorbed into the fit.
- The raw target stream reaching the panel is already a 1 s rolling median (`firmware/components/epp/epp_component.cpp:66-168`, `:279-289`), published every 200 ms. Per-frame scatter is invisible to the UI.
- Stock EPL firmware exposes LD2450 installation angle ±45° and an upside-down flag. This repo exposes neither.
- Pro PIR GPIO is `internal: true` (`firmware/common/everything-presence-pro-base.yaml:298-300`), so PIR coverage cannot be mapped from the panel.

### 3. Calibration math

| # | Issue | Where | Consequence |
|---|---|---|---|
| M1 | Exact 4-point homography, zero residual | `frontend/src/lib/perspective.ts:9-58` | All marking noise is absorbed into H, including h6/h7. No quality metric is possible. |
| M2 | Wrong physical model | same | A homography is a camera plane-to-plane model. LD2450 error sources are range bias/scale and azimuth offset/scale (polar), and slant range near the sensor. |
| M3 | Unnormalised DLT solve | `perspective.ts:17-18,61-70` | Source only pre-scaled by max |x|, |y|; no centring, no destination scaling. Destination columns ~6000 vs the `1` column. Hartley normalisation is the standard fix. |
| M4 | Degeneracy check is a single absolute pivot `< 1e-12` | `perspective.ts:45` | Bow-tie corner order and near-collinear corners pass and produce a folded or ill-conditioned H. No convexity or det(H) sign check. |
| M5 | Firmware float32 fallback returns raw coords when `|w| < 1e-10` | `firmware/lib/epp_zone_engine/src/epp_calibration.cpp:38-41` | Raw sensor mm leak into room space silently. |
| M6 | Room dimensions computed as if sensor space were metric | `room-geometry.ts:314-344` (`autoComputeRoomDimensions`) | Internally inconsistent with the projective transform. Back wall never used for W. |
| M7 | No spatial hysteresis at cell boundaries | `epp_zone_engine.cpp:386-590`, `frontend/src/lib/zone-engine.ts` | A target standing on a 300 mm boundary flickers between cells and zones. Only temporal hysteresis exists (trigger/renew thresholds, 2-tick gate). |
| M8 | Marginal (per-axis) median, not geometric | `epp_rolling_window.cpp:77-116` | Diagonal motion yields a point no sample was near. |
| M9 | Wizard oversamples | `epp-wizard.ts:172-246`: rAF ~60 Hz for 5 s = ~300 samples of ~25 distinct 200 ms publishes | Median is fine, but "300 samples" is false confidence. No movement detection during capture. |
| M10 | Cell size, extent and range are coupled by accident | `grid.ts:18-22`: 20 x 300 = 6000 = `MAX_RANGE`, not encoded anywhere | Changing cell size silently changes coverage. |
| M11 | `MAX_MOVEMENT_CELLS = 5` is in cells | `epp_types.h:30`, `zone-engine.ts:147` | Continuity distance is 1.5 m only because cells are 300 mm. |
| M12 | Doc drift | `docs/user-guide/calibration.md:65-67` says "averaged" and "movement flagged"; code uses median, flags nothing. `how-detection-works.md:14-15` says metres; everything is mm. | |

### 4. Prior work in forks and related projects

Scope: all 434 upstream PRs, 22 issues, all 5 forks compared against upstream main, official EverythingSmartHome repos, GitHub search, HA forum thread. Upstream main is at #456 (v1.11.0-beta.1); local clone is at #449.

| Topic | Prior work | Status | Reusable |
|---|---|---|---|
| Coverage cone on calibrated grid (U2) | [HaniKazmi 351e9251](https://github.com/HaniKazmi/everything-presence-pro-grid/commit/351e9251): sensor glyph + two 120° rays to max distance on the editor grid, from `computeSensorFov`, clipped by `clipSegmentToWindow`, +233 lines in `epp-grid.ts` | Fork branch `extendable-room-calibration`, never a PR, 223 commits behind, last commit 2026-08-14 | Yes as design reference. Commit message records pitfalls: filled wedge washes out zone colours; clipPath and overflow fail on the overlay svg; svg needs explicit width/height. |
| Grid origin as per-device data, paint any cell, persist walked corners as dashed outline | HaniKazmi [0967e87d](https://github.com/HaniKazmi/everything-presence-pro-grid/commit/0967e87d), [e3d6278c](https://github.com/HaniKazmi/everything-presence-pro-grid/commit/e3d6278c) | Same abandoned branch | Partly; heavy rebase conflicts expected |
| Configurable cell size (C5) | Issue [#364](https://github.com/clintongormley/everything-presence-pro-grid/issues/364) (dup #363) | **Rejected by maintainer**: sensor noise exceeds 30 cm, device memory grows quadratically. Advice: rotate sensor physically. | Direct conflict. A frontend-only snap on top of 30 cm cells may not conflict (unverified). Settle before building if upstreaming is a goal. |
| Toolbar replacing kebab (U7), rectangle/fill tools (U3), live settings preview (U6) | none | | |
| EP1 support (C9) | [Official zone configurator EP1 profile](https://github.com/EverythingSmartHome/everything-presence-addons/blob/main/everything-presence-mmwave-configurator/config/device-profiles/everything_presence_one.json): `distanceOnlyTracking: true`, `zones: false`, `maxRangeMeters: 25`, `fieldOfViewDegrees: 120`; `LiveTrackingPage.tsx` draws distance arcs for max, trigger and live distance | Shipping, no license file | Capability model and entity map, ideas only. No EP1 range-calibration UI exists anywhere. |
| N-point fit with quality reporting (C7) | [ChristophBellmann/ha-radar-occupancy geometry.py](https://github.com/ChristophBellmann/ha-radar-occupancy/blob/main/custom_components/radar_occupancy/geometry.py): least-squares 2D affine from ≥3 pairs, rejects near-collinear (`samples_flat`), RMS residual in mm with 400 mm cutoff (`samples_inconsistent`), singular-value plausibility (stretch 0.5–2.2), `rigid()` pose from mount point + heading | Active, Apache-2.0 | Yes. Constraining affine to similarity is small. |
| Slant-range correction (C7 Δh) | [Moe8383/radar_map_manager radar-math.js](https://github.com/Moe8383/radar_map_manager/blob/main/custom_components/radar_map_manager/www/radar-math.js): `hDiff = |mount − target|` (defaults 2.5 m, 1.2 m), `ground = sqrt(slant² − hDiff²)`, scale x,y by `ground/slant`, before rotation/mirror | Active, MIT, 76★ | Yes, exact formula |
| Height compensation demand | [everything-presence-addons#148](https://github.com/EverythingSmartHome/everything-presence-addons/issues/148) open; maintainer: "would need a Z-axis" | | Shows demand; official tool does not do it |
| Zones in room space so recalibration does not move them (U9) | [everything-presence-addons#387](https://github.com/EverythingSmartHome/everything-presence-addons/issues/387) | Open | Same design concern |
| Drawing-tool UX reference | [mullender/ha-radar-presence](https://github.com/mullender/ha-radar-presence) (MIT, pushed 2026-11-17): polygon/rectangle with 45°/90° edge snap and grid snap, vertex drag, numeric vertex table, undo/redo, FOV as context, "preview before saving" replays history against a draft zone, "fit to points", multi-radar rigid alignment (`engine/align.py`) | Active | Best UX reference for C4 and C8 |
| Other zone editors | fornellas/ld2450-zone-card (LGPL), daredoole/spatial-presence, chicco-carone/ld2450-custom-card, dortizesquivel/mmwave-3d-card, computergeek1507/ep_zones, chris-standley/everything-presence-floorplan-card | | Unrelated or weak |

Uncertainties: upstream gitignores a private `docs/backlog.md` (#440), so the maintainer's roadmap is invisible. Only GitHub forks were checked.

### 5. Numerics and efficiency audit

Simulation scripts in the scratchpad import the repo's real `perspective.ts`. Correction to ISSUES 3 M3: the solve pre-scales the source side; worst round-trip error over 20,000 random calibrations is 5.5e-12 mm. Solver precision is not an issue. float32 vs float64 drift: worst 1.6 µm, 0 cell flips over 339,661 points. Sign-magnitude decode in the firmware YAML is correct for all 16-bit inputs.

Ranked findings:

| # | Finding | Evidence | Fix |
|---|---|---|---|
| N1 | Cell assignment flickers everywhere at σ ≥ 100 mm, not only at edges | 10 Hz iid frames into the 10-frame median: σ=50 mm gives 84/min at the edge, 1.8/min at centre; σ=100 mm gives 53/min at the centre; σ=200 mm gives 128/min. Consequences: dismissals clear on one flicker (`epp_zone_engine.cpp:395-404`), both zones held occupied across a border, heat smears. | Schmitt margin m on cell: m=75 mm cuts σ=50 edge flicker to 11/min, to 0 at d=100 mm. At σ ≥ 100 mm no margin saves 300 mm cells; needs zone-level k-tick debounce. Firmware + TS parity + fixture regen. |
| N2 | Editor preview's overlay tracker runs on 1 s medians while firmware uses raw 10 Hz frames | `epp_component.cpp:279-285` publishes `median_x/y` as "Raw Target"; Stage 2b (`:103-147`) runs on true raw frames. `target-controller.ts:236-264` calls the median stream "authoritative". | Use firmware's `on_overlay` flag from zone-state JSON instead of reimplementing Stage 2b on a smoothed 5 Hz signal. |
| N3 | Frontend zone engine ticks per WS message, not per radar frame | `target-controller.ts:138,227`; backend emits per entity update (`_devices.py:899-963`, 4 `_emit` sites). 3 moving targets = 3 ticks with the same signal; static target = 0 ticks. 2-tick gate completes in 0 ms or never. | Run local engine on a fixed 100 ms timer. |
| N4 | `autoComputeRoomDimensions` copies radar scale bias into W and D | 5% long range reading on a 4000x5000 room yields 4170x5190; a person at (3700,4400) lands in row 15 not 14. Angle compressed x0.9 gives 206 mm residual even with true dims: polar distortion is not projective. No W/D override field in the wizard (`epp-wizard.ts:57,84,251,270,308`). | Optional tape-measured W/D override; homography already takes `roomPts`. |
| N5 | Firmware clock is float32 seconds from uint32 `millis()` | `epp_component.cpp:51`. Resolution 0.125 s at day 12, 0.5 s at day 48. Wrap at 49.7 days: `timestamp - pending_since < 0`, timers never fire, zone stays occupied until re-entry, assisted clear blocked (`epp_zone_engine.cpp:874-876`). | uint32 ms with unsigned subtraction. |
| N6 | Per-axis median can output a point no sample was near | 5 A + 5 B frames give the midpoint; 4 person + 3+3 symmetric multipath frames give a point 2000 mm from every sample. | Snap marginal median to nearest sample (O(n)) or use medoid (256 distances at n=16). |
| N7 | Wizard capture completes early after tab backgrounding | `epp-wizard.ts:188-196` adds the whole hidden duration on the first rAF tick. | `performance.now()`, clamp dt ≤ 100 ms. |
| N8 | Frames drained in one batch share one timestamp | `epp_component.cpp:81,581`. After a stall, k ticks with zero elapsed time. | Timestamp in `TargetFrame` at receipt. |
| N9 | Coverage hatching in room space, firmware range cut in raw space | 0–3 of ~200 in-room cells disagree under distortion. | Classify cell centres through `getInversePerspective`. |
| N10 | Positions published as integer mm; frontend floors rounded values | `%.0f` at `epp_component.cpp:285,306`. ~0.7% of evaluations differ in cell. | `%.1f`. |
| N11 | Python and JS disagree on room columns for non-integer widths | `_connection.py:536-539` truncates then ceils; `grid.ts:219-222` ceils. 3000.4 mm shifts the firmware grid one column. | `math.ceil(room_width / 300)`. |

Efficiency:

| # | Finding | Fix |
|---|---|---|
| E1 | HOT: `epp-grid` rebuilds all ~400 cell templates on every target message (`render()` at `epp-grid.ts:599-680` always calls `_renderVisibleCells`), ~6,000 cell diffs/s with 3 targets; `_renderHeatmap` rebuilds 400 rects per update; `updated()` forces sync layout via `_measureAvail` | Lit `guard()` on cells keyed by grid, scan, cellPx, bounds, zoneConfigs, an occupancy bitmask; same for heatmap; skip `_measureAvail` on target-only updates. Canvas rewrite not recommended: per-cell pointerenter painting and `_readCellRgb` depend on DOM cells. |
| E2 | Integration emits a full `{targets, sensors, zones}` snapshot per entity update, up to 3x per tick per subscriber; zone-state JSON re-parsed per subscriber | Coalesce with a dirty flag + `call_soon(_flush)`. |
| E3 | Heatmap poller per subscriber: N views = N device round-trips every 2 s, 400-int payload even when unchanged | One poller per MAC, skip unchanged bytes. |
| E4 | Firmware: not hot. < 50 µs per frame estimated, no per-frame heap allocation in epp code. NVS heatmap 1600 B/hour. | None. |

Uncertainties: real LD2450 jitter σ and distortion magnitudes are unmeasured; render ms estimates not benchmarked (no node_modules); whether HA coalesces per-entity WS messages into one frame.

### 6. Workflow

- No local dev harness. Only `npm run build` (rollup to `custom_components/eppgrid/frontend/eppgrid-panel.js`) and vitest. Every visual check needs a real Home Assistant.
- Repo is git-only. Owner's workflow is jj.

---

## Changes

Ordered by dependency. Each change names the decision it needs from the owner. UI changes are built by the ux agents (svelte-ux-specialist / ux-design) and reviewed by design-review-agent.

### C0. Environment

1. `jj git init --colocate` in the clone, feature bookmark per change group.
2. Run locally: Home Assistant in Docker (`ghcr.io/home-assistant/home-assistant:stable`) with `custom_components/eppgrid` bind-mounted into `/config/custom_components/eppgrid`. Frontend via `npm run dev` (rollup watch) writing the bundle into the mounted dir; HA serves the panel. Verify with Playwright on `http://localhost:8123`.
3. Without hardware: add a fake device source behind an env flag in `custom_components/eppgrid/device_manager/` that replays a recorded raw-target stream, so the panel can be exercised. **Decision:** build the fake source, or test only against the owner's real device?

### C1. Design-system fixes (no decision needed, mechanical)

- U4: replace `✎`/`+` text with `@mdi/js` icons via `ha-svg-icon` in `epp-zone-color-picker.ts`.
- U5: add a `selected` affordance to `epp-button` (leading check icon when `aria-pressed="true"`) and use it in the flasher model/variant pickers, zone rows and overlay rows.
- M12: fix the two doc sentences.

### C2. Navigation and layout (owner decision: layout shape)

- U7: above 819 px, render the live-view actions as a visible tab strip (Live / Zones / Overlays / Furniture / Settings) with Calibration under a secondary action; kebab only below the breakpoint.
- U1/U8: device picker shows name only, grouped by HA area as `optgroup`; area shown once in the header, not in every label.
- **Decision:** tabs vs left rail. Recommend tabs: matches HA's own panel conventions.

### C3. Coverage view (owner decision: default on/off)

- U2: add a `showCoverage` mode to `epp-grid` that renders the full ±60° wedge to `MAX_RANGE` as a layer under the room, with the room as the overlay. Visible bounds become the union of room and wedge.
- Prerequisite: the wedge is computed in sensor space and mapped through H; under a homography it is no longer a cone (`classifyCellInSensor` assumes it is). Render it as a transformed polygon, not a cell classification.
- **Decision:** on by default in the editor, off in the overview card. Agree?

### C4. Drawing tools (owner decision: tool set)

- U3: add rectangle drag and flood fill to `cell-painting.ts`; keep brush. Shift = rectangle, double-click = fill, or an explicit tool toggle in the sidebar. Toolbar via ux agent.
- **Decision:** which gestures.

### C5. Snap grid as a setting (owner decision: extent policy)

- M10/M11: make cell size a per-device setting (250–600 mm, step 50, default 300). Carry `cell_mm`, `cols`, `rows` on the wire with `set_grid`.
- Hardcode sites to touch: frontend `grid.ts`, `coordinates.ts:48-49`, `room-geometry.ts:97,204-207,429-430`, `furniture.ts:107,126`, `configuration-thumbnail.ts:127-130`, `grid-state-controller.ts:738-739`, `zone-engine.ts:147`; integration `const.py:17-19`, `_connection.py:37,535-539`, `_devices.py:342-346`, `_firmware.py:747`; firmware `epp_types.h:9-12,30`, `epp_grid.h:52` (fixed `std::array`), `epp_component.cpp:692-709,708,876`, `epp_nvs_layout.h:48,59`, `epp_heatmap.h:16-63`, parity fixtures.
- Express `MAX_MOVEMENT_CELLS` in mm (1500) and divide by cell size.
- **Decision:** keep 400 cells and let coverage shrink with smaller cells (no firmware storage change, breaks 6 m rooms at 200 mm), or grow the grid to keep 6 m (200 mm = 900 bytes, 150 mm = 1600 bytes; NVS blob, WS schema, base64 cap and heatmap RAM all change). Recommend: grow, bounded at 250 mm minimum = 24x24 = 576 bytes.

### C6. Cell hysteresis (no UI; firmware + TS parity)

- M7: Schmitt band at cell boundaries. Keep previous cell until the median crosses by h ≈ 1–2σ of jitter (start at 60 mm, measure on hardware). Apply only when the neighbouring cell's zone or overlay differs. Land identically in `epp_zone_engine.cpp` and `zone-engine.ts`; parity tests cover it.

### C7. Calibration model (owner decision: model)

- M1–M6: replace the exact 4-point homography with a least-squares fit plus residual reporting. Options:
  - **Similarity + reflection flag (4 DOF + 1 bit), recommended default.** 2 points exact, ≥3 gives residual. Matches a level wall-mount. Umeyama closed form, no iteration.
  - Polar sensor model (r' = a·r + b, θ' = k·θ + θ0) + rigid pose: 5–7 DOF, Gauss–Newton seeded from the similarity. Advanced option when residuals stay high.
  - Keep homography but Hartley-normalise, add convexity / det sign / w=0-line checks, and fit ≥5 points by least squares. Smallest change, still the wrong physics.
  - Slant-range term Δh (mount height) as an optional +1 DOF on any of the above.
- Wizard changes: show per-corner MAD spread live during capture; show RMS residual after solve; add a "walk the walls" N-point mode (point-to-line least squares on x=0, x=W, y=0, y=D) that produces a quality score; warn before discarding zones (U9) or resample them.
- Firmware: the transform type must be carried with the coefficients (`epp_set_perspective` currently takes exactly 8 floats, `epp_perspective_parser.h:27-77`). A similarity still fits in 8 slots (h6=h7=0), so the wire format can stay if we accept the hack. **Decision:** wire hack vs a versioned transform message.
- Fix M5: on degenerate w, drop the target instead of returning raw coordinates.

### C8. Live settings preview

- U6: apply range and threshold edits to the grid preview immediately via `classifyCellInSensor`; debounce the write 500 ms; keep the save bar for destructive settings only.

### C9. Everything Presence One

- Not a grid device. If EP1 is in scope: new `DeviceModel = "one"`, capability flags `has_xy_targets=false`, `has_distance=true|false`, and a range-tuner view (live distance readout for SEN0609, blind 15 cm gate stepper for SEN0395, sensitivity, latency, PIR timeout). Requires firmware work in this repo that does not exist today.
- **Decision:** in scope for this fork, or separate project?

---

## Decisions needed

1. C0: fake device source for local testing?
2. C2: tabs vs rail.
3. C3: coverage on by default in editor?
4. C4: drawing gestures.
5. C5: grow grid vs shrink coverage.
6. C7: calibration model, and wire format.
7. C9: EP1 in scope?
8. U5: which view shows the literal word "selected"?

---

## 7. Stock firmware entity contract (no-flash path)

Sources: EverythingSmartHome repos at HEAD of main. Pro v1.3.0, Lite v1.5.0, One v1.2.17, Zone Configurator add-on v2.2.5. None use ESPHome's `ld2450` or `dfrobot_sen0395` components; all parse UART in YAML lambdas and publish `template` entities. entity_id pattern: `<domain>.<devname_macsuffix>_<slug>`. DBD = disabled by default (must be enabled in the entity registry before HA receives state).

### Lite and Pro (LD2450)

| Data | Entities | Notes |
|---|---|---|
| Target position | `sensor.*_target_{1,2,3}_x`, `_y` (mm), `_speed` (m/s), `_distance` (mm), `_angle` (°), `_resolution` (mm), `binary_sensor.*_target_N_active` | Enabled, diagnostic. Frame: sensor origin, Y forward, X lateral, mm, already rotated by installation angle on device. Pro negates X when upside-down is OFF (`ld2450-base.yaml:1041`); Lite negates when ON (`:1087`). Set to 0 when target lost. Published only on change. |
| Rate | `select.*_update_speed` 0.1–0.5 s (default 0.3 s), `select.*_target_update_rate` (Pro) / `extra_entities_update` (Lite) every 1/2/3/5/10/20 frames, `select.*_target_tracking_detail` (Pro) / `tracking_behaviour` (Lite) gates which attributes publish | Effective default ~2.5–3.3 Hz per changed attribute; best case 5–10 Hz. No `throttle:` filters. |
| Zones | `text.*_polygon_zone_{1..4}`, `text.*_polygon_exclusion_{1,2}`, `text.*_polygon_entry_{1,2}` | **Polygons, not rectangles.** Format `"x:y;x:y;..."` integer mm in the rotated sensor frame, ≤20 vertices, 255 char default max. Writable via `text.set_value`, restore_value. No rectangle number entities exist in current firmware. |
| Zone outputs | `binary_sensor.*_zone_1_presence` (Pro) / `_zone_1_occupancy` (Lite), zones 2–4 DBD; `sensor.*_zone_N_target_count` (2–4 DBD); exclusion counts DBD | Per-zone timeouts `number.*_zone_N_timeout` / `_occupancy_off_delay` 0–600 s |
| Entry/exit | Pro: `binary_sensor.*_entry_{1,2}_presence`, `event.*_entry_exit_event` (entered/exited/hold). Lite: polygons feed assumed-presence hold only, no entry sensors | |
| Install | `number.*_tracking_sensor_angle` (Pro) / `installation_angle` (Lite) −45..45°, `switch.*_upside_down_mounting`, `number.*_tracking_detection_range` (Pro) / `max_distance` (Lite) 0–600 cm | No multi-target switch; LD2450 stays multi-target. No LD2450 hardware zone control. |
| Pro only | `binary_sensor.*_static_presence` (SEN0609 GPIO), `number.*_static_presence_{min,max,trigger}_range` 0.6–25 m, sensitivities 0–9, `button.*_apply_static_*_settings`, PIR `binary_sensor.*_motion`, temp/humidity, relay, RGB LED | SEN0609 UART only logged; no distance sensor. |
| Services | `esphome.<node>_get_build_flags` (model, sensor_variant, board_revision), `_set_update_manifest` | |

### One

| Variant | Entities |
|---|---|
| All | `binary_sensor.*_occupancy` (mmWave OR PIR), `_pir`, temp, humidity, lux, latency/offset numbers |
| SEN0395 stable | `binary_sensor.*_mmwave`, `number.*_mmwave_distance` 0–800 cm step 15, `_mmwave_sensitivity` 0–9, on/off latency. No distance readout. |
| SEN0395 beta builds | adds `number.*_mmwave_zone_{1..4}_start/_end` (cm, step 15), `sensor.*_target_{1..4}_distance` (m), `_snr`, `binary_sensor.*_target_N_active`, published every frame |
| SEN0609 | `binary_sensor.*_mmwave`; in `select.*_mmwave_mode` = "Distance and Speed": `sensor.*_mmwave_target_distance` (m), `_speed`, `_energy`, `_count` (all DBD), rate `select.*_distance_speed_update_rate` 0.3/0.4/0.5 s; `number.*_mmwave_{minimum,max,trigger}_distance` (m), sensitivities, `button.*_set_distance` / `_set_sensitivity` (writes happen only on button press) |

### Zone Configurator add-on (proof of feasibility)
Reads via HA websocket `get_states` + `subscribe_events` + registries; writes only via HA services (`text.set_value`, `number.set_value`, `select.select_option`, `switch`, `button.press`). Renames entity friendly names via `config/entity_registry/update`. Has a read-only ESPHome native-API client for logs only.

Uncertainties: LD2450 10 Hz frame rate inferred; Pro angle unit is `º` (U+00BA) not `°`, which affects slugs; add-on profiles list rectangle numbers (`required: false`) that current firmware lacks, presumably older firmware.
