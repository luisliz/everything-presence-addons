# Rewrite proposal: stock-firmware Everything Presence panel

Repo: in-place rewrite of the `everything-presence-pro-grid` fork. Date 2026-11-16. Status: proposal, awaiting owner decision.

Decisions already taken: all three devices (One, Lite, Pro); stock firmware only, owner updates it over OTA; hand-drawn rooms first; Lit 3 panel; delete dead code, keep `firmware/` in tree as an archive.

---

## 1. Data path

```
device (stock ESPHome)  --native API (aioesphomeapi), states + service calls-->  integration
integration  --HA websocket (eppgrid/*)-->  panel
integration  --binary_sensor / sensor platforms-->  HA entities for automations
```

**Reads: native API, not the HA state machine.** The integration already owns `DeviceConnection` (`custom_components/eppgrid/device_manager/_connection.py:101`) with `subscribe_states`. Reasons to keep that path for the stock entities:
- Disabled-by-default entities (zones 2–4, target diagnostics on the One) still stream over the native API. Through the state machine they do not exist until enabled.
- No per-entity `state_changed` event overhead for 6 to 18 target attributes at up to 10 Hz.
- The official Zone Configurator add-on uses the same dual-client pattern for its log stream, so a second API client per device is a known-good configuration.

**Writes: native API too**, through the existing `async_execute_service` path extended with `text_command`, `number_command`, `select_command`, `switch_command`, `button_command`. One connection, one source of truth. HA still shows the resulting entity state because the ESPHome integration gets the same state push.

**Also enable the DBD entities in the registry** on first setup (`er.async_update_entity(disabled_by=None)`), so users' automations can use `zone_2_presence` etc. The official add-on does not do this and users hit it as a bug.

## 2. Device model

```python
class DeviceModel(StrEnum):
    PRO = "pro"          # LD2450 + SEN0609 + PIR
    LITE = "lite"        # LD2450
    ONE_SEN0395 = "one_sen0395"
    ONE_SEN0609 = "one_sen0609"

@dataclass(frozen=True)
class Capabilities:
    xy_targets: bool        # Pro, Lite
    polygon_zones: int      # 4 on Pro/Lite, 0 on One
    exclusion_zones: int    # 2 / 0
    entry_zones: int        # 2 on Pro/Lite (Lite: hold only, no sensors)
    entry_events: bool      # Pro only
    static_presence: bool   # Pro
    pir: bool               # Pro, One
    distance_readout: bool  # One SEN0609 (Distance mode), One SEN0395 beta
    range_gate_step_cm: int | None   # 15 on SEN0395, None elsewhere
```

Detection: `esphome.<node>_get_build_flags` returns `model` and `sensor_variant`; fall back to entity-key sniffing (`polygon_zone_1` present → LD2450; `mmwave_mode` present → SEN0609).

**Entity binding.** Never by name slug (Pro angle unit is `º`, U+00BA). Bind by native-API entity `object_id`/`key` from `list_entities_services`, matched against a per-model table in `device_manager/stock_entities.py`:

```python
STOCK = {
  DeviceModel.PRO: {
    "target_x": ("sensor", "target_{n}_x"), "target_y": ("sensor", "target_{n}_y"),
    "target_active": ("binary_sensor", "target_{n}_active"),
    "polygon_zone": ("text", "polygon_zone_{n}"), "polygon_exclusion": ("text", "polygon_exclusion_{n}"),
    "polygon_entry": ("text", "polygon_entry_{n}"),
    "zone_presence": ("binary_sensor", "zone_{n}_presence"), "zone_count": ("sensor", "zone_{n}_target_count"),
    "install_angle": ("number", "tracking_sensor_angle"), "upside_down": ("switch", "upside_down_mounting"),
    "max_range_cm": ("number", "tracking_detection_range"), "update_speed": ("select", "update_speed"),
    "detail": ("select", "target_tracking_detail"), "decimation": ("select", "target_update_rate"),
    ...
  },
  DeviceModel.LITE: { ... "zone_presence": ("binary_sensor", "zone_{n}_occupancy"), "install_angle": ("number", "installation_angle"), "max_range_cm": ("number", "max_distance"), "detail": ("select", "tracking_behaviour"), "decimation": ("select", "extra_entities_update") },
  DeviceModel.ONE_SEN0609: { "presence": ("binary_sensor", "mmwave"), "distance_m": ("sensor", "mmwave_target_distance"), "mode": ("select", "mmwave_mode"), "min_m": ("number", "mmwave_minimum_distance"), "max_m": ("number", "mmwave_max_distance"), "trigger_m": ("number", "mmwave_trigger_distance"), "apply_distance": ("button", "set_distance"), ... },
  DeviceModel.ONE_SEN0395: { "presence": ("binary_sensor", "mmwave"), "max_cm": ("number", "mmwave_distance"), "sensitivity": ("number", "mmwave_sensitivity"), ... },
}
```

