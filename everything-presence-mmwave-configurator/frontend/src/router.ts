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

export type LeaveGuardEntry = { current: LeaveGuardOptions };

export interface PendingLeave {
  hash: string;
  replace: boolean;
  guard: LeaveGuardOptions;
  entry: LeaveGuardEntry;
  /** Guards the user already answered with Save or Discard for this move. */
  resolved: ReadonlySet<LeaveGuardEntry>;
  /** History steps the browser took for this move; replayed with `history.go` once every guard is resolved. */
  delta?: number;
  /** Set when the guarded move is an in-app action instead of a hash change. */
  action?: () => void;
  saving: boolean;
}

const currentHash = () =>
  typeof window === 'undefined' ? '' : window.location.hash;

const entryIndex = (): number | undefined => {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === 'number' ? idx : undefined;
};

let accepted = currentHash();
let index = 0;
let replaying = false;
let pending: PendingLeave | null = null;
const listeners = new Set<() => void>();
const guards = new Set<LeaveGuardEntry>();

const emit = () => {
  for (const listener of listeners) listener();
};

export const nextGuard = (
  entries: Iterable<LeaveGuardEntry>,
  resolved: ReadonlySet<LeaveGuardEntry>,
): LeaveGuardEntry | undefined => {
  for (const entry of entries) if (!resolved.has(entry)) return entry;
  return undefined;
};

const stamp = () =>
  window.history.replaceState({ ...window.history.state, idx: index }, '');

const commit = (hash: string, replace: boolean) => {
  accepted = hash;
  pending = null;
  if (!replace) index += 1;
  window.history[replace ? 'replaceState' : 'pushState'](
    { idx: index },
    '',
    hash,
  );
  emit();
};

const ask = (
  target: Omit<PendingLeave, 'guard' | 'entry' | 'saving'>,
): boolean => {
  const entry = nextGuard(guards, target.resolved);
  if (!entry) return false;
  pending = { ...target, guard: entry.current, entry, saving: false };
  emit();
  return true;
};

const finish = (target: PendingLeave) => {
  if (ask(target)) return;
  if (target.action) {
    pending = null;
    emit();
    target.action();
    return;
  }
  if (target.delta === undefined) {
    commit(target.hash, target.replace);
    return;
  }
  pending = null;
  replaying = true;
  window.history.go(target.delta);
  emit();
};

const go = (hash: string, replace: boolean) => {
  if (hash === accepted) return;
  if (ask({ hash, replace, resolved: new Set() })) return;
  commit(hash, replace);
};

const accept = (hash: string, idx: number | undefined) => {
  accepted = hash;
  pending = null;
  if (idx !== undefined) index = idx;
  else {
    index += 1;
    stamp();
  }
};

const onHashChange = () => {
  const next = currentHash();
  const idx = entryIndex();
  if (next === accepted) {
    if (idx !== undefined) index = idx;
    return;
  }
  if (replaying) {
    replaying = false;
    accept(next, idx);
    emit();
    return;
  }
  // A typed URL or a stray `location.hash` write lands on a fresh entry without an index.
  const replace = idx === index;
  const delta = idx === undefined || replace ? undefined : idx - index;
  if (!ask({ hash: next, replace, resolved: new Set(), delta })) {
    accept(next, idx);
    emit();
    return;
  }
  if (replace) window.history.replaceState({ idx: index }, '', accepted);
  else window.history.go(-(delta ?? 1));
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

export const subscribe = (listener: () => void) => {
  if (listeners.size === 0) {
    accepted = currentHash();
    const idx = entryIndex();
    index = idx ?? 0;
    if (idx === undefined) stamp();
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

/** Runs `action` now, or after every dirty leave guard is saved or discarded. */
export const runGuarded = (action: () => void): void => {
  if (!ask({ hash: accepted, replace: true, resolved: new Set(), action }))
    action();
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
    target.guard.onDiscard?.();
    finish({ ...target, resolved: new Set(target.resolved).add(target.entry) });
  },
  async save(): Promise<void> {
    const target = pending;
    if (!target?.guard.onSave) return;
    pending = { ...target, saving: true };
    emit();
    const saved = await target.guard.onSave();
    if (pending?.entry !== target.entry) return;
    if (saved)
      finish({
        ...target,
        resolved: new Set(target.resolved).add(target.entry),
      });
    else {
      pending = { ...target, saving: false };
      emit();
    }
  },
};

export const currentLeave = (): PendingLeave | null => pending;
export const acceptedHash = (): string => accepted;

/** The hash the app currently shows; changes the browser makes while a leave guard is pending are held back. */
export function useHash(): string {
  return React.useSyncExternalStore(subscribe, acceptedHash, () => '');
}

export function useRoute(): [Route, typeof navigate] {
  const hash = useHash();
  const route = React.useMemo(() => parseHash(hash), [hash]);
  return [route, navigate];
}

export function usePendingLeave(): PendingLeave | null {
  return React.useSyncExternalStore(subscribe, currentLeave, () => null);
}

export const addLeaveGuard = (entry: LeaveGuardEntry): (() => void) => {
  guards.add(entry);
  return () => {
    guards.delete(entry);
  };
};

/** While `dirty`, route changes (links, back/forward, typed URLs) ask before leaving; `onSave` enables "Save and leave". */
export function useLeaveGuard(
  dirty: boolean,
  message: string,
  options: Omit<LeaveGuardOptions, 'message'> = {},
): void {
  const ref = React.useRef<LeaveGuardOptions>({ message, ...options });
  ref.current = { message, ...options };
  React.useEffect(() => (dirty ? addLeaveGuard(ref) : undefined), [dirty]);
}
