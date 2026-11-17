import { mdiPlus, mdiViewGridOutline } from '@mdi/js';
import { type RoomMode, roomRoute, toHash } from '../../router';
import { modeForRoom, NO_ZONES_MESSAGE } from '../../utils/roomNav';
import { Button, cx, Icon, Note } from '../primitives';
import { NavRoomItem } from './NavRoomItem';
import { SKELETON_KEYS } from './navItems';
import { useNavRooms } from './useNavRooms';

export interface RoomSwitcherProps {
  currentRoomId: string | null;
  mode: RoomMode;
  onAddDevice: () => void;
  /** Called after any choice, so a popover or sheet can close. */
  onDone?: () => void;
  tall?: boolean;
}

export const RoomSwitcher = ({
  currentRoomId,
  mode,
  onAddDevice,
  onDone,
  tall = false,
}: RoomSwitcherProps) => {
  const { rooms, loading, error, refresh } = useNavRooms();
  const footerLink = cx(
    'flex items-center gap-2.5 rounded-lg px-2.5 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
    tall ? 'h-14' : 'h-9 [@media(pointer:coarse)]:h-11',
  );

  return (
    <div className="flex flex-col gap-0.5">
      {loading &&
        SKELETON_KEYS.map((key) => (
          <div
            key={key}
            className={cx(
              'animate-pulse rounded-lg bg-surface-2',
              tall ? 'h-14' : 'h-9',
            )}
          />
        ))}
      {!loading && error && (
        <Note
          tone="danger"
          actions={
            <Button size="sm" onClick={() => void refresh()}>
              Retry
            </Button>
          }
        >
          Rooms could not be loaded.
        </Note>
      )}
      {!loading && !error && rooms.length === 0 && (
        <p className="px-2.5 py-2 text-sm text-fg-subtle">No rooms yet</p>
      )}
      {rooms.map((room) => (
        <NavRoomItem
          key={room.id}
          room={room}
          href={toHash(
            roomRoute(room.id, modeForRoom(mode, room.canEditZones)),
          )}
          active={room.id === currentRoomId}
          tall={tall}
          note={
            mode === 'zones' && !room.canEditZones
              ? NO_ZONES_MESSAGE
              : undefined
          }
          onNavigate={onDone}
        />
      ))}
      <div className="my-1 border-t border-line" />
      <a
        href={toHash({ name: 'rooms' })}
        onClick={onDone}
        className={footerLink}
      >
        <Icon path={mdiViewGridOutline} size={20} />
        All rooms
      </a>
      <button
        type="button"
        onClick={() => {
          onDone?.();
          onAddDevice();
        }}
        className={cx(footerLink, 'w-full text-left')}
      >
        <Icon path={mdiPlus} size={20} />
        Add device
      </button>
    </div>
  );
};
