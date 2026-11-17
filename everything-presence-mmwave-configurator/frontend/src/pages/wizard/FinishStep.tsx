import { mdiArrowRight, mdiCheckCircleOutline } from '@mdi/js';
import type {
  DeviceProfile,
  DiscoveredDevice,
  RoomConfig,
} from '../../api/types';
import { Badge, Button, Icon, Note } from '../../components/primitives';
import { shortModelLabel } from '../../utils/roomNav';
import { RoomThumbnail } from '../rooms/RoomThumbnail';
import { StepFrame } from './StepFrame';

export interface FinishStepProps {
  room: RoomConfig | null;
  device: DiscoveredDevice | null;
  profile: DeviceProfile | null;
  onBack: () => void;
  onOpen: () => void;
  onStartOver: () => void;
}

export const FinishStep = ({
  room,
  device,
  profile,
  onBack,
  onOpen,
  onStartOver,
}: FinishStepProps) => {
  if (!room)
    return (
      <StepFrame title="Finish" onBack={onBack}>
        <Note
          tone="warning"
          title="No room for this device"
          actions={
            <Button size="sm" onClick={onStartOver}>
              Start over
            </Button>
          }
        >
          Choose or create a room before finishing setup.
        </Note>
      </StepFrame>
    );

  const zones =
    room.zones?.filter((zone) => zone.enabled !== false).length ?? 0;
  const model = shortModelLabel(profile ?? undefined);
  return (
    <StepFrame
      title="Setup complete"
      description="The device is linked and the room is saved. Everything here can be changed later from the room screen."
      onBack={onBack}
      action={
        <Button variant="primary" onClick={onOpen}>
          Open room
          <Icon path={mdiArrowRight} size={20} />
        </Button>
      }
    >
      <div
        data-wizard-summary
        className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4"
      >
        <RoomThumbnail room={room} className="h-28 w-28" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-lg font-medium text-fg">
            <Icon
              path={mdiCheckCircleOutline}
              className="shrink-0 text-success-ink"
            />
            <span className="truncate">{room.name}</span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            {model && <Badge>{model}</Badge>}
            <span className="truncate">{device?.name ?? 'No device'}</span>
          </p>
          <p className="mt-1 text-sm text-fg-muted tabular-nums">
            {room.roomShell?.points?.length
              ? `${room.roomShell.points.length} walls`
              : 'No walls'}
            {zones > 0 && ` · ${zones === 1 ? '1 zone' : `${zones} zones`}`}
          </p>
        </div>
      </div>
    </StepFrame>
  );
};
