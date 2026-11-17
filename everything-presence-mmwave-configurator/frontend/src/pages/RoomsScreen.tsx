import {
  mdiChevronDown,
  mdiContentSaveOutline,
  mdiDotsVertical,
  mdiHomePlusOutline,
  mdiImport,
  mdiPlus,
} from '@mdi/js';
import { useMemo, useState } from 'react';
import type { DiscoveredDevice, RoomConfig } from '../api/types';
import { EntityDiscovery } from '../components/EntityDiscovery';
import {
  Button,
  ConfirmDialog,
  Icon,
  IconButton,
  Menu,
  Note,
  Sheet,
} from '../components/primitives';
import type { Presence } from '../components/shell/TopBar';
import { useAppData } from '../contexts/AppDataContext';
import { navigate } from '../router';
import {
  roomDeviceStatus,
  shortModelLabel,
  sortRoomsForNav,
} from '../utils/roomNav';
import { roomSupportsZoneEditing } from '../utils/zoneCapabilities';
import { RoomCard } from './rooms/RoomCard';
import { useRoomActions } from './rooms/roomActions';
import { UnassignedDevices } from './rooms/UnassignedDevices';

export interface RoomsScreenProps {
  /** Starts the setup wizard from its first step. */
  onAddDevice: () => void;
  /** Live presence of the room whose device stream is open, when there is one. */
  live?: { roomId: string; presence: Presence } | null;
}

const SKELETONS = ['a', 'b', 'c', 'd', 'e', 'f'];
const GRID =
  'grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]';

const isEverythingPresence = (device: DiscoveredDevice) =>
  Boolean(
    device.manufacturer?.toLowerCase().includes('everything') ||
      device.model?.toLowerCase().includes('presence'),
  );

type Pending = { kind: 'unlink' | 'delete'; room: RoomConfig } | null;

