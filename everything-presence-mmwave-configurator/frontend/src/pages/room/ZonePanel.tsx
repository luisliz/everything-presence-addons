import {
  mdiAccount,
  mdiAlertCircleOutline,
  mdiCheck,
  mdiDeleteOutline,
} from '@mdi/js';
import { useEffect, useId, useRef } from 'react';
import type { ZonePolygon, ZoneRect } from '../../api/types';
import {
  ApplyBar,
  Badge,
  Button,
  cx,
  Field,
  Icon,
  IconButton,
  NumberField,
  Panel,
} from '../../components/primitives';
import {
  canDeleteVertex,
  MIN_POLYGON_VERTICES,
} from '../../utils/polygonVertices';
import { MIN_ZONE_SIZE_MM } from '../../utils/zoneDrawing';
import { stateLabel, useNow } from './presence';
import type { RoomFrame } from './types';
import type { LiveZone } from './useLiveRoom';

const KIND_LABEL = {
  regular: 'Detection zone',
  exclusion: 'Exclusion zone',
  entry: 'Entry zone',
} as const;

const NAME_INPUT =
  'h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 [@media(pointer:coarse)]:h-11';

/** Zones-mode editing of the selected zone; Live mode omits it and shows the zone read-only. */
export interface ZoneEdit {
  zone: ZoneRect | ZonePolygon;
  units: 'metric' | 'imperial';
  /** Focus Name on mount, after the zone was just drawn. */
  focusName?: boolean;
  /** Ceiling slices follow the slice settings, so their points are not edited here. */
  geometryLocked?: boolean;
  deletable: boolean;
  unavailable?: boolean;
  selectedVertex: number | null;
  onSelectVertex: (index: number | null) => void;
  onRename: (label: string) => void;
  onChange: (zone: ZoneRect | ZonePolygon, coalesceKey: string) => void;
  onDeleteVertex: (index: number) => void;
  onDelete: () => void;
  /** Ctrl/Cmd+Z in an untouched Name field undoes the drawing instead of the text. */
  onHistoryKey: (redo: boolean) => void;
}

export interface ZonePanelProps {
  frame: RoomFrame;
  live: { zones: LiveZone[] };
  zoneId: string;
  edit?: ZoneEdit;
}

const Geometry = ({ edit }: { edit: ZoneEdit }) => {
  const id = useId();
  const { zone, units } = edit;
  const scale = units === 'metric' ? 1000 : 304.8;
  const unit = units === 'metric' ? 'm' : 'ft';
  const field = (
    key: string,
    label: string,
    mm: number,
    onMm: (value: number) => void,
    min?: number,
  ) => (
    <NumberField
      id={`${id}-${key}`}
      ariaLabel={label}
      value={mm / scale}
      step={0.01}
      unit={unit}
      min={min === undefined ? undefined : min / scale}
      onChange={(value) => onMm(Math.round(value * scale))}
    />
  );

  if (!('vertices' in zone))
    return (
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ['x', 'X'],
            ['y', 'Y'],
            ['width', 'Width'],
            ['height', 'Height'],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label} htmlFor={`${id}-${key}`}>
            {field(
              key,
              label,
              zone[key],
              (value) =>
                edit.onChange({ ...zone, [key]: value }, `${zone.id}:${key}`),
              key === 'width' || key === 'height'
                ? MIN_ZONE_SIZE_MM
                : undefined,
            )}
          </Field>
        ))}
      </div>
    );

  const setPoint = (index: number, axis: 'x' | 'y', value: number) =>
    edit.onChange(
      {
        ...zone,
        vertices: zone.vertices.map((v, i) =>
          i === index ? { ...v, [axis]: value } : v,
        ),
      },
      `${zone.id}:${index}:${axis}`,
    );

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-fg-subtle">
          <th className="w-10 pb-1 text-left font-medium">Point</th>
          <th className="pb-1 text-right font-medium">X</th>
          <th className="pb-1 text-right font-medium">Y</th>
          <th className="w-9 pb-1">
            <span className="sr-only">Delete</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {zone.vertices.map((vertex, index) => {
          const selected = edit.selectedVertex === index;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: a vertex has no identity beyond its index
            <tr key={index} className={cx(selected && 'bg-accent-tint')}>
              <td className="py-1">
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-label={`Point ${index + 1}`}
                  onClick={() => edit.onSelectVertex(selected ? null : index)}
                  className="inline-flex h-8 min-w-8 items-center justify-center gap-0.5 rounded-md px-1 text-xs tabular-nums text-fg-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {selected && (
                    <Icon
                      path={mdiCheck}
                      size={16}
                      className="text-accent-ink"
                    />
                  )}
                  {index + 1}
                </button>
              </td>
              <td className="py-1 pl-1">
                {field(`${index}-x`, `Point ${index + 1} X`, vertex.x, (v) =>
                  setPoint(index, 'x', v),
                )}
              </td>
              <td className="py-1 pl-1">
                {field(`${index}-y`, `Point ${index + 1} Y`, vertex.y, (v) =>
                  setPoint(index, 'y', v),
                )}
              </td>
              <td className="py-1 pl-1">
                <IconButton
                  icon={mdiDeleteOutline}
                  size="sm"
                  label="Delete point"
                  tooltip={
                    zone.vertices.length <= MIN_POLYGON_VERTICES
                      ? `A zone needs at least ${MIN_POLYGON_VERTICES} points`
                      : undefined
                  }
                  disabled={!canDeleteVertex(zone.vertices, index)}
                  onClick={() => edit.onDeleteVertex(index)}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

const NameField = ({ edit }: { edit: ZoneEdit }) => {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const atFocus = useRef<string | null>(null);
  const { zone, focusName } = edit;
  useEffect(() => {
    if (focusName) ref.current?.focus();
  }, [focusName]);
  return (
    <Field
      label="Name"
      htmlFor={id}
      help="Sets the zone's friendly name on the canvas and in Home Assistant."
    >
      <input
        ref={ref}
        id={id}
        type="text"
        placeholder="e.g. Bed, Desk"
        autoComplete="off"
        value={zone.label ?? ''}
        onFocus={(event) => {
          atFocus.current = event.target.value;
        }}
        onChange={(event) => edit.onRename(event.target.value)}
        onKeyDown={(event) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === 'z' &&
            event.currentTarget.value === atFocus.current
          ) {
            event.preventDefault();
            event.currentTarget.blur();
            edit.onHistoryKey(event.shiftKey);
          }
        }}
        className={NAME_INPUT}
      />
    </Field>
  );
};

