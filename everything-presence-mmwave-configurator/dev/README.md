# Local dev without Home Assistant

`dev/fake-ha/server.mjs` is a fake Home Assistant (REST + websocket) on `127.0.0.1:8124`, seeded with five Everything Presence devices. The backend runs against it in standalone mode.

## Start and stop

1. Run `npm run dev:local` (or `dev/run-local.sh`) from the configurator root.
2. Open http://127.0.0.1:42069.
3. Run `dev/stop-local.sh` when done.

`run-local.sh` builds `frontend/dist` only when it is missing. Run `npm run build --workspace frontend` yourself after frontend changes, or run `npm run dev --workspace frontend` for Vite hot reload.

Logs and pid files go to `dev/.logs/`. Backend data goes to `backend/data/`. Delete `backend/data/` to start from an unmapped state.

## Seeded devices

| Device | Entity prefix | Firmware | Zone model | State |
|---|---|---|---|---|
| Everything Presence Pro 225500 | `everything_presence_pro_225500` | 1.1.3 | rectangles | 2 moving targets |
| Everything Presence Lite aed0c8 | `everything_presence_lite_aed0c8` | 1.3.0 | rectangles | 1 moving target |
| Office ep1 (Lite 603ea4) | `office_office_ep1` | 1.5.0 | polygon text | 1 moving target |
| EP1 Living Room (Lite 625a98) | `living_room_ep1_living_room` | 1.5.0 | polygon text | all `unavailable` |
| Everything Presence One abc123 | `everything_presence_one_abc123` | 1.3.2 | none | static |

The fake HA generates each entity set from `config/device-profiles/*.json`, filtered per firmware generation. Device and entity registry ids derive from the MAC, so they stay stable across restarts and the backend mappings in `backend/data/` stay valid.

## Behaviour

- The fake HA keeps all state in memory. A restart resets zones and settings to the seed.
- Targets move on smooth paths inside the 6 m / 120 degree cone every 300 ms. Zone counts, zone occupancy and occupancy follow the current zone entities, so a saved zone changes occupancy on the next tick.
- Writes (`number`, `text`, `select`, `switch`, `light`, `button`) update state and emit `state_changed`. Out-of-range numbers return HTTP 400, as HA does.
- History (`/api/history/period`) holds a 20 minute backfill plus everything since start, so the heatmap has data immediately.

## Knobs

| Env var | Default | Effect |
|---|---|---|
| `FAKE_HA_PORT` | `8124` | Listen port |
| `FAKE_HA_TICK_MS` | `300` | Simulation tick |
| `FAKE_HA_TIME_SCALE` | `2.5` | Target walking speed multiplier |
| `FAKE_HA_BACKFILL_MINUTES` | `20` | History generated at boot |
| `FAKE_HA_TOKEN` | unset | When set, the fake HA rejects any other token |
| `PORT` | `42069` | Backend port |

Poke a state directly: `curl -X POST -H 'Authorization: Bearer fake' -d '{"state":"unavailable"}' http://127.0.0.1:8124/api/states/<entity_id>`.
