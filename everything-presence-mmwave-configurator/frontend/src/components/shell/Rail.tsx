import { mdiCog, mdiHomeOutline, mdiPlus } from '@mdi/js';
import { type Route, roomRoute, toHash } from '../../router';
import { NO_ZONES_MESSAGE } from '../../utils/roomNav';
import {
  cx,
  Icon,
  IconButton,
  Popover,
  Tooltip,
  useToast,
} from '../primitives';
import { MODE_ITEMS } from './navItems';
import { RoomSwitcher } from './RoomSwitcher';
import { useNavRooms } from './useNavRooms';

export interface RailProps {
  route: Route;
  onAddDevice: () => void;
}

const ITEM =
  'relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

const RailLink = ({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
}) => (
  <Tooltip content={label} side="right" describe={false}>
    <a
      href={href}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cx(
        ITEM,
        active
          ? 'bg-accent-tint text-accent-ink'
          : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
      )}
    >
      <Icon path={icon} size={20} />
    </a>
  </Tooltip>
);

export const Rail = ({ route, onAddDevice }: RailProps) => {
  const { rooms } = useNavRooms();
  const toast = useToast();
  const roomId = route.name === 'room' ? route.roomId : null;
  const mode = route.name === 'room' ? route.mode : 'live';
  const room = rooms.find((candidate) => candidate.id === roomId);

  return (
    <nav
      aria-label="Main"
      className="hidden w-16 shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-3 md:flex lg:hidden"
    >
      <Popover
        align="start"
        label="Rooms"
        className="w-72"
        trigger={
          <IconButton
            icon={mdiHomeOutline}
            label="Rooms"
            tooltipSide="right"
            pressed={route.name === 'rooms'}
          />
        }
      >
        {(close) => (
          <RoomSwitcher
            currentRoomId={roomId}
            mode={mode}
            onAddDevice={onAddDevice}
            onDone={close}
          />
        )}
      </Popover>
      {room && (
        <div className="mt-2 flex flex-col items-center gap-1 border-t border-line pt-3">
          {MODE_ITEMS.map((item) =>
            item.mode === 'zones' && !room.canEditZones ? (
              <IconButton
                key={item.mode}
                icon={item.icon}
                label={`${item.label}, ${room.name}`}
                aria-disabled="true"
                tooltip={NO_ZONES_MESSAGE}
                tooltipSide="right"
                onClick={() => toast.show(NO_ZONES_MESSAGE)}
                className="h-11 w-11 cursor-not-allowed opacity-40"
              />
            ) : (
              <RailLink
                key={item.mode}
                href={toHash(roomRoute(room.id, item.mode))}
                label={`${item.label}, ${room.name}`}
                icon={item.icon}
                active={item.mode === mode}
              />
            ),
          )}
        </div>
      )}
      <div className="flex-1" />
      <IconButton
        icon={mdiPlus}
        label="Add device"
        tooltipSide="right"
        pressed={route.name === 'wizard'}
        onClick={onAddDevice}
      />
      <RailLink
        href={toHash({ name: 'settings', section: 'appearance' })}
        label="Settings"
        icon={mdiCog}
        active={route.name === 'settings'}
      />
    </nav>
  );
};
