import {
  mdiAlertCircleOutline,
  mdiCheck,
  mdiContentSaveOutline,
  mdiFloorPlan,
} from '@mdi/js';
import {
  Badge,
  Button,
  cx,
  Field,
  Icon,
  Note,
  NumberField,
  Panel,
  Segmented,
  Tooltip,
} from '../../../components/primitives';
import { navigate, roomRoute } from '../../../router';
import { ZONE_STRIPE } from '../LiveRoomPanel';
import type { RoomFrame } from '../types';
import type { ZonesEditor } from './useZonesEditor';
import { ZoneShapeSection } from './ZoneShapeSection';
import { KIND_PREFIX, ZONE_KINDS, zonePoints } from './zoneSlots';

export const SNAP_STEPS = [0, 50, 100, 200] as const;
export const snapLabel = (mm: number, units: 'metric' | 'imperial') =>
  mm === 0
    ? 'Off'
    : units === 'metric'
      ? `${mm / 10} cm`
      : `${Math.round(mm / 25)} in`;

export interface ZonesRoomPanelProps {
  frame: RoomFrame;
  editor: ZonesEditor;
  units: 'metric' | 'imperial';
  snapMm: number;
  onSnapChange: (mm: number) => void;
  onOpenBackups: () => void;
}

export const ZonesRoomPanel = ({
  frame,
  editor,
  units,
  snapMm,
  onSnapChange,
  onOpenBackups,
}: ZonesRoomPanelProps) => {
  const { room, selection, select } = frame;
  const used = editor.slots.reduce((sum, s) => sum + s.used, 0);
  const total = editor.slots.reduce((sum, s) => sum + s.total, 0);
  const ordered = ZONE_KINDS.flatMap((kind) =>
    editor.zones.filter((zone) => zone.type === kind),
  );
  const { recovery, latestBackup } = editor;
  const showRecovery =
    editor.loaded &&
    editor.polygonMode &&
    !editor.isCeiling &&
    editor.zones.length === 0 &&
    (recovery.rectangles > 0 || recovery.backup !== null);
  const config = editor.ceilingConfig;

  return (
    <>
      <Panel
        variant="section"
        className="border-t-0"
        title="Zones"
        actions={
          <Badge tone={used >= total && total > 0 ? 'warning' : 'neutral'}>
            {used} of {total} used
          </Badge>
        }
      >
        {!editor.loaded ? (
          <output aria-label="Loading zones" className="block space-y-2">
            {['a', 'b', 'c'].map((key) => (
              <span
                key={key}
                className="block h-11 animate-pulse rounded-lg bg-surface-2"
              />
            ))}
          </output>
        ) : ordered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-sm text-fg-muted">
            No zones yet. Pick Polygon or Rectangle in the toolbar and draw on
            the plan.
          </p>
        ) : (
          <ul aria-label="Zones" className="space-y-1">
            {ordered.map((zone) => {
              const pressed =
                selection.kind === 'zone' && selection.id === zone.id;
              const missing = editor.unavailable(zone);
              const points = zonePoints(zone).length;
              return (
                <li key={zone.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={pressed}
                    data-zone-row={zone.id}
                    onClick={() => select({ kind: 'zone', id: zone.id })}
                    className={cx(
                      'flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border px-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      pressed
                        ? 'border-accent bg-accent-tint'
                        : 'border-transparent hover:bg-surface-2',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cx(
                        'h-3 w-3 shrink-0 rounded-sm',
                        ZONE_STRIPE[zone.type],
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                      {zone.label || zone.id}
                    </span>
                    <Badge>{KIND_PREFIX[zone.type]}</Badge>
                    <span className="w-14 shrink-0 text-right text-xs tabular-nums text-fg-muted">
                      {points} points
                    </span>
                    {pressed && (
                      <Icon
                        path={mdiCheck}
                        size={16}
                        className="text-accent-ink"
                      />
                    )}
                  </button>
                  {missing && (
                    <Tooltip
                      content={`${zone.id} entities are missing in Home Assistant`}
                    >
                      <span className="inline-flex text-warning-ink">
                        <Icon
                          path={mdiAlertCircleOutline}
                          size={20}
                          label={`${zone.id} entities are missing`}
                        />
                      </span>
                    </Tooltip>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <ZoneShapeSection editor={editor} />

      {showRecovery && (
        <Note
          tone="info"
          title="Recover zones"
          actions={
            <>
              {recovery.rectangles > 0 && (
                <Button
                  size="sm"
                  busy={editor.recovering}
                  onClick={() => void editor.recoverRoomZones()}
                >
                  Recover room zones
                </Button>
              )}
              {recovery.backup && (
                <Button
                  size="sm"
                  variant="ghost"
                  busy={editor.recovering}
                  onClick={() =>
                    recovery.backup &&
                    void editor.restoreBackup(recovery.backup)
                  }
                >
                  Restore latest backup
                </Button>
              )}
            </>
          }
        >
          {recovery.rectangles > 0
            ? `This device uses polygon zones, but the room still stores ${recovery.rectangles} rectangle zone${recovery.rectangles === 1 ? '' : 's'}. Recover them to the device as polygons.`
            : 'This device uses polygon zones and the room no longer stores the old rectangles. Restore the latest zone backup to fill the polygon zones.'}
        </Note>
      )}

      {room.deviceId && (
        <Panel variant="section" title="Backups">
          <p className="text-sm text-fg-muted">
            {editor.backupsLoading && !latestBackup
              ? 'Checking backups'
              : latestBackup
                ? `Latest backup ${new Date(latestBackup.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                : 'No backups yet'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={mdiContentSaveOutline}
              busy={editor.backingUp}
              onClick={() => void editor.backUpNow()}
            >
              Back up now
            </Button>
            <Button size="sm" variant="ghost" onClick={onOpenBackups}>
              All backups
            </Button>
          </div>
        </Panel>
      )}

      <Panel variant="section" title="Canvas">
        <div className="space-y-3">
          <Field label="Snap">
            <Segmented
              ariaLabel="Snap grid"
              size="sm"
              value={String(snapMm)}
              onChange={(value) => onSnapChange(Number(value))}
              options={SNAP_STEPS.map((mm) => ({
                value: String(mm),
                label: snapLabel(mm, units),
              }))}
            />
          </Field>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-fg-muted">
              Units: {units === 'metric' ? 'metres' : 'feet and inches'}
            </span>
            <Button
              size="sm"
              variant="ghost"
              icon={mdiFloorPlan}
              onClick={() => navigate(roomRoute(room.id, 'build'))}
            >
              Change in Layout
            </Button>
          </div>
        </div>
      </Panel>

      {editor.isCeiling && (
        <Panel variant="section" title="Ceiling slices">
          <div className="space-y-3">
            <Note tone="info">
              Ceiling mount: zones are distance slices. Drag their edges; corner
              editing is off.
            </Note>
            <Field
              label="Reliable axis"
              layout="row"
              help="The device axis with the most reliable lateral position for ceiling slices."
            >
              <Segmented
                ariaLabel="Reliable axis"
                size="sm"
                value={config.axis}
                onChange={(axis) => editor.updateCeiling({ axis })}
                options={[
                  { value: 'x', label: 'X axis' },
                  { value: 'y', label: 'Y axis' },
                ]}
              />
            </Field>
            <Field
              label="Slices"
              layout="row"
              help="How many adjacent detection slices are generated."
            >
              <Segmented
                ariaLabel="Slices"
                size="sm"
                value={String(config.sliceCount)}
                onChange={(count) =>
                  editor.updateCeiling({
                    sliceCount: Number(count),
                    lateralBreakpointsMm: undefined,
                    lateralRangesMm: undefined,
                  })
                }
                options={['2', '3', '4'].map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </Field>
            <Field label="Lateral min" layout="row" htmlFor="ceiling-min">
              <NumberField
                id="ceiling-min"
                value={config.lateralMinMm}
                step={100}
                unit="mm"
                onChange={(lateralMinMm) =>
                  editor.updateCeiling({ lateralMinMm })
                }
              />
            </Field>
            <Field label="Lateral max" layout="row" htmlFor="ceiling-max">
              <NumberField
                id="ceiling-max"
                value={config.lateralMaxMm}
                step={100}
                unit="mm"
                onChange={(lateralMaxMm) =>
                  editor.updateCeiling({ lateralMaxMm })
                }
              />
            </Field>
            <p className="text-xs text-fg-muted">
              Left and right mirroring for ceiling mounts is applied
              automatically. Draw an exclusion with the Rectangle tool.
            </p>
          </div>
        </Panel>
      )}
    </>
  );
};
