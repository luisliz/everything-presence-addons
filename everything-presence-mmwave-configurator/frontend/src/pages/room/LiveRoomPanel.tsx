import {
  mdiAccount,
  mdiLightbulbOnOutline,
  mdiLinkVariant,
  mdiRefresh,
  mdiSync,
  mdiWifiOff,
} from '@mdi/js';
import { type ReactNode, useEffect } from 'react';
import { EP1Dashboard } from '../../components/EP1Dashboard';
import { HeatmapLegend } from '../../components/HeatmapLegend';
import { HourlyActivityChart } from '../../components/HourlyActivityChart';
import {
  Badge,
  Button,
  cx,
  Icon,
  IconButton,
  Note,
  Panel,
  Segmented,
  StatusDot,
} from '../../components/primitives';
import { ZoneStatsPanel } from '../../components/ZoneStatsPanel';
import { navigate } from '../../router';
import type { DisplaySettingsApi } from './DisplayLayers';
import { stateLabel, useNow } from './presence';
import { SENSOR_SECTION_ID, SensorSection } from './SensorSection';
import type { RoomFrame } from './types';
import type { LiveRoom } from './useLiveRoom';

export const ZONE_STRIPE: Record<string, string> = {
  regular: 'bg-zone-regular',
  exclusion: 'bg-zone-exclusion',
  entry: 'bg-zone-entry',
};

const HEATMAP_PERIODS = [
  { value: '1', label: '1 h' },
  { value: '6', label: '6 h' },
  { value: '24', label: '24 h' },
  { value: '72', label: '3 d' },
  { value: '168', label: '7 d' },
] as const;

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-center justify-between gap-3 py-1 text-sm">
    <span className="text-fg-muted">{label}</span>
    <span className="flex items-center gap-1.5 tabular-nums text-fg">
      {children}
    </span>
  </div>
);

const ActiveRow = ({
  label,
  active,
  unavailable,
}: {
  label: string;
  active?: boolean;
  unavailable?: boolean;
}) => (
  <Row label={label}>
    <StatusDot state={unavailable ? 'offline' : active ? 'online' : 'none'} />
    {unavailable ? 'Unavailable' : active ? 'Active' : 'Inactive'}
  </Row>
);

const Suggestions = ({ frame }: { frame: RoomFrame }) => {
  const points = frame.room.roomShell?.points ?? [];
  if (points.length < 3)
    return (
      <Note tone="info" icon={mdiLightbulbOnOutline}>
        Draw the room outline to get settings suggestions for this room.
      </Note>
    );
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const widthM = (Math.max(...xs) - Math.min(...xs)) / 1000;
  const depthM = (Math.max(...ys) - Math.min(...ys)) / 1000;
  const diagonalM = Math.hypot(widthM, depthM);
  const optMax = Math.min(Math.ceil(diagonalM * 1.1), 25);
  const optTrigger = Math.round(optMax * 0.75 * 10) / 10;
  const optSensitivity = widthM * depthM > 20 ? 6 : 7;
  const config = frame.liveState?.config;
  const metres = (cm: number | null | undefined) =>
    typeof cm === 'number' ? `${(cm / 100).toFixed(1)} m` : 'n/a';
  const tips = [
    `Room ${widthM.toFixed(1)} × ${depthM.toFixed(1)} m, diagonal ${diagonalM.toFixed(1)} m.`,
    `Max distance ${metres(config?.distanceMax)}; about ${optMax} m covers this room.`,
    `Trigger distance ${metres(config?.triggerDistance)}; about ${optTrigger} m suits this room.`,
    `Sensitivity ${config?.sensitivity ?? 'n/a'}; ${optSensitivity} suits a room this size.`,
    diagonalM > 8 &&
      'Large room: a higher sensitivity improves coverage at the far wall.',
    diagonalM < 4 && 'Small room: a lower sensitivity reduces false positives.',
    config?.mode === 'Presence Detection' &&
      'Presence mode reports occupancy only and keeps the radar quiet.',
    config?.mode === 'Distance and Speed' &&
      'Distance and speed mode reports the target distance.',
  ].filter((tip): tip is string => Boolean(tip));
  return (
    <div className="space-y-2">
      {tips.map((tip) => (
        <Note key={tip} tone="info" icon={mdiLightbulbOnOutline}>
          {tip}
        </Note>
      ))}
    </div>
  );
};

