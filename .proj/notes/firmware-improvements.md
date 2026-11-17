# Firmware improvements worth proposing upstream

Observed while building the configurator UI against stock Everything Presence firmware (Pro 1.1.3 and 1.3.0, Lite 1.3.0 and 1.5.0, One 1.3.2). Each item names the symptom in the app and the firmware change that would remove it. These are candidates for a future plan, not commitments.

## Entity state and discovery

1. **Occupancy and polygon text entities report `unknown` after a Home Assistant restart until the next change.** The app then shows "No presence data" and empty zone slots. Fix: publish the initial state of every binary sensor and text entity on API connect (`publish_initial_state: true` on binary sensors, an `on_boot`/`on_client_connected` publish for the polygon text entities).
2. **Pre-polygon firmware has no `get_build_flags` service.** Model detection falls back to entity sniffing. Fix: ship the service on every model, returning model, variant and capability flags (polygon zones, entry zones, static presence).
3. **Zones 2 to 4 entities are disabled by default in the entity registry.** The app has to enable them before reading or writing. Fix: enable them by default, or publish a single JSON text sensor with all zone geometry.
4. **Rectangle zone geometry is eight `number` entities per zone.** A save is eight writes with no atomicity. Fix: one `text` entity per zone with `x1:y1;x2:y2` like the polygon firmware, or accept a JSON blob through a service call.
5. **Pro `exclusion_zone_1` defaults to a zero-size rectangle at -6000,-1560.** It reads as "empty" only because the app skips zero-size zones. Fix: default all unused zones to all-zero.

## Tracking quality

6. **Target coordinates are published every update (`extra_entities_update: Every update`) through Home Assistant's state machine.** That costs recorder writes and websocket traffic at up to 10 Hz per entity. Fix: a single `target_positions` text sensor (`i:x:y:speed;...`) or a native API event, with the per-target sensors kept for automations at a lower rate.
7. **No per-target "active" on the Pro** (the Lite has `target_{n}_active`). The app infers activity from non-zero coordinates. Fix: publish `target_{n}_active` on the Pro too.
8. **Stale targets.** The LD2450 keeps reporting the last position for a while; the firmware's stale-target reset is opt-in. Fix: publish a `target_{n}_age_ms` or clear coordinates when a target drops, so clients need no heuristic.
9. **Angular noise grows with range (about r times the angular sigma).** A firmware-side exponential or median filter with a configurable window, exposed as a number entity, would let the app stop smoothing client-side.

## Calibration and installation

10. **Installation angle is a single number applied by the firmware to zones but not to the published raw coordinates on older builds.** Clients must know which build rotates what. Fix: document and publish a `coordinate_frame` text sensor (`raw` or `rotated`) so the app can stop special-casing versions.
11. **No calibration primitive.** A `calibrate_point` service (device x,y plus known room x,y) with firmware-side similarity fit (scale, rotation, mirror, offset) would make every client's drawing agree with the floor. See the calibration math in `.proj/reports/legacy-audit.md`.
12. **Ceiling mount uses zone slots as distance slices.** Fix: a `mount_type` select and native slice entities, so the four zone slots stay available for real zones on ceiling installs.

## Diagnostics

13. **`reset_reason` showed `exception/panic` on the Pro while a second native-API client was attached.** Fix: publish free heap and API client count as diagnostic sensors so clients can see memory pressure before the device reboots.
14. **Firmware version is only in the device registry `sw_version` string** ("1.1.3 (ESPHome 2025.10.5)"). Fix: a `firmware_version` text sensor with just the project version.
