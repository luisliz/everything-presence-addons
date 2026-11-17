import {
  mdiAccount,
  mdiAlertOutline,
  mdiCheckCircleOutline,
  mdiHelpCircleOutline,
  mdiStar,
  mdiWifiOff,
} from '@mdi/js';
import { useEffect, useRef, useState } from 'react';
import type { DiscoveredDevice, RoomConfig } from '../../api/types';
import { Badge, Icon, StatusDot, Tooltip } from '../../components/primitives';
import type { Presence } from '../../components/shell/TopBar';
import { roomRoute, toHash } from '../../router';
import {
  DEVICE_STATUS_LABEL,
  type RoomDeviceStatus,
} from '../../utils/roomNav';
import { type RoomActionHandlers, RoomActionsMenu } from './RoomActionsMenu';
import { RoomThumbnail } from './RoomThumbnail';

export interface RoomCardProps extends RoomActionHandlers {
  room: RoomConfig;
  device?: DiscoveredDevice;
  model?: string;
  status: RoomDeviceStatus;
  presence?: Presence | null;
  canEditZones: boolean;
  isDefault: boolean;
  busy: boolean;
  renaming: boolean;
  onRenameSubmit: (name: string) => void;
  onRenameCancel: () => void;
}

const StatusPill = ({
  status,
  presence,
}: {
  status: RoomDeviceStatus;
  presence?: Presence | null;
}) => {
  if (status === 'offline' || presence === 'offline')
    return (
      <Badge tone="warning" icon={mdiWifiOff}>
        Offline
      </Badge>
    );
  if (presence === 'occupied')
    return (
      <Badge tone="accent" icon={mdiAccount}>
        Occupied
      </Badge>
    );
  if (presence === 'clear') return <Badge>Clear</Badge>;
  if (presence === 'unknown')
    return (
      <Badge tone="warning" icon={mdiHelpCircleOutline}>
        No presence data
      </Badge>
    );
  if (status === 'online') return <Badge tone="success">Online</Badge>;
  return null;
};

const RenameField = ({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) => {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const settled = useRef(false);
  const settle = (action: () => void) => {
    if (settled.current) return;
    settled.current = true;
    action();
  };
  useEffect(() => inputRef.current?.select(), []);
  return (
    <form
      className="relative z-10 flex min-w-0 flex-1"
      onSubmit={(event) => {
        event.preventDefault();
        settle(() => onSubmit(value));
      }}
    >
      <input
        ref={inputRef}
        value={value}
        aria-label="Room name"
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => settle(() => onSubmit(value))}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            settle(onCancel);
          }
        }}
        className="h-8 w-full min-w-0 rounded-md border border-accent bg-surface-2 px-2 text-base font-medium text-fg focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
    </form>
  );
};

export const RoomCard = ({
  room,
  device,
  model,
  status,
  presence,
  canEditZones,
  isDefault,
  busy,
  renaming,
  onRenameSubmit,
  onRenameCancel,
  ...actions
}: RoomCardProps) => {
  const zoneCount = (room.zones ?? []).filter(
    (zone) => zone.enabled !== false,
  ).length;
  return (
    <article className="group relative flex gap-4 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-surface-2/40 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-accent">
      <RoomThumbnail
        room={room}
        dimmed={status === 'offline'}
        className="h-24 w-24"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-h-8 items-center gap-1.5">
          {renaming ? (
            <RenameField
              initial={room.name}
              onSubmit={onRenameSubmit}
              onCancel={onRenameCancel}
            />
          ) : (
            <h3 className="min-w-0 truncate text-base font-medium text-fg">
              <a
                href={toHash(roomRoute(room.id))}
                className="after:absolute after:inset-0 after:rounded-xl focus:outline-none"
              >
                {room.name}
              </a>
            </h3>
          )}
          {isDefault && !renaming && (
            <Tooltip content="Default room" className="relative z-10">
              <span className="inline-flex">
                <Icon
                  path={mdiStar}
                  size={16}
                  className="text-warning"
                  label="Default room"
                />
              </span>
            </Tooltip>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill status={status} presence={presence} />
          <span className="text-xs text-fg-muted">
            {canEditZones
              ? `${zoneCount} zone${zoneCount === 1 ? '' : 's'}`
              : 'Presence only'}
          </span>
        </div>
        {room.deviceId ? (
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
            <StatusDot state={status} label={DEVICE_STATUS_LABEL[status]} />
            {model && <Badge>{model}</Badge>}
            <span className="min-w-0 truncate">
              {device?.name ?? 'Device not found'}
            </span>
            <Tooltip
              content={
                room.entityMappings
                  ? 'Entities synced'
                  : 'Entities not synced. Re-sync from the room actions.'
              }
              className="relative z-10"
            >
              <span className="inline-flex">
                {room.entityMappings ? (
                  <Icon
                    path={mdiCheckCircleOutline}
                    size={16}
                    className="text-success-ink"
                    label="Entities synced"
                  />
                ) : (
                  <Icon
                    path={mdiAlertOutline}
                    size={16}
                    className="text-warning-ink"
                    label="Entities not synced"
                  />
                )}
              </span>
            </Tooltip>
          </div>
        ) : (
          <div>
            <Badge>No device</Badge>
          </div>
        )}
      </div>
      <div className="relative z-10 -mr-1 -mt-1 self-start">
        <RoomActionsMenu
          room={room}
          isDefault={isDefault}
          busy={busy}
          {...actions}
        />
      </div>
    </article>
  );
};