export const RoomsScreen = ({ onAddDevice, live = null }: RoomsScreenProps) => {
  const { rooms, devices, profiles, loading, error, refresh, updateSettings } =
    useAppData();
  const actions = useRoomActions();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<RoomConfig | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  const sorted = useMemo(
    () => sortRoomsForNav(rooms, actions.defaultRoomId),
    [rooms, actions.defaultRoomId],
  );
  const unassigned = useMemo(() => {
    const linked = new Set(rooms.map((room) => room.deviceId));
    return devices.filter(
      (device) => isEverythingPresence(device) && !linked.has(device.id),
    );
  }, [devices, rooms]);
  const linkedCount = rooms.filter((room) => room.deviceId).length;

  const setUpDevice = (device: DiscoveredDevice) => {
    updateSettings({
      wizardStep: 'device',
      wizardDeviceId: device.id,
      wizardProfileId: null,
    }).catch(() => null);
    navigate({ name: 'wizard' });
  };

  const confirm = async () => {
    if (!pending) return;
    const { kind, room } = pending;
    await (kind === 'unlink' ? actions.unlink(room) : actions.remove(room));
    setPending(null);
  };

  const header = (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold text-fg">Rooms</h1>
        {!loading && !error && (
          <p className="mt-0.5 text-sm text-fg-muted">
            {rooms.length} room{rooms.length === 1 ? '' : 's'}, {linkedCount}{' '}
            device{linkedCount === 1 ? '' : 's'}
          </p>
        )}
      </div>
      <div className="hidden items-center gap-2 sm:flex">
        <div className="flex">
          <Button
            icon={mdiContentSaveOutline}
            onClick={actions.backupAll}
            disabled={rooms.length === 0}
            className="rounded-r-none"
          >
            Backup all
          </Button>
          <Menu
            label="Backup options"
            items={[
              {
                label: 'Import rooms',
                icon: mdiImport,
                onSelect: () => void actions.importRooms(),
              },
            ]}
            trigger={
              <IconButton
                icon={mdiChevronDown}
                label="More backup options"
                variant="outline"
                busy={actions.busy['*'] === 'import'}
                className="-ml-px rounded-l-none"
              />
            }
          />
        </div>
        <Button variant="primary" icon={mdiPlus} onClick={onAddDevice}>
          Add device
        </Button>
      </div>
      <div className="flex items-center gap-1 sm:hidden">
        <IconButton
          icon={mdiPlus}
          label="Add device"
          variant="outline"
          onClick={onAddDevice}
        />
        <Menu
          label="Room list actions"
          items={[
            {
              label: 'Backup all',
              icon: mdiContentSaveOutline,
              onSelect: actions.backupAll,
              disabled: rooms.length === 0,
            },
            {
              label: 'Import rooms',
              icon: mdiImport,
              onSelect: () => void actions.importRooms(),
            },
          ]}
          trigger={
            <IconButton
              icon={mdiDotsVertical}
              label="More actions"
              busy={actions.busy['*'] === 'import'}
            />
          }
        />
      </div>
    </header>
  );

  const body = () => {
    if (loading)
      return (
        <div className={GRID} aria-busy="true">
          <span className="sr-only">Loading rooms</span>
          {SKELETONS.map((key) => (
            <div
              key={key}
              className="h-[8.5rem] animate-pulse rounded-xl border border-line bg-surface-2"
            />
          ))}
        </div>
      );
    if (error)
      return (
        <Note
          tone="danger"
          title="Rooms could not be loaded"
          actions={
            <Button size="sm" onClick={() => void refresh()}>
              Retry
            </Button>
          }
        >
          {error}
        </Note>
      );
    if (rooms.length === 0)
      return (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
          <Icon
            path={mdiHomePlusOutline}
            size={24}
            className="mb-3 text-fg-subtle"
          />
          <h2 className="text-lg font-semibold text-fg">No rooms yet</h2>
          <p className="mt-1 max-w-sm text-sm text-fg-muted">
            A room ties one Everything Presence device to an outline and zones.
            Set up a device to create your first room.
          </p>
          <Button
            variant="primary"
            icon={mdiPlus}
            onClick={onAddDevice}
            className="mt-5"
          >
            Add device
          </Button>
        </div>
      );
    return (
      <ul className={GRID}>
        {sorted.map((room) => {
          const device = devices.find(
            (candidate) => candidate.id === room.deviceId,
          );
          const isDefault = room.id === actions.defaultRoomId;
          return (
            <li key={room.id}>
              <RoomCard
                room={room}
                device={device}
                model={shortModelLabel(
                  profiles.find((profile) => profile.id === room.profileId),
                )}
                status={roomDeviceStatus(room, devices)}
                presence={live?.roomId === room.id ? live.presence : null}
                canEditZones={roomSupportsZoneEditing(room, profiles)}
                isDefault={isDefault}
                busy={Boolean(actions.busy[room.id])}
                renaming={renamingId === room.id}
                onRenameSubmit={(name) => {
                  setRenamingId(null);
                  void actions.rename(room, name);
                }}
                onRenameCancel={() => setRenamingId(null)}
                onRename={() => setRenamingId(room.id)}
                onToggleDefault={() =>
                  void (isDefault
                    ? actions.clearDefault(room)
                    : actions.setDefault(room))
                }
                onResync={() => setSyncing(room)}
                onLinkDevice={onAddDevice}
                onUnlink={() => setPending({ kind: 'unlink', room })}
                onExport={() => actions.exportRoom(room)}
                onDelete={() => setPending({ kind: 'delete', room })}
              />
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      {header}
      <div className="flex flex-col gap-4">
        {body()}
        {!loading && !error && (
          <UnassignedDevices
            devices={unassigned}
            modelOf={(device) => shortModelLabel({ label: device.model ?? '' })}
            onSetUp={setUpDevice}
          />
        )}
      </div>

      <Sheet
        open={syncing !== null}
        onClose={() => setSyncing(null)}
        title="Re-sync entities"
        description={syncing?.name}
        variant="side"
        className="h-[88dvh] md:h-auto [&>div:last-child]:p-0"
      >
        {syncing?.deviceId && syncing.profileId && (
          <EntityDiscovery
            deviceId={syncing.deviceId}
            profileId={syncing.profileId}
            deviceName={syncing.entityNamePrefix || syncing.name}
            onComplete={(mappings, savedMapping) => {
              const room = syncing;
              setSyncing(null);
              void actions.resync(room, mappings, savedMapping);
            }}
            onCancel={() => setSyncing(null)}
          />
        )}
      </Sheet>

      <ConfirmDialog
        open={pending?.kind === 'unlink'}
        title={`Unlink the device from "${pending?.room.name}"?`}
        body="The room keeps its outline, furniture and zones. The device link and its entity mappings are removed."
        confirmLabel="Unlink device"
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
        busy={pending ? actions.busy[pending.room.id] === 'unlink' : false}
      />
      <ConfirmDialog
        open={pending?.kind === 'delete'}
        title={`Delete "${pending?.room.name}"?`}
        body="The room, its outline, furniture and zone layout are deleted. Zones already written to the device stay on the device. This cannot be undone."
        confirmLabel="Delete room"
        tone="danger"
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
        busy={pending ? actions.busy[pending.room.id] === 'delete' : false}
      />
    </div>
  );
};
