import { mdiCheck, mdiStar } from '@mdi/js';
import { DEVICE_STATUS_LABEL } from '../../utils/roomNav';
import { Badge, cx, Icon, StatusDot, Tooltip } from '../primitives';
import type { NavRoom } from './useNavRooms';

export interface NavRoomItemProps {
  room: NavRoom;
  href: string;
  active: boolean;
  /** 56 px rows for the phone room switcher sheet. */
  tall?: boolean;
  note?: string;
  onNavigate?: () => void;
}

export const NavRoomItem = ({
  room,
  href,
  active,
  tall = false,
  note,
  onNavigate,
}: NavRoomItemProps) => {
  const link = (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={cx(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        tall ? 'h-14' : 'h-9 [@media(pointer:coarse)]:h-11',
        active
          ? 'bg-accent-tint font-medium text-fg'
          : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
      )}
    >
      <StatusDot state={room.status} label={DEVICE_STATUS_LABEL[room.status]} />
      <span className="min-w-0 flex-1 truncate">{room.name}</span>
      {room.isDefault && (
        <Icon
          path={mdiStar}
          size={16}
          className="text-warning"
          label="Default room"
        />
      )}
      {room.model && <Badge>{room.model}</Badge>}
      {active && <Icon path={mdiCheck} size={16} className="text-accent-ink" />}
    </a>
  );
  return note ? (
    <Tooltip content={note} side="right" className="flex w-full">
      {link}
    </Tooltip>
  ) : (
    link
  );
};
