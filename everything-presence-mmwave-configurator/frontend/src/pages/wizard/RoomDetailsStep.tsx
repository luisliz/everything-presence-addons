import { mdiHomeOutline, mdiLockOutline } from '@mdi/js';
import { useId, useState } from 'react';
import type { DiscoveredDevice, RoomConfig } from '../../api/types';
import {
  Badge,
  Button,
  ChoiceList,
  Field,
  Segmented,
} from '../../components/primitives';
import { useDisplaySettings } from '../../hooks/useDisplaySettings';
import { StepFrame } from './StepFrame';
import type { RoomPath } from './steps';

const INPUT =
  'h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 [@media(pointer:coarse)]:h-11';

export interface RoomDetailsStepProps {
  path: Exclude<RoomPath, 'skip'>;
  rooms: RoomConfig[];
  devices: DiscoveredDevice[];
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onCreate: (name: string) => void;
  onBind: (room: RoomConfig) => void;
}

export const RoomDetailsStep = ({
  path,
  rooms,
  devices,
  busy,
  error,
  onBack,
  onCreate,
  onBind,
}: RoomDetailsStepProps) => {
  const nameId = useId();
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const { units, setUnits } = useDisplaySettings();

  if (path === 'existing') {
    const chosen = rooms.find((room) => room.id === roomId);
    return (
      <StepFrame
        title="Pick a room"
        description="The device is linked to this room. Its walls, doors and furniture stay as they are."
        error={error}
        onBack={onBack}
        action={
          <Button
            variant="primary"
            disabled={!chosen}
            busy={busy}
            onClick={() => chosen && onBind(chosen)}
          >
            Link device
          </Button>
        }
      >
        <ChoiceList
          ariaLabel="Existing room"
          value={roomId}
          onChange={setRoomId}
          options={rooms.map((room) => {
            const holder = room.deviceId
              ? (devices.find((d) => d.id === room.deviceId)?.name ??
                'another device')
              : null;
            return {
              value: room.id,
              title: room.name,
              subtitle: holder
                ? `Linked to ${holder}`
                : `${room.zones?.length ?? 0} zones`,
              icon: holder ? mdiLockOutline : mdiHomeOutline,
              disabled: Boolean(holder),
              trailing: holder ? <Badge>Has a device</Badge> : undefined,
            };
          })}
        />
      </StepFrame>
    );
  }

  const trimmed = name.trim();
  return (
    <StepFrame
      title="Name the room"
      description="You draw the walls on the next step."
      error={error}
      onBack={onBack}
      action={
        <Button
          variant="primary"
          type="submit"
          form={`${nameId}-form`}
          disabled={!trimmed}
          busy={busy}
        >
          Create room
        </Button>
      }
    >
      <form
        id={`${nameId}-form`}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) onCreate(trimmed);
        }}
      >
        <Field label="Room name" htmlFor={nameId}>
          <input
            id={nameId}
            className={INPUT}
            placeholder="e.g. Living room, Kitchen"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Units" layout="row">
          <Segmented
            ariaLabel="Units"
            value={units}
            onChange={setUnits}
            size="sm"
            options={[
              { value: 'metric', label: 'Metric (m)' },
              { value: 'imperial', label: 'Imperial (ft)' },
            ]}
          />
        </Field>
      </form>
    </StepFrame>
  );
};
