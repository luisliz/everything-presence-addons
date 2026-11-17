import { mdiCog, mdiPlus, mdiViewGridOutline } from '@mdi/js';
import { type Route, roomRoute, toHash } from '../../router';
import { modeForRoom, NO_ZONES_MESSAGE } from '../../utils/roomNav';
import { Button, cx, Icon, Note, Tooltip, useToast } from '../primitives';
import { NavRoomItem } from './NavRoomItem';
import { APP_NAME, MODE_ITEMS, SKELETON_KEYS } from './navItems';
import { ThemeSegmented } from './ThemeSegmented';
import { useNavRooms } from './useNavRooms';

export interface SidebarProps {
  route: Route;
  appVersion: string | null;
  onAddDevice: () => void;
}

const LINK =
  'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const IDLE = 'text-fg-muted hover:bg-surface-2 hover:text-fg';
const ACTIVE = 'bg-accent-tint font-medium text-fg';
const GROUP =
  'px-2.5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-fg-subtle';

export const Sidebar = ({ route, appVersion, onAddDevice }: SidebarProps) => {
  const { rooms, loading, error, refresh } = useNavRooms();
  const toast = useToast();
  const activeRoomId = route.name === 'room' ? route.roomId : null;
  const mode = route.name === 'room' ? route.mode : 'live';

  return (
    <nav
      aria-label="Main"
      className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex"
    >
      <div className="flex h-14 shrink-0 items-baseline gap-2 border-b border-line px-4 pt-4">
        <span className="font-display text-base font-semibold text-fg">
          {APP_NAME}
        </span>
        {appVersion && (
          <span className="text-xs text-fg-subtle">v{appVersion}</span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <h2 className={GROUP}>Rooms</h2>
        {loading &&
          SKELETON_KEYS.map((key) => (
            <div
              key={key}
              className="my-0.5 h-9 animate-pulse rounded-lg bg-surface-2"
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
        <ul className="flex flex-col gap-0.5">
          {rooms.map((room) => (
            <li key={room.id}>
              <NavRoomItem
                room={room}
                href={toHash(
                  roomRoute(room.id, modeForRoom(mode, room.canEditZones)),
                )}
                active={room.id === activeRoomId}
              />
              {room.id === activeRoomId && (
                <ul
                  aria-label={`${room.name} views`}
                  className="ml-[1.1rem] mt-0.5 flex flex-col gap-0.5 border-l border-line pl-2"
                >
                  {MODE_ITEMS.map((item) => {
                    const current = item.mode === mode;
                    const blocked = item.mode === 'zones' && !room.canEditZones;
                    const entry = blocked ? (
                      <button
                        type="button"
                        aria-disabled="true"
                        onClick={() => toast.show(NO_ZONES_MESSAGE)}
                        className={cx(
                          LINK,
                          'cursor-not-allowed text-left text-fg-subtle opacity-60',
                        )}
                      >
                        <Icon path={item.icon} size={16} />
                        {item.label}
                      </button>
                    ) : (
                      <a
                        href={toHash(roomRoute(room.id, item.mode))}
                        aria-current={current ? 'page' : undefined}
                        className={cx(LINK, current ? ACTIVE : IDLE)}
                      >
                        <Icon path={item.icon} size={16} />
                        {item.label}
                      </a>
                    );
                    return (
                      <li key={item.mode}>
                        {blocked ? (
                          <Tooltip
                            content={NO_ZONES_MESSAGE}
                            side="right"
                            className="flex w-full"
                          >
                            {entry}
                          </Tooltip>
                        ) : (
                          entry
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-2 flex flex-col gap-0.5 border-t border-line pt-2">
          <a
            href={toHash({ name: 'rooms' })}
            aria-current={route.name === 'rooms' ? 'page' : undefined}
            className={cx(LINK, route.name === 'rooms' ? ACTIVE : IDLE)}
          >
            <Icon path={mdiViewGridOutline} size={20} />
            All rooms
          </a>
          <button
            type="button"
            onClick={onAddDevice}
            className={cx(
              LINK,
              route.name === 'wizard' ? ACTIVE : IDLE,
              'text-left',
            )}
          >
            <Icon path={mdiPlus} size={20} />
            Add device
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-2 py-2">
        <a
          href={toHash({
            name: 'settings',
            section: route.name === 'settings' ? route.section : 'appearance',
          })}
          aria-current={route.name === 'settings' ? 'page' : undefined}
          className={cx(
            LINK,
            'w-auto',
            route.name === 'settings' ? ACTIVE : IDLE,
          )}
        >
          <Icon path={mdiCog} size={20} />
          Settings
        </a>
        <ThemeSegmented iconOnly />
      </div>
    </nav>
  );
};