export const ZonePanel = ({ frame, live, zoneId, edit }: ZonePanelProps) => {
  const now = useNow();
  const zone = live.zones.find((z) => z.id === zoneId);
  if (!zone)
    return (
      <p className="pt-2 text-sm text-fg-muted">
        This zone is no longer on the device.
      </p>
    );
  const { draft, sensor, offline } = frame;
  const delayKey = zone.slot ? `zone${zone.slot}OffDelay` : null;
  const delaySetting = delayKey
    ? sensor.groups.flatMap((g) => g.settings).find((s) => s.key === delayKey)
    : undefined;
  const deviceDelay = delayKey ? sensor.states[delayKey]?.value : undefined;
  const dirty = delayKey !== null && delayKey in draft.draft.values;

  return (
    <Panel variant="section" className="border-t-0">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{KIND_LABEL[zone.kind]}</Badge>
          {edit?.unavailable && (
            <Badge tone="warning" icon={mdiAlertCircleOutline}>
              Entities missing in Home Assistant
            </Badge>
          )}
        </div>
        {edit && <NameField edit={edit} />}
        {zone.slot !== undefined && (!edit || frame.liveState) && (
          <div className="flex items-center gap-2">
            <Badge
              tone={zone.occupied ? 'accent' : 'neutral'}
              icon={zone.occupied ? mdiAccount : undefined}
            >
              {zone.occupied ? 'Occupied' : 'Clear'}
            </Badge>
            <output className="text-sm text-fg-muted">
              {stateLabel(
                Boolean(zone.occupied),
                frame.stateSince[`zone${zone.slot}`] ?? null,
                now,
              )}
            </output>
          </div>
        )}
        {edit && !edit.geometryLocked && (
          <section aria-label="Geometry" className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              {'vertices' in edit.zone ? 'Points' : 'Position and size'}
            </h3>
            <Geometry edit={edit} />
          </section>
        )}
        {delaySetting && delayKey && typeof deviceDelay === 'number' && (
          <Field
            label="Off delay"
            layout="row"
            help="How long the zone stays occupied after the last target leaves it."
            htmlFor={`zone-delay-${delayKey}`}
          >
            <NumberField
              id={`zone-delay-${delayKey}`}
              value={dirty ? draft.draft.values[delayKey] : deviceDelay}
              onChange={(value) => draft.set(delayKey, value)}
              min={delaySetting.min}
              max={delaySetting.max}
              step={delaySetting.step}
              unit={delaySetting.unit}
              dirty={dirty}
              deviceValue={deviceDelay}
              disabled={offline}
            />
          </Field>
        )}
        <ApplyBar
          dirtyCount={draft.dirtyCount}
          onApply={() => void draft.apply()}
          onDiscard={draft.discard}
          busy={draft.applying}
          lastError={draft.lastError}
        />
        {edit?.deletable && (
          <Button
            variant="ghost"
            size="sm"
            icon={mdiDeleteOutline}
            className="text-danger-ink hover:bg-danger-tint"
            onClick={edit.onDelete}
          >
            Delete zone
          </Button>
        )}
      </div>
    </Panel>
  );
};
