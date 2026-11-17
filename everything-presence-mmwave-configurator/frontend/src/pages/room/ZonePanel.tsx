import { mdiAccount } from '@mdi/js';
import {
  ApplyBar,
  Badge,
  Field,
  NumberField,
  Panel,
} from '../../components/primitives';
import { stateLabel, useNow } from './presence';
import type { RoomFrame } from './types';
import type { LiveRoom } from './useLiveRoom';

const KIND_LABEL = {
  regular: 'Detection zone',
  exclusion: 'Exclusion zone',
  entry: 'Entry zone',
} as const;

export interface ZonePanelProps {
  frame: RoomFrame;
  live: LiveRoom;
  zoneId: string;
}

export const ZonePanel = ({ frame, live, zoneId }: ZonePanelProps) => {
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
        <Badge>{KIND_LABEL[zone.kind]}</Badge>
        {zone.slot !== undefined && (
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
      </div>
    </Panel>
  );
};
