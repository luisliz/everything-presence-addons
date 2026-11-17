import React from 'react';

export type RoomMode = 'live' | 'zones' | 'build';
export type SettingsSection =
  | 'appearance'
  | 'backups'
  | 'assets'
  | 'firmware'
  | 'troubleshooting';

export type Route =
  | { name: 'rooms' }
  | { name: 'room'; roomId: string; mode: RoomMode }
  | { name: 'settings'; section: SettingsSection }
  | { name: 'wizard' };

export const ROOM_MODES: readonly RoomMode[] = ['live', 'zones', 'build'];
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  'appearance',
  'backups',
  'assets',
  'firmware',
  'troubleshooting',
];

const ROOMS: Route = { name: 'rooms' };

const segmentsOf = (hash: string): string[] =>
  hash
    .replace(/^#/, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });

export const isRootHash = (hash: string): boolean =>
  segmentsOf(hash).length === 0;

export function parseHash(hash: string): Route {
  const [head, second, third] = segmentsOf(hash);
  if (head === 'room' && second) {
    return {
      name: 'room',
      roomId: second,
      mode: ROOM_MODES.includes(third as RoomMode)
        ? (third as RoomMode)
        : 'live',
    };
  }
  if (head === 'settings') {
    if (second === 'rooms') return ROOMS;
    return {
      name: 'settings',
      section: SETTINGS_SECTIONS.includes(second as SettingsSection)
        ? (second as SettingsSection)
        : 'appearance',
    };
  }
  if (head === 'wizard') return { name: 'wizard' };
  return ROOMS;
}

export function toHash(route: Route): string {
  switch (route.name) {
    case 'room':
      return `#/room/${encodeURIComponent(route.roomId)}/${route.mode}`;
    case 'settings':
      return `#/settings/${route.section}`;
    case 'wizard':
      return '#/wizard';
    default:
      return '#/rooms';
  }
}

export const roomRoute = (roomId: string, mode: RoomMode = 'live'): Route => ({
  name: 'room',
  roomId,
  mode,
});

export interface RedirectContext {
  roomIds: readonly string[];
  defaultRoomId?: string | null;
  wizardCompleted: boolean;
  canEditZones: (roomId: string) => boolean;
}

export type RedirectNotice = 'missing-room' | 'no-zones';

/** Landing route for `#/`: the default room, else the first room, else setup on first run, else the room list. */
export function homeRoute({
  roomIds,
  defaultRoomId,
  wizardCompleted,
}: Omit<RedirectContext, 'canEditZones'>): Route {
  const roomId =
    (defaultRoomId && roomIds.includes(defaultRoomId) ? defaultRoomId : null) ??
    roomIds[0];
  if (roomId) return roomRoute(roomId);
  return wizardCompleted ? ROOMS : { name: 'wizard' };
}

/** Where a hash must be replaced to, with the reason when the user should be told; null when it is already canonical. */
export function resolveRedirect(
  hash: string,
  context: RedirectContext,
): { route: Route; notice?: RedirectNotice } | null {
  if (isRootHash(hash)) return { route: homeRoute(context) };
  const route = parseHash(hash);
  if (route.name === 'room') {
    if (!context.roomIds.includes(route.roomId))
      return { route: ROOMS, notice: 'missing-room' };
    if (route.mode === 'zones' && !context.canEditZones(route.roomId))
      return { route: roomRoute(route.roomId), notice: 'no-zones' };
  }
  return toHash(route) === hash ? null : { route };
}

interface LeaveGuardOptions {
  message: string;
  title?: string;
  onSave?: () => Promise<boolean> | boolean;
  onDiscard?: () => void;
}

export interface PendingLeave {
  hash: string;
  replace: boolean;
  guard: LeaveGuardOptions;
  saving: boolean;
}

const currentHash = () =>
  typeof window === 'undefined' ? '' : window.location.hash;

let accepted = currentHash();
let pending: PendingLeave | null = null;
const listeners = new Set<() => void>();
const guards = new Set<{ current: LeaveGuardOptions }>();

const emit = () => {
  for (const listener of listeners) listener();
};

const activeGuard = () => guards.values().next().value?.current;

const commit = (hash: string, replace: boolean) => {
  accepted = hash;
  pending = null;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', hash);
  emit();
};

const go = (hash: string, replace: boolean, force = false) => {
  if (hash === accepted) return;
  const guard = force ? undefined : activeGuard();
  if (guard) {
    pending = { hash, replace, guard, saving: false };
    emit();
    return;
  }
  commit(hash, replace);
};

const onHashChange = () => {
  const next = currentHash();
  if (next === accepted) return;
  const guard = activeGuard();
  if (guard) {
    window.history.replaceState(null, '', accepted);
    pending = { hash: next, replace: false, guard, saving: false };
  } else {
    accepted = next;
  }
  emit();
};

// In-app links go through `go`, so a guarded link leaves no history entry behind;
// only back/forward and typed URLs reach `onHashChange`.
const onLinkClick = (event: MouseEvent) => {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const anchor = (event.target as Element | null)?.closest?.('a[href^="#/"]');
  if (!anchor || anchor.getAttribute('target')) return;
  event.preventDefault();
  go(anchor.getAttribute('href') ?? '#/', false);
};

const subscribe = (listener: () => void) => {
  if (listeners.size === 0) {
    accepted = currentHash();
    window.addEventListener('hashchange', onHashChange);
    document.addEventListener('click', onLinkClick);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    window.removeEventListener('hashchange', onHashChange);
    document.removeEventListener('click', onLinkClick);
  };
};

export const navigate = (
  route: Route,
  options: { replace?: boolean } = {},
): void => go(toHash(route), options.replace ?? false);

export const leaveDecision = {
  stay(): void {
    pending = null;
    emit();
  },
  discard(): void {
    const target = pending;
    if (!target) return;
    pending = null;
    target.guard.onDiscard?.();
    go(target.hash, target.replace, true);
    emit();
  },
  async save(): Promise<void> {
    const target = pending;
    if (!target?.guard.onSave) return;
    pending = { ...target, saving: true };
    emit();
    const saved = await target.guard.onSave();
    pending = saved ? null : { ...target, saving: false };
    if (saved) go(target.hash, target.replace, true);
    emit();
  },
};

/** The hash the app currently shows; changes the browser makes while a leave guard is pending are held back. */
export function useHash(): string {
  return React.useSyncExternalStore(
    subscribe,
    () => accepted,
    () => '',
  );
}

export function useRoute(): [Route, typeof navigate] {
  const hash = useHash();
  const route = React.useMemo(() => parseHash(hash), [hash]);
  return [route, navigate];
}

export function usePendingLeave(): PendingLeave | null {
  return React.useSyncExternalStore(
    subscribe,
    () => pending,
    () => null,
  );
}

/** While `dirty`, route changes (links, back/forward, typed URLs) ask before leaving; `onSave` enables "Save and leave". */
export function useLeaveGuard(
  dirty: boolean,
  message: string,
  options: Omit<LeaveGuardOptions, 'message'> = {},
): void {
  const ref = React.useRef<LeaveGuardOptions>({ message, ...options });
  ref.current = { message, ...options };
  React.useEffect(() => {
    if (!dirty) return;
    const entry = ref;
    guards.add(entry);
    return () => {
      guards.delete(entry);
    };
  }, [dirty]);
}