export interface LiveRoomPanelProps {
  frame: RoomFrame;
  live: LiveRoom;
  display: DisplaySettingsApi;
  /** `sensor` when the device marker is selected: Sensor open, the rest collapsed. */
  focus?: 'sensor';
}

export const LiveRoomPanel = ({
  frame,
  live,
  display,
  focus,
}: LiveRoomPanelProps) => {
  const { room, liveState, offline, selection, select, stateSince } = frame;
  const now = useNow();
  const occupied = Boolean(liveState?.presence);
  const presenceUnknown =
    Boolean(liveState) && liveState?.presence === undefined;
  const sensorFocus = focus === 'sensor';

  useEffect(() => {
    if (sensorFocus)
      document
        .getElementById(SENSOR_SECTION_ID)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [sensorFocus]);

  const regularZones = live.zones.filter((zone) => zone.kind === 'regular');
  const heatmap = live.heatmap.data;

  return (
    <>
      <Panel
        key={`status-${sensorFocus}`}
        variant="section"
        title="Status"
        collapsible={sensorFocus}
        defaultOpen={!sensorFocus}
        className="border-t-0"
      >
        <div className="space-y-3">
          {!room.deviceId && (
            <Note
              tone="info"
              title="No device linked"
              actions={
                <Button
                  size="sm"
                  icon={mdiLinkVariant}
                  onClick={() => navigate({ name: 'wizard' })}
                >
                  Link a device
                </Button>
              }
            >
              Link an Everything Presence device to see live presence here.
            </Note>
          )}
          {live.needsResync && (
            <Note
              tone="warning"
              title="Entity mappings are not set up"
              actions={
                <Button size="sm" icon={mdiSync} onClick={frame.openResync}>
                  Re-sync
                </Button>
              }
            >
              Live values and settings need the device's Home Assistant
              entities.
            </Note>
          )}
          {room.deviceId && (
            <div className="flex items-center gap-3">
              {offline ? (
                <Icon
                  path={mdiWifiOff}
                  size={24}
                  className="text-warning-ink"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className={cx(
                    'h-3 w-3 shrink-0 rounded-full',
                    occupied
                      ? 'bg-accent'
                      : presenceUnknown
                        ? 'border-2 border-warning'
                        : 'border-2 border-fg-subtle',
                  )}
                />
              )}
              <output className="text-2xl font-medium text-fg">
                {offline
                  ? 'Offline'
                  : presenceUnknown
                    ? 'No presence data'
                    : liveState
                      ? stateLabel(occupied, stateSince.presence ?? null, now)
                      : 'Waiting for data'}
              </output>
            </div>
          )}
          {liveState && !live.isEP1 && (
            <div className="divide-y divide-line">
              <Row label="Targets">{frame.targetPositions.length}</Row>
              {liveState.assumedPresent && (
                <Row label="Entry and exit">
                  <Badge tone="accent">
                    Assumed present
                    {liveState.assumedPresentRemaining !== undefined &&
                      `, ${Math.round(liveState.assumedPresentRemaining)} s left`}
                  </Badge>
                </Row>
              )}
              {liveState.pir !== undefined && (
                <ActiveRow
                  label="PIR"
                  active={liveState.pir}
                  unavailable={liveState.availability?.pir === 'unavailable'}
                />
              )}
              {room.profileId === 'everything_presence_pro' &&
                liveState.mmwave !== undefined && (
                  <ActiveRow
                    label="Static presence"
                    active={liveState.mmwave}
                    unavailable={
                      liveState.availability?.mmwave === 'unavailable'
                    }
                  />
                )}
              {typeof liveState.illuminance === 'number' && (
                <Row label="Light">
                  {liveState.illuminance.toFixed(1)}{' '}
                  {live.mapping?.entityUnits?.illuminance || 'lx'}
                </Row>
              )}
              {typeof liveState.temperature === 'number' && (
                <Row label="Temperature">
                  {liveState.temperature.toFixed(1)}
                  {live.mapping?.entityUnits?.temperature || '°C'}
                </Row>
              )}
              {typeof liveState.co2 === 'number' && (
                <Row label="CO₂">
                  {Math.round(liveState.co2)}{' '}
                  {live.mapping?.entityUnits?.co2 || 'ppm'}
                </Row>
              )}
            </div>
          )}
          {regularZones.length > 0 && (
            <ul className="grid grid-cols-2 gap-2" aria-label="Zones">
              {regularZones.map((zone) => {
                const pressed =
                  selection.kind === 'zone' && selection.id === zone.id;
                return (
                  <li key={zone.id}>
                    <button
                      type="button"
                      aria-pressed={pressed}
                      onClick={() => select({ kind: 'zone', id: zone.id })}
                      className={cx(
                        'flex w-full items-stretch gap-2 overflow-hidden rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                        pressed
                          ? 'border-accent bg-accent-tint'
                          : 'border-line bg-surface-2 hover:bg-surface-3',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cx('w-1 shrink-0', ZONE_STRIPE[zone.kind])}
                      />
                      <span className="min-w-0 flex-1 py-2 pr-2">
                        <span className="block truncate text-sm font-medium text-fg">
                          {zone.label}
                        </span>
                        <span
                          className={cx(
                            'flex items-center gap-1 text-xs',
                            zone.occupied ? 'text-accent-ink' : 'text-fg-muted',
                          )}
                        >
                          {zone.occupied && (
                            <Icon path={mdiAccount} size={16} />
                          )}
                          {zone.occupied ? 'Occupied' : 'Clear'}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {live.isEP1 && (
            <EP1Dashboard
              room={room}
              liveState={liveState}
              entityUnits={live.mapping?.entityUnits}
            />
          )}
          {liveState && (
            <p className="text-xs text-fg-subtle">
              Updated {new Date(liveState.timestamp).toLocaleTimeString()}
            </p>
          )}
        </div>
      </Panel>

      <SensorSection
        key={`sensor-${sensorFocus}`}
        sensor={frame.sensor}
        draft={frame.draft}
        offline={offline}
        hasDevice={Boolean(room.deviceId)}
        defaultOpen={sensorFocus}
        onResync={frame.openResync}
      />

      {live.supportsHeatmap && (
        <Panel
          key={`activity-${display.heatmapEnabled}-${sensorFocus}`}
          variant="section"
          title="Activity"
          collapsible
          defaultOpen={display.heatmapEnabled && !sensorFocus}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Segmented
                size="sm"
                ariaLabel="Heatmap time period"
                value={String(display.heatmapHours)}
                onChange={(value) => display.setHeatmapHours(Number(value))}
                options={HEATMAP_PERIODS}
              />
              <IconButton
                icon={mdiRefresh}
                label="Refresh heatmap"
                size="sm"
                busy={live.heatmap.loading}
                disabled={!display.heatmapEnabled}
                onClick={live.heatmap.refresh}
              />
            </div>
            <div>
              <label
                htmlFor="heatmap-threshold"
                className="flex justify-between text-sm text-fg-muted"
              >
                Threshold
                <output htmlFor="heatmap-threshold" className="tabular-nums">
                  {Math.round(display.heatmapThreshold * 100)}%
                </output>
              </label>
              <input
                id="heatmap-threshold"
                type="range"
                min={0}
                max={50}
                value={display.heatmapThreshold * 100}
                onChange={(event) =>
                  display.setHeatmapThreshold(Number(event.target.value) / 100)
                }
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-xs text-fg-subtle">
                <span>More detail</span>
                <span>Less noise</span>
              </div>
            </div>
            {!display.heatmapEnabled && (
              <p className="text-sm text-fg-muted">
                Turn on the heatmap in the toolbar to load activity.
              </p>
            )}
            {display.heatmapEnabled && !heatmap?.zoneStats?.length && (
              <HeatmapLegend visible />
            )}
            {display.heatmapEnabled &&
              heatmap?.zoneStats &&
              heatmap.zoneStats.length > 0 && (
                <ZoneStatsPanel data={heatmap} visible />
              )}
            {display.heatmapEnabled && heatmap?.hourlyBreakdown && (
              <HourlyActivityChart data={heatmap.hourlyBreakdown} visible />
            )}
            {live.recorded.length > 0 && (
              <p className="text-sm text-fg-muted">
                {live.recorded.length} points recorded
              </p>
            )}
          </div>
        </Panel>
      )}

      {live.isEP1 && (
        <Panel
          key={`suggest-${sensorFocus}`}
          variant="section"
          title="Suggestions"
          collapsible
          defaultOpen={false}
        >
          <Suggestions frame={frame} />
        </Panel>
      )}
    </>
  );
};
