import { mdiCog } from '@mdi/js';
import { type Route, roomRoute, toHash } from '../../router';
import { NO_ZONES_MESSAGE } from '../../utils/roomNav';
import { cx, Icon, useToast } from '../primitives';
import { MODE_ITEMS } from './navItems';
import { useNavRooms } from './useNavRooms';

export interface BottomBarProps {
  route: Route;
  /** Room the mode items open when the current screen is not a room (the last room visited). */
  roomId: string | null;
}

const ITEM =
  'relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent';

const Indicator = () => (
  <span
    aria-hidden="true"
    className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-accent"
  />
);

export const BottomBar = ({ route, roomId }: BottomBarProps) => {
  const toast = useToast();
  const { rooms } = useNavRooms();
  const room = rooms.find((candidate) => candidate.id === roomId);
  const settingsActive = route.name === 'settings' || route.name === 'rooms';

  return (
    <nav
      aria-label="Room views"
      className="flex shrink-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {MODE_ITEMS.map((item) => {
        const active = route.name === 'room' && route.mode === item.mode;
        const content = (
          <>
            {active && <Indicator />}
            <Icon path={item.icon} size={24} />
            {item.label}
          </>
        );
        return !room || (item.mode === 'zones' && !room.canEditZones) ? (
          <button
            key={item.mode}
            type="button"
            aria-disabled="true"
            onClick={() =>
              toast.show(room ? NO_ZONES_MESSAGE : 'Pick a room first')
            }
            className={cx(ITEM, 'text-fg-subtle opacity-50')}
          >
            {content}
          </button>
        ) : (
          <a
            key={item.mode}
            href={toHash(roomRoute(room.id, item.mode))}
            aria-current={active ? 'page' : undefined}
            className={cx(ITEM, active ? 'text-accent-ink' : 'text-fg-muted')}
          >
            {content}
          </a>
        );
      })}
      <a
        href={toHash({
          name: 'settings',
          section: route.name === 'settings' ? route.section : 'appearance',
        })}
        aria-current={settingsActive ? 'page' : undefined}
        className={cx(
          ITEM,
          settingsActive ? 'text-accent-ink' : 'text-fg-muted',
        )}
      >
        {settingsActive && <Indicator />}
        <Icon path={mdiCog} size={24} />
        Settings
      </a>
    </nav>
  );
};
