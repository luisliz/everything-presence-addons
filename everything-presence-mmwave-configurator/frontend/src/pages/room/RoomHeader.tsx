import {
  mdiAccessPoint,
  mdiAccount,
  mdiDotsVertical,
  mdiFloorPlan,
  mdiHelpCircleOutline,
  mdiStar,
  mdiSync,
  mdiTextBoxSearchOutline,
  mdiVectorPolygon,
  mdiViewGridOutline,
  mdiWifiOff,
} from '@mdi/js';
import {
  Badge,
  IconButton,
  Menu,
  type MenuItem,
  Segmented,
  StatusDot,
  Tooltip,
} from '../../components/primitives';
import type { RoomMode } from '../../router';
import { NO_ZONES_MESSAGE } from '../../utils/roomNav';
import { stateLabel, useNow } from './presence';

export interface RoomHeaderProps {
  name: string;
  model?: string;
  device: 'online' | 'offline' | 'none';
  mode: RoomMode;
  canEditZones: boolean;
  onMode: (mode: RoomMode) => void;
  presence: {
    occupied: boolean;
    unknown: boolean;
    targets: number;
    since: number | null;
  } | null;
  isDefault: boolean;
  onAllRooms: () => void;
  onLogs?: () => void;
  onResync?: () => void;
  onMakeDefault: () => void;
}

const DEVICE_LABEL = {
  online: 'Online',
  offline: 'Offline',
  none: 'No device',
} as const;

export const RoomHeader = ({
  name,
  model,
  device,
  mode,
  canEditZones,
  onMode,
  presence,
  isDefault,
  onAllRooms,
  onLogs,
  onResync,
  onMakeDefault,
}: RoomHeaderProps) => {
  const now = useNow();
  const items: MenuItem[] = [
    { label: 'All rooms', icon: mdiViewGridOutline, onSelect: onAllRooms },
    ...(onLogs
      ? [
          {
            label: 'Device logs',
            icon: mdiTextBoxSearchOutline,
            onSelect: onLogs,
          },
        ]
      : []),
    ...(onResync
      ? [{ label: 'Re-sync entities', icon: mdiSync, onSelect: onResync }]
      : []),
    {
      label: 'Default room',
      icon: mdiStar,
      checked: isDefault,
      disabled: isDefault,
      onSelect: onMakeDefault,
    },
  ];
  return (
    <header className="hidden h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 md:flex">
      <h1 className="min-w-0 truncate text-lg font-medium text-fg">{name}</h1>
      {model && <Badge>{model}</Badge>}
      <span className="flex shrink-0 items-center gap-1.5 text-sm text-fg-muted">
        <StatusDot state={device} />
        {DEVICE_LABEL[device]}
      </span>
      <Segmented
        ariaLabel="Room mode"
        value={mode}
        onChange={onMode}
        className="ml-2"
        options={[
          {
            value: 'live',
            label: 'Live',
            icon: mdiAccessPoint,
            tooltip: 'Live (1)',
          },
          {
            value: 'zones',
            label: 'Zones',
            icon: mdiVectorPolygon,
            disabled: !canEditZones,
            tooltip: canEditZones ? 'Zones (2)' : NO_ZONES_MESSAGE,
          },
          {
            value: 'build',
            label: 'Layout',
            icon: mdiFloorPlan,
            tooltip: 'Layout (3)',
          },
        ]}
      />
      <div className="flex-1" />
      {device === 'offline' ? (
        <Badge tone="warning" icon={mdiWifiOff}>
          Offline
        </Badge>
      ) : presence?.unknown ? (
        <Tooltip content="The occupancy entity reports no state yet. It updates on the next change or after the device reconnects.">
          <Badge tone="warning" icon={mdiHelpCircleOutline}>
            No presence data
          </Badge>
        </Tooltip>
      ) : presence?.occupied ? (
        <Badge tone="accent" icon={mdiAccount}>
          Occupied{presence.targets > 0 ? ` ${presence.targets}` : ''}
        </Badge>
      ) : presence ? (
        <Badge>{stateLabel(false, presence.since, now)}</Badge>
      ) : null}
      <Menu
        label="Room actions"
        trigger={
          <IconButton
            icon={mdiDotsVertical}
            label="Room actions"
            tooltipSide="bottom"
          />
        }
        items={items}
      />
    </header>
  );
};