## 3. Storage schema (HA `Store`, new version 5, no migration from v4: the v4 data describes custom-firmware grids and is discarded)

```jsonc
{
  "rooms": {
    "<room_id>": {
      "name": "Living room",
      "area_id": "living_room",            // HA area, optional
      "outline_mm": [[0,0],[4200,0],[4200,5100],[0,5100]],   // polygon, room space, y down from front wall
      "openings": [{"kind":"door","a":[1200,5100],"b":[2100,5100]}],
      "sensors": ["<mac>", ...],
      "zones": [
        {"id":"z1","name":"Sofa","polygon_mm":[[...]],"color":"#...","timeout_s":30,
         "device_slot": {"mac":"<mac>","slot":1} | null,   // null = HA-side only
         "kind": "zone" | "exclusion" | "entry"}
      ]
    }
  },
  "sensors": {
    "<mac>": {
      "room_id": "<room_id>",
      "model": "pro",
      "calibration": {
        "model": "similarity",             // "similarity" | "homography"
        "params": {"s":1.02,"theta":0.031,"tx":2100,"ty":0,"mirror":false},
        "slant_dh_mm": 0 | null,           // optional slant correction
        "samples": [{"sensor":[x,y],"room":[x,y],"mad":[sx,sy]}],
        "rms_mm": 84, "fitted_at": "2026-11-16T.."
      },
      "install_angle_deg": 0, "upside_down": false,  // what we wrote to the device; fit assumes these
      "hysteresis_mm": 75
    }
  },
  "ui": {"sidebar_panel": true}
}
```

Zones live in room space. Recalibration refits the transform and rewrites device polygons; zones do not move. Multi-sensor rooms work because every sensor maps into the same room space.

## 4. Calibration math (`custom_components/eppgrid/geometry/` in Python, mirrored in `frontend/src/lib/geometry/` for live preview, parity-tested from one JSON fixture set)

- **Default: 2D similarity with reflection** (Umeyama closed form). Params `s, θ, tx, ty, mirror`. Needs ≥2 correspondences; ≥3 gives residual. Report RMS and per-point residual.
- **Optional: homography** (Hartley-normalised DLT, least squares over ≥4 points, convexity and det-sign checks). For users whose fit residual stays high.
- **Optional slant correction**: `ground = sqrt(slant² − Δh²)` applied radially before the fit, Δh from a mount-height field.
- Device install angle and upside-down are set to 0 / off before fitting and locked; the fit absorbs them. If a user changes them later, the integration refits from stored samples or warns.
- **Capture**: per corner, collect target XY while exactly one target is active and `|velocity| < 0.15 m/s` for 3 s, use per-axis median, record MAD as the spread. Tape-measure override for room W/D stays available since the outline is drawn, not inferred.
- **Device write-back**: zone polygons in room mm → inverse transform → sensor mm → clamp to int, drop collinear points, cap at 20 vertices by Visvalingam simplification, serialize `x:y;x:y`, verify length ≤ 255 chars, write via `text_command`.

## 5. Zone engine (`custom_components/eppgrid/engine/`)

Per room, ticks every 100 ms on `async_track_time_interval`, not per state change (stock stream publishes only on change; a still person produces no updates).

- Input: latest transformed target positions from every sensor in the room, plus device zone states for slots that are device-evaluated.
- Per target: cell-free polygon membership with a Schmitt margin: stay in the current zone until the point is `hysteresis_mm` outside its polygon.
- Per zone: occupancy with per-zone timeout; target count; for `device_slot` zones, the device's own `zone_N_presence` is authoritative and the HA computation is preview only.
- Outputs via `binary_sensor` and `sensor` platforms: `binary_sensor.<room>_<zone>_occupancy`, `sensor.<room>_<zone>_targets`, `binary_sensor.<room>_occupancy`, assigned to the room's HA area.
- Multi-sensor: targets from two sensors within 400 mm are merged as one person (nearest-neighbour, configurable).

## 6. Websocket API (replaces the 32 commands)

| Command | Purpose |
|---|---|
| `eppgrid/subscribe_devices` | device list, model, capabilities, availability, firmware version |
| `eppgrid/subscribe_room/{room_id}` | one stream: transformed targets (≤10 Hz), zone states, device zone states, raw sensor readings for the One (distance, presence) |
| `eppgrid/subscribe_raw/{mac}` | raw sensor XY for the calibration wizard |
| `eppgrid/rooms/*` | create, update outline/openings/zones, delete, assign sensor |
| `eppgrid/calibrate/{mac}` | start capture, add point, fit, commit |
| `eppgrid/device_settings/{mac}` | read and write stock knobs (ranges, sensitivities, update speed, timeouts), with the write confirmed by the echoed state |
| `eppgrid/push_zones/{room_id}` | write room zones to device polygon slots, return per-slot result |

