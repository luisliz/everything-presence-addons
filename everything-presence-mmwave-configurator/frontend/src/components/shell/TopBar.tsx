import {
  mdiAccount,
  mdiArrowLeft,
  mdiChevronDown,
  mdiHelpCircleOutline,
  mdiWifiOff,
} from '@mdi/js';
import { useState } from 'react';
import type { Route } from '../../router';
import { Badge, Icon, IconButton, Sheet } from '../primitives';
import { APP_NAME } from './navItems';
import { RoomSwitcher } from './RoomSwitcher';
import { useNavRooms } from './useNavRooms';

export type Presence = 'occupied' | 'clear' | 'offline' | 'unknown';

export interface TopBarProps {
  route: Route;
  presence: Presence | null;
  onAddDevice: () => void;
  onNavigate: (route: Route) => void;
}

const SCREEN_TITLE: Record<Exclude<Route['name'], 'room'>, string> = {
  rooms: 'Rooms',
  settings: 'Settings',
  wizard: 'Set up a device',
};

const PresencePill = ({ presence }: { presence: Presence }) =>
  presence === 'offline' ? (
    <Badge tone="warning" icon={mdiWifiOff}>
      Offline
    </Badge>
  ) : presence === 'occupied' ? (
    <Badge tone="accent" icon={mdiAccount}>
      Occupied
    </Badge>
  ) : presence === 'unknown' ? (
    <Badge tone="warning" icon={mdiHelpCircleOutline}>
      No presence data
    </Badge>
  ) : (
    <Badge>Clear</Badge>
  );

export const TopBar = ({
  route,
  presence,
  onAddDevice,
  onNavigate,
}: TopBarProps) => {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const { rooms } = useNavRooms();
  const room =
    route.name === 'room'
      ? rooms.find((candidate) => candidate.id === route.roomId)
      : undefined;

  return (
    <header className="mobile-safe-top flex min-h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-2 md:hidden">
      {route.name === 'room' ? (
        <IconButton
          icon={mdiArrowLeft}
          label="All rooms"
          tooltip={false}
          onClick={() => onNavigate({ name: 'rooms' })}
        />
      ) : (
        <span className="px-2 font-display text-sm font-semibold text-fg-muted">
          {APP_NAME}
        </span>
      )}
      <div className="flex min-w-0 flex-1 justify-center">
        {route.name === 'room' ? (
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={switcherOpen}
            onClick={() => setSwitcherOpen(true)}
            className="flex h-11 min-w-0 items-center gap-1 rounded-lg px-3 text-base font-medium text-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="truncate">{room?.name ?? 'Room'}</span>
            <Icon path={mdiChevronDown} size={20} className="text-fg-muted" />
          </button>
        ) : (
          <h1 className="truncate text-base font-medium text-fg">
            {SCREEN_TITLE[route.name]}
          </h1>
        )}
      </div>
      <div className="flex min-w-[2.75rem] justify-end pr-1">
        {route.name === 'room' && presence && (
          <PresencePill presence={presence} />
        )}
      </div>
      <Sheet
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        title="Rooms"
        variant="bottom"
      >
        <RoomSwitcher
          currentRoomId={route.name === 'room' ? route.roomId : null}
          mode={route.name === 'room' ? route.mode : 'live'}
          onAddDevice={onAddDevice}
          onDone={() => setSwitcherOpen(false)}
          tall
        />
      </Sheet>
    </header>
  );
};