## 7. Panel (Lit 3, `frontend/src/`)

Keep: `ui/` primitives (`epp-button`, `epp-field`, `epp-toggle`, `epp-card`, `epp-dialog`, `epp-tooltip`, `epp-info-tip`, `epp-sheet`, `select.ts`), `localize.ts`, `lib/view-hash.ts`, `lib/tablist-nav.ts`, `lib/document-listeners.ts`, `lib/floor-plan.ts` (image underlay, for the later image import), `panel-mount-guard.ts`, test setup.

New views, one tab strip on desktop (U7 fix), bottom sheet on mobile:

| View | Content |
|---|---|
| Rooms | list of rooms grouped by HA area; create; assign sensors. Device picker gone (U1/U8). |
| Room editor | SVG canvas in metres: outline polygon (draw, drag vertices, snap to 100 mm and to 90°), openings, sensor glyph with its full ±60° coverage wedge mapped through the fit (U2), zones as polygons with rectangle and polygon tools and vertex drag (U3), live targets with trails. Zone list panel with check-icon selection (U5). |
| Calibrate | wizard per sensor: pick model-appropriate flow. LD2450: mark ≥3 points by standing at marked spots on the outline (corners or wall points), live MAD, fit, RMS, accept. One: range tuner with live distance arc, min/max/trigger sliders, apply button. |
| Settings | per sensor stock knobs; range and timeout edits preview on the canvas immediately (U6), written on debounce. |
| Live | read-only room view with zone states, for wall tablets. |

Icons via `@mdi/js` only (U4).

## 8. Deletions (keep `firmware/` as archive, excluded from CI)

Remove:
- `custom_components/eppgrid/`: `firmware_cache.py`, `firmware_proxy.py`, `repairs.py` (firmware-version repairs), `websocket_api/_firmware.py`, `_flasher.py`, `_overview.py` (card), `_durable_stream.py` (re-evaluate), `device_groups/` (replaced by rooms), heatmap paths in `_connection.py` and `device_manager/__init__.py`, OTA paths in `device_manager/__init__.py` (lines 746–1335), zone-entity renaming (3212–3340), `services.yaml` clear_heatmap.
- `frontend/src/`: `components/epp-grid.ts`, `epp-wizard.ts`, `epp-flasher-view.ts`, `epp-furniture-*`, `epp-overlay-sidebar.ts`, `epp-zone-sidebar.ts`, `epp-live-sidebar.ts`, `epp-device-group-editor.ts`, `epp-device-source-list.ts`, `epp-settings-view.ts`, `epp-configuration-dialogs.ts`, `eppgrid-card*.ts`, `card/`, `controllers/flasher-controller.ts`, `usb-flash-flow.ts`, `grid-state-controller.ts`, `target-controller.ts`, `lib/grid.ts`, `cell-painting.ts`, `zone-engine.ts`, `heatmap.ts`, `furniture*.ts`, `perspective.ts` (kept as a test oracle only), `usb-flash-service.ts`, `improv-serial.ts`, `config-serialization.ts`, `configuration-thumbnail.ts`.
- `.github/workflows/firmware.yml`, `firmware-release.yml`; `tests/test_firmware_*`, `tests/test_connection_heatmap_*`, `tests/test_device_manager_flasher.py`.
- `docs/` rewritten later; not in the first milestones.

The Lovelace overview card is dropped in the first pass. It can return as a read-only room view later.

## 9. Milestones

| # | Deliverable | Verifies |
|---|---|---|
| M0 | `jj git init --colocate`, fork remote, `.proj/` scaffold, HA-in-Docker dev harness with the three real devices, deletions above, build and tests green | the repo runs against stock firmware with nothing to show yet |
| M1 | Device discovery and model detection, stock entity binding, raw target stream to a bare canvas, One distance readout | all three devices visible in the panel |
| M2 | Rooms: outline drawing, storage, HA area link; sensor placed in room; coverage wedge | room editor usable |
| M3 | Calibration: similarity fit with residuals, wizard, One range tuner | sensor targets land on the outline |
| M4 | Zones: drawing tools, device polygon write-back, HA-side engine with hysteresis, entities | automations work |
| M5 | Settings with live preview, live view, mobile sheet, docs | feature complete |

Each milestone ends with a design-review-agent pass on the UI it adds and a `/integration` audit.

## 10. Open items for the owner

1. Fork URL for the remote.
2. Reads over native API (proposed) vs HA state machine. The state-machine path is simpler but needs DBD entities enabled before any data arrives and caps at the event bus rate.
3. Drop the Lovelace card in the first pass. Agree?
4. Store version 5 with no migration from v4 grids. Agree?
