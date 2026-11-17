import {
  mdiBackupRestore,
  mdiChip,
  mdiCircle,
  mdiClose,
  mdiDeleteOutline,
  mdiDownload,
  mdiImport,
  mdiLifebuoy,
  mdiPaletteOutline,
  mdiPlus,
  mdiRefresh,
  mdiSquare,
  mdiSquareRounded,
  mdiThemeLightDark,
  mdiVectorPolyline,
} from '@mdi/js';
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createCustomFloor,
  createCustomFurniture,
  createZoneBackup,
  deleteCustomFloor,
  deleteCustomFurniture,
  deleteZoneBackup,
  fetchCustomFloors,
  fetchCustomFurniture,
  fetchZoneBackups,
  importZoneBackups,
  restoreZoneBackup,
} from '../api/client';
import { type DeviceMapping, getDeviceMapping } from '../api/deviceMappings';
import type {
  CustomFloorMaterial,
  CustomFurnitureType,
  ZoneBackup,
} from '../api/types';
import { FirmwareUpdateSection } from '../components/FirmwareUpdateSection';
import {
  Badge,
  Button,
  ConfirmDialog,
  cx,
  Field,
  Icon,
  IconButton,
  Note,
  Panel,
  useToast,
} from '../components/primitives';
import { ThemeSegmented } from '../components/shell/ThemeSegmented';
import { TroubleshootingCard } from '../components/TroubleshootingCard';
import { useAppData } from '../contexts/AppDataContext';
import { navigate, type SettingsSection, toHash } from '../router';
import {
  downloadJson,
  fileSafeName,
  fileTimestamp,
  pickJsonFile,
} from '../utils/downloadJson';

const SECTIONS: ReadonlyArray<{
  id: SettingsSection;
  label: string;
  icon: string;
}> = [
  { id: 'appearance', label: 'Appearance', icon: mdiThemeLightDark },
  { id: 'backups', label: 'Backups', icon: mdiBackupRestore },
  { id: 'assets', label: 'Custom assets', icon: mdiPaletteOutline },
  { id: 'firmware', label: 'Firmware', icon: mdiChip },
  { id: 'troubleshooting', label: 'Troubleshooting', icon: mdiLifebuoy },
];

const anchorId = (section: SettingsSection) => `settings-${section}`;

const INPUT =
  'h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 [@media(pointer:coarse)]:h-11';

const messageOf = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const SectionBlock = ({
  id,
  title,
  description,
  children,
}: {
  id: SettingsSection;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) => (
  <section
    id={anchorId(id)}
    data-section={id}
    aria-labelledby={`${anchorId(id)}-title`}
    className="scroll-mt-16 lg:scroll-mt-6"
  >
    <h2
      id={`${anchorId(id)}-title`}
      className="font-display text-lg font-semibold text-fg"
    >
      {title}
    </h2>
    {description && (
      <p className="mt-0.5 text-sm text-fg-muted">{description}</p>
    )}
    <div className="mt-3 flex flex-col gap-4">{children}</div>
  </section>
);

const Skeleton = ({ className }: { className?: string }) => (
  <div
    className={cx('animate-pulse rounded-lg bg-surface-2', className)}
    aria-hidden="true"
  />
);

const BackupsSection = () => {
  const { rooms, devices: allDevices, profiles, loading } = useAppData();
  const toast = useToast();
  const devices = useMemo(
    () =>
      allDevices.filter(
        (device) =>
          device.manufacturer?.toLowerCase().includes('everything') ||
          device.model?.toLowerCase().includes('presence'),
      ),
    [allDevices],
  );
  const [deviceId, setDeviceId] = useState('');
  const [backups, setBackups] = useState<ZoneBackup[]>([]);
  const [mapping, setMapping] = useState<DeviceMapping | null>(null);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ZoneBackup | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!deviceId && devices.length > 0) setDeviceId(devices[0].id);
  }, [devices, deviceId]);

  useEffect(() => {
    if (!deviceId) {
      setBackups([]);
      setMapping(null);
      return;
    }
    let cancelled = false;
    setLoadingBackups(true);
    Promise.all([fetchZoneBackups(deviceId), getDeviceMapping(deviceId)])
      .then(([res, deviceMapping]) => {
        if (cancelled) return;
        setBackups(res.backups ?? []);
        setMapping(deviceMapping);
      })
      .catch((err) => {
        if (!cancelled)
          toast.show(messageOf(err, 'Failed to load zone backups'), {
            tone: 'danger',
          });
      })
      .finally(() => {
        if (!cancelled) setLoadingBackups(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId, toast]);

  const device = devices.find((candidate) => candidate.id === deviceId) ?? null;
  const room =
    rooms.find((candidate) => candidate.deviceId === deviceId) ?? null;
  const profileId = mapping?.profileId ?? room?.profileId ?? '';
  const profile = profiles.find((candidate) => candidate.id === profileId);
  const entityNamePrefix =
    room?.entityNamePrefix || device?.entityNamePrefix || undefined;
  const entityMappings = mapping ? undefined : room?.entityMappings;

  const reload = async () => {
    if (!deviceId) return;
    setLoadingBackups(true);
    try {
      setBackups((await fetchZoneBackups(deviceId)).backups ?? []);
    } catch (err) {
      toast.show(messageOf(err, 'Failed to refresh zone backups'), {
        tone: 'danger',
      });
    } finally {
      setLoadingBackups(false);
    }
  };

  const target = (): string | null => {
    if (!deviceId) return 'Select a device first.';
    if (!profileId)
      return 'Device profile not found. Run entity discovery to sync the device.';
    if (!entityNamePrefix && !mapping)
      return 'Entity name prefix is missing. Link the device to a room or re-sync entities.';
    return null;
  };

  const create = async () => {
    const problem = target();
    if (problem) return toast.show(problem, { tone: 'danger' });
    setCreating(true);
    try {
      await createZoneBackup({
        deviceId,
        profileId,
        entityNamePrefix,
        entityMappings,
      });
      await reload();
      toast.show('Zone backup created.', { tone: 'success' });
    } catch (err) {
      toast.show(messageOf(err, 'Failed to create zone backup'), {
        tone: 'danger',
      });
    } finally {
      setCreating(false);
    }
  };

  const restore = async (backup: ZoneBackup) => {
    const problem = target();
    if (problem) return toast.show(problem, { tone: 'danger' });
    setRestoringId(backup.id);
    try {
      const result = await restoreZoneBackup(backup.id, {
        deviceId,
        profileId,
        entityNamePrefix,
        entityMappings,
      });
      if (!result.ok)
        toast.show(
          'Restore completed with errors. Check warnings and try again.',
          { tone: 'danger' },
        );
      else if (result.warnings && result.warnings.length > 0)
        toast.show(
          `Restore completed with ${result.warnings.length} warning(s).`,
          { tone: 'warning' },
        );
      else toast.show('Backup restored as polygon zones.', { tone: 'success' });
    } catch (err) {
      toast.show(messageOf(err, 'Failed to restore zone backup'), {
        tone: 'danger',
      });
    } finally {
      setRestoringId(null);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await deleteZoneBackup(deleting.id);
      setBackups((current) =>
        current.filter((entry) => entry.id !== deleting.id),
      );
      toast.show('Zone backup deleted.', { tone: 'success' });
      setDeleting(null);
    } catch (err) {
      toast.show(messageOf(err, 'Failed to delete zone backup'), {
        tone: 'danger',
      });
    } finally {
      setDeletingBusy(false);
    }
  };

  const download = (backup: ZoneBackup) =>
    downloadJson(
      `zone_backup_${fileSafeName(backup.deviceName || device?.name || backup.deviceId)}_${fileTimestamp(new Date(backup.createdAt))}.json`,
      backup,
    );

  const importBackups = async () => {
    try {
      const payload = await pickJsonFile();
      if (payload === null) return;
      setImporting(true);
      const result = await importZoneBackups(payload);
      await reload();
      toast.show(`Imported ${result.imported} backup(s).`, { tone: 'success' });
    } catch (err) {
      toast.show(messageOf(err, 'Failed to import zone backups'), {
        tone: 'danger',
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Panel
      title="Zone backups"
      actions={
        <>
          <Button
            size="sm"
            variant="ghost"
            icon={mdiImport}
            busy={importing}
            onClick={() => void importBackups()}
          >
            Import
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={mdiDownload}
            disabled={backups.length === 0}
            onClick={() =>
              downloadJson(`zone_backups_${fileTimestamp()}.json`, { backups })
            }
          >
            Download all
          </Button>
        </>
      }
    >
      {loading ? (
        <Skeleton className="h-28" />
      ) : devices.length === 0 ? (
        <p className="text-sm text-fg-muted">
          No Everything Presence devices found.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Device"
              htmlFor="backup-device"
              help="Only Everything Presence devices are listed."
            >
              <select
                id="backup-device"
                value={deviceId}
                onChange={(event) => setDeviceId(event.target.value)}
                className={INPUT}
              >
                {devices.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </Field>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 rounded-lg bg-surface-2 px-3 py-2.5 text-sm">
              <dt className="text-fg-muted">Profile</dt>
              <dd className="truncate text-right text-fg">
                {profile?.label ?? 'Unknown'}
              </dd>
              <dt className="text-fg-muted">Firmware</dt>
              <dd className="truncate text-right text-fg">
                {mapping?.firmwareVersion ??
                  device?.firmwareVersion ??
                  'Unknown'}
              </dd>
              <dt className="text-fg-muted">Entity mappings</dt>
              <dd className="text-right">
                {mapping ? (
                  <Badge tone="success">Synced</Badge>
                ) : (
                  <Badge tone="warning">Missing</Badge>
                )}
              </dd>
            </dl>
          </div>
          <p className="text-xs text-fg-muted">
            A backup reads the rectangular zones from the device. A restore
            writes them back as polygon zones.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              icon={mdiBackupRestore}
              busy={creating}
              disabled={!deviceId}
              onClick={() => void create()}
            >
              Back up now
            </Button>
            <IconButton
              icon={mdiRefresh}
              label="Refresh backups"
              variant="outline"
              busy={loadingBackups}
              disabled={!deviceId || loadingBackups}
              onClick={() => void reload()}
            />
          </div>
          {loadingBackups && backups.length === 0 ? (
            <Skeleton className="h-16" />
          ) : backups.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-sm text-fg-muted">
              No backups yet. Create one before updating firmware.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
              {backups.map((backup) => {
                const counts = { regular: 0, exclusion: 0, entry: 0 };
                for (const zone of backup.zones) counts[zone.type] += 1;
                const labelCount = Object.keys(backup.zoneLabels ?? {}).length;
                return (
                  <li
                    key={backup.id}
                    className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-fg">
                        {new Date(backup.createdAt).toLocaleString()}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
                        <span>
                          {counts.regular} zone{counts.regular === 1 ? '' : 's'}{' '}
                          · {counts.exclusion} exclusion · {counts.entry} entry
                        </span>
                        <span>
                          {backup.source}
                          {backup.firmwareVersion
                            ? ` · v${backup.firmwareVersion}`
                            : ''}
                        </span>
                        {labelCount > 0 && (
                          <Badge>
                            {labelCount} label{labelCount === 1 ? '' : 's'}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 self-end sm:self-auto">
                      <IconButton
                        icon={mdiBackupRestore}
                        label="Restore as polygon zones"
                        busy={restoringId === backup.id}
                        disabled={restoringId !== null}
                        onClick={() => void restore(backup)}
                      />
                      <IconButton
                        icon={mdiDownload}
                        label="Download"
                        onClick={() => download(backup)}
                      />
                      <IconButton
                        icon={mdiDeleteOutline}
                        label="Delete backup"
                        onClick={() => setDeleting(backup)}
                        className="hover:text-danger-ink"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this zone backup?"
        body={
          deleting
            ? `The backup from ${new Date(deleting.createdAt).toLocaleString()} is deleted. This cannot be undone.`
            : null
        }
        confirmLabel="Delete backup"
        tone="danger"
        busy={deletingBusy}
        onConfirm={() => void remove()}
        onCancel={() => setDeleting(null)}
      />
    </Panel>
  );
};

const FLOOR_DEFAULTS = {
  label: '',
  emoji: '🎨',
  color: '#808080',
  category: 'other',
  patternType: 'solid',
} as const satisfies Omit<CustomFloorMaterial, 'id' | 'createdAt'>;

const FURNITURE_DEFAULTS = {
  label: '',
  category: 'all',
  defaultWidth: 1000,
  defaultDepth: 1000,
  defaultHeight: 500,
  color: '#6B7280',
  shape: 'rectangle',
} as const satisfies Omit<CustomFurnitureType, 'id' | 'createdAt'>;

const SHAPE_ICON: Record<CustomFurnitureType['shape'], string> = {
  rectangle: mdiSquare,
  rounded: mdiSquareRounded,
  circle: mdiCircle,
  lshaped: mdiVectorPolyline,
};

type AssetDelete =
  | { kind: 'floor'; id: string; label: string }
  | { kind: 'furniture'; id: string; label: string };

const ColorField = ({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) => (
  <div className="flex gap-2">
    <input
      type="color"
      aria-label="Pick color"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-line bg-surface"
    />
    <input
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={INPUT}
    />
  </div>
);

const AssetsSection = () => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [floors, setFloors] = useState<CustomFloorMaterial[]>([]);
  const [furniture, setFurniture] = useState<CustomFurnitureType[]>([]);
  const [floorForm, setFloorForm] = useState<Omit<
    CustomFloorMaterial,
    'id' | 'createdAt'
  > | null>(null);
  const [furnitureForm, setFurnitureForm] = useState<Omit<
    CustomFurnitureType,
    'id' | 'createdAt'
  > | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AssetDelete | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [floorsRes, furnitureRes] = await Promise.all([
        fetchCustomFloors(),
        fetchCustomFurniture(),
      ]);
      setFloors(floorsRes.floors);
      setFurniture(furnitureRes.furniture);
      setLoadError(null);
    } catch (err) {
      setLoadError(messageOf(err, 'Failed to load custom assets'));
    } finally {
      setLoading(false);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount.
  useEffect(() => {
    void load();
  }, []);

  const createFloor = async () => {
    if (!floorForm) return;
    if (!floorForm.label.trim())
      return toast.show('Floor name is required', { tone: 'danger' });
    try {
      const res = await createCustomFloor({
        ...floorForm,
        label: floorForm.label.trim(),
      });
      setFloors((current) => [...current, res.floor]);
      setFloorForm(null);
      toast.show('Custom floor material created', { tone: 'success' });
    } catch (err) {
      toast.show(messageOf(err, 'Failed to create floor'), { tone: 'danger' });
    }
  };

  const createFurniture = async () => {
    if (!furnitureForm) return;
    if (!furnitureForm.label.trim())
      return toast.show('Furniture name is required', { tone: 'danger' });
    try {
      const res = await createCustomFurniture({
        ...furnitureForm,
        label: furnitureForm.label.trim(),
      });
      setFurniture((current) => [...current, res.furniture]);
      setFurnitureForm(null);
      toast.show('Custom furniture type created', { tone: 'success' });
    } catch (err) {
      toast.show(messageOf(err, 'Failed to create furniture'), {
        tone: 'danger',
      });
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { kind, id } = pendingDelete;
    try {
      if (kind === 'floor') {
        await deleteCustomFloor(id);
        setFloors((current) => current.filter((entry) => entry.id !== id));
        toast.show('Custom floor material deleted', { tone: 'success' });
      } else {
        await deleteCustomFurniture(id);
        setFurniture((current) => current.filter((entry) => entry.id !== id));
        toast.show('Custom furniture type deleted', { tone: 'success' });
      }
    } catch (err) {
      toast.show(messageOf(err, `Failed to delete ${kind}`), {
        tone: 'danger',
      });
    } finally {
      setPendingDelete(null);
    }
  };

  if (loading)
    return (
      <>
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </>
    );
  if (loadError)
    return (
      <Note
        tone="danger"
        title="Custom assets could not be loaded"
        actions={
          <Button size="sm" onClick={() => void load()}>
            Retry
          </Button>
        }
      >
        {loadError}
      </Note>
    );

  const addToggle = (open: boolean, label: string, onToggle: () => void) => (
    <Button
      size="sm"
      variant="ghost"
      icon={open ? mdiClose : mdiPlus}
      onClick={onToggle}
    >
      {open ? 'Cancel' : label}
    </Button>
  );

  return (
    <>
      <Panel
        title="Floor materials"
        actions={addToggle(floorForm !== null, 'Add floor', () =>
          setFloorForm(floorForm ? null : { ...FLOOR_DEFAULTS }),
        )}
      >
        {floorForm && (
          <form
            className="mb-4 grid gap-3 rounded-lg bg-surface-2 p-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void createFloor();
            }}
          >
            <Field label="Name" htmlFor="floor-label">
              <input
                id="floor-label"
                value={floorForm.label}
                placeholder="Marble white"
                onChange={(event) =>
                  setFloorForm({ ...floorForm, label: event.target.value })
                }
                className={INPUT}
              />
            </Field>
            <Field label="Emoji" htmlFor="floor-emoji">
              <input
                id="floor-emoji"
                value={floorForm.emoji}
                onChange={(event) =>
                  setFloorForm({ ...floorForm, emoji: event.target.value })
                }
                className={INPUT}
              />
            </Field>
            <Field label="Color" htmlFor="floor-color">
              <ColorField
                id="floor-color"
                value={floorForm.color}
                onChange={(color) => setFloorForm({ ...floorForm, color })}
              />
            </Field>
            <Field label="Category" htmlFor="floor-category">
              <select
                id="floor-category"
                value={floorForm.category}
                onChange={(event) =>
                  setFloorForm({
                    ...floorForm,
                    category: event.target
                      .value as CustomFloorMaterial['category'],
                  })
                }
                className={INPUT}
              >
                <option value="wood">Wood</option>
                <option value="carpet">Carpet</option>
                <option value="hard">Hard floor</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Pattern" htmlFor="floor-pattern">
              <select
                id="floor-pattern"
                value={floorForm.patternType}
                onChange={(event) =>
                  setFloorForm({
                    ...floorForm,
                    patternType: event.target
                      .value as CustomFloorMaterial['patternType'],
                  })
                }
                className={INPUT}
              >
                <option value="solid">Solid</option>
                <option value="stripes">Stripes</option>
                <option value="checker">Checker</option>
                <option value="dots">Dots</option>
              </select>
            </Field>
            <div className="flex items-end justify-end">
              <Button type="submit" variant="primary">
                Create floor
              </Button>
            </div>
          </form>
        )}
        {floors.length === 0 ? (
          <p className="text-sm text-fg-muted">
            No custom floor materials. Add your own to use in the room layout.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {floors.map((floor) => (
              <li key={floor.id} className="flex items-center gap-3 py-2">
                <span
                  className="h-8 w-8 shrink-0 rounded-md border border-line"
                  style={{ backgroundColor: floor.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-fg">
                    {floor.emoji} {floor.label}
                  </div>
                  <div className="text-xs capitalize text-fg-muted">
                    {floor.category} · {floor.patternType}
                  </div>
                </div>
                <IconButton
                  icon={mdiDeleteOutline}
                  label={`Delete ${floor.label}`}
                  onClick={() =>
                    setPendingDelete({
                      kind: 'floor',
                      id: floor.id,
                      label: floor.label,
                    })
                  }
                  className="hover:text-danger-ink"
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Furniture types"
        actions={addToggle(furnitureForm !== null, 'Add furniture', () =>
          setFurnitureForm(furnitureForm ? null : { ...FURNITURE_DEFAULTS }),
        )}
      >
        {furnitureForm && (
          <form
            className="mb-4 grid gap-3 rounded-lg bg-surface-2 p-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void createFurniture();
            }}
          >
            <Field label="Name" htmlFor="furniture-label">
              <input
                id="furniture-label"
                value={furnitureForm.label}
                placeholder="Bookshelf"
                onChange={(event) =>
                  setFurnitureForm({
                    ...furnitureForm,
                    label: event.target.value,
                  })
                }
                className={INPUT}
              />
            </Field>
            <Field label="Category" htmlFor="furniture-category">
              <select
                id="furniture-category"
                value={furnitureForm.category}
                onChange={(event) =>
                  setFurnitureForm({
                    ...furnitureForm,
                    category: event.target
                      .value as CustomFurnitureType['category'],
                  })
                }
                className={INPUT}
              >
                <option value="all">All rooms</option>
                <option value="bedroom">Bedroom</option>
                <option value="living-room">Living room</option>
                <option value="office">Office</option>
                <option value="dining">Dining</option>
              </select>
            </Field>
            {(
              [
                ['defaultWidth', 'Width', 10000],
                ['defaultDepth', 'Depth', 10000],
                ['defaultHeight', 'Height', 5000],
              ] as const
            ).map(([key, label, max]) => (
              <Field
                key={key}
                label={label}
                unit="mm"
                htmlFor={`furniture-${key}`}
              >
                <input
                  id={`furniture-${key}`}
                  type="number"
                  inputMode="numeric"
                  min={100}
                  max={max}
                  value={furnitureForm[key]}
                  onChange={(event) =>
                    setFurnitureForm({
                      ...furnitureForm,
                      [key]: Number(event.target.value),
                    })
                  }
                  className={cx(INPUT, 'tabular-nums')}
                />
              </Field>
            ))}
            <Field label="Shape" htmlFor="furniture-shape">
              <select
                id="furniture-shape"
                value={furnitureForm.shape}
                onChange={(event) =>
                  setFurnitureForm({
                    ...furnitureForm,
                    shape: event.target.value as CustomFurnitureType['shape'],
                  })
                }
                className={INPUT}
              >
                <option value="rectangle">Rectangle</option>
                <option value="rounded">Rounded</option>
                <option value="circle">Circle</option>
                <option value="lshaped">L-shaped</option>
              </select>
            </Field>
            <Field label="Color" htmlFor="furniture-color">
              <ColorField
                id="furniture-color"
                value={furnitureForm.color}
                onChange={(color) =>
                  setFurnitureForm({ ...furnitureForm, color })
                }
              />
            </Field>
            <div className="flex items-end justify-end sm:col-span-2">
              <Button type="submit" variant="primary">
                Create furniture
              </Button>
            </div>
          </form>
        )}
        {furniture.length === 0 ? (
          <p className="text-sm text-fg-muted">
            No custom furniture types. Add your own to use in the room layout.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {furniture.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2"
                  style={{ color: item.color }}
                >
                  <Icon path={SHAPE_ICON[item.shape]} size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-fg">
                    {item.label}
                  </div>
                  <div className="text-xs text-fg-muted">
                    {item.category} · {item.defaultWidth}×{item.defaultDepth} mm
                    · {item.shape}
                  </div>
                </div>
                <IconButton
                  icon={mdiDeleteOutline}
                  label={`Delete ${item.label}`}
                  onClick={() =>
                    setPendingDelete({
                      kind: 'furniture',
                      id: item.id,
                      label: item.label,
                    })
                  }
                  className="hover:text-danger-ink"
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete "${pendingDelete?.label}"?`}
        body={`The custom ${pendingDelete?.kind === 'floor' ? 'floor material' : 'furniture type'} is deleted. This cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
};

/** Keeps the route section and the scroll position in step: the route scrolls its section into view, scrolling replaces the route. */
const scrollToSection = (
  top: HTMLElement | null,
  target: SettingsSection,
  behavior: ScrollBehavior,
) =>
  (target === SECTIONS[0].id
    ? top
    : document.getElementById(anchorId(target))
  )?.scrollIntoView({ block: 'start', behavior });

const PIN_MS = 2500;

const useSectionSync = (section: SettingsSection) => {
  const observed = useRef<SettingsSection | null>(null);
  const mounted = useRef(false);
  const topRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Sections above load asynchronously; until the user scrolls, re-align the routed section as they grow or shrink.
  const pin = useRef<{ section: SettingsSection; until: number } | null>(null);

  useLayoutEffect(() => {
    if (observed.current === section) return;
    scrollToSection(
      topRef.current,
      section,
      mounted.current ? 'smooth' : 'auto',
    );
    pin.current = { section, until: performance.now() + PIN_MS };
    mounted.current = true;
  }, [section]);

  useEffect(() => {
    const top = topRef.current;
    if (!top) return;
    const unpin = () => {
      pin.current = null;
    };
    const resize = new ResizeObserver(() => {
      if (pin.current && performance.now() < pin.current.until)
        scrollToSection(top, pin.current.section, 'auto');
    });
    resize.observe(top);
    for (const type of ['wheel', 'touchstart', 'keydown'])
      window.addEventListener(type, unpin, { capture: true, passive: true });
    return () => {
      resize.disconnect();
      for (const type of ['wheel', 'touchstart', 'keydown'])
        window.removeEventListener(type, unpin, { capture: true });
    };
  }, []);

  useEffect(() => {
    const sections = SECTIONS.map(({ id }) =>
      document.getElementById(anchorId(id)),
    ).filter((element): element is HTMLElement => element !== null);
    const end = endRef.current;
    let atEnd = false;
    const pick = () => {
      const band = window.innerHeight * 0.3;
      let current: SettingsSection = SECTIONS[0].id;
      for (const element of sections)
        if (element.getBoundingClientRect().top <= band)
          current = element.dataset.section as SettingsSection;
      if (atEnd) current = SECTIONS[SECTIONS.length - 1].id;
      if (current === observed.current) return;
      observed.current = current;
      navigate({ name: 'settings', section: current }, { replace: true });
    };
    const observer = new IntersectionObserver(pick, {
      rootMargin: '0px 0px -70% 0px',
    });
    const endObserver = new IntersectionObserver(
      ([entry]) => {
        atEnd = entry.isIntersecting;
        pick();
      },
      { threshold: [1] },
    );
    for (const element of sections) observer.observe(element);
    if (end) endObserver.observe(end);
    return () => {
      observer.disconnect();
      endObserver.disconnect();
    };
  }, []);

  const jump = (target: SettingsSection) => {
    observed.current = null;
    if (target === section) scrollToSection(topRef.current, target, 'smooth');
  };

  return { topRef, endRef, jump };
};

export interface SettingsPageProps {
  section: SettingsSection;
}

export const SettingsPage = ({ section }: SettingsPageProps) => {
  const { appVersion } = useAppData();
  const toast = useToast();
  const { topRef, endRef, jump } = useSectionSync(section);

  const link = (id: SettingsSection) => ({
    href: toHash({ name: 'settings', section: id }),
    'aria-current': id === section ? ('location' as const) : undefined,
    onClick: () => jump(id),
  });

  return (
    <div
      ref={topRef}
      className="mx-auto flex w-full max-w-[64rem] gap-8 px-4 pb-10 pt-6 sm:px-6"
    >
      <nav
        aria-label="Settings sections"
        className="hidden w-48 shrink-0 lg:block"
      >
        <ul className="sticky top-6 flex flex-col gap-0.5">
          {SECTIONS.map(({ id, label, icon }) => (
            <li key={id}>
              <a
                {...link(id)}
                className={cx(
                  'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  id === section
                    ? 'bg-accent-tint font-medium text-fg'
                    : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                <Icon
                  path={icon}
                  size={20}
                  className={id === section ? 'text-accent-ink' : undefined}
                />
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 max-w-3xl flex-1">
        <h1 className="font-display text-2xl font-semibold text-fg">
          Settings
        </h1>
        <nav
          aria-label="Settings sections"
          className="sticky top-0 z-20 -mx-4 mt-2 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden"
        >
          <ul className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
            {SECTIONS.map(({ id, label }) => (
              <li key={id} className="shrink-0">
                <a
                  {...link(id)}
                  className={cx(
                    'inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [@media(pointer:coarse)]:h-10',
                    id === section
                      ? 'border-accent/50 bg-accent-tint font-medium text-accent-ink'
                      : 'border-line text-fg-muted hover:bg-surface-2',
                  )}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-6 flex flex-col gap-10">
          <SectionBlock
            id="appearance"
            title="Appearance"
            description="Match Home Assistant follows the light or dark setting of the screen you are using."
          >
            <div>
              <ThemeSegmented />
            </div>
          </SectionBlock>

          <SectionBlock
            id="backups"
            title="Backups"
            description="Back up rectangular zones and restore them as polygons after firmware updates. Room backups live on the Rooms screen."
          >
            <BackupsSection />
          </SectionBlock>

          <SectionBlock
            id="assets"
            title="Custom assets"
            description="Floor materials and furniture types for the room layout."
          >
            <AssetsSection />
          </SectionBlock>

          <SectionBlock
            id="firmware"
            title="Firmware"
            description="Update Everything Presence devices with firmware served by this add-on, which helps devices that struggle with HTTPS downloads."
          >
            <FirmwareUpdateSection
              onError={(message) => toast.show(message, { tone: 'danger' })}
              onSuccess={(message) =>
                toast.show(message, { tone: 'success', durationMs: 5000 })
              }
            />
          </SectionBlock>

          <SectionBlock
            id="troubleshooting"
            title="Troubleshooting"
            description="Record logs while you reproduce a problem, then share one file."
          >
            <TroubleshootingCard />
          </SectionBlock>
        </div>
        <div ref={endRef} className="h-px" />
        {appVersion && (
          <p className="mt-8 text-center text-xs text-fg-subtle lg:hidden">
            Zone Configurator v{appVersion}
          </p>
        )}
      </div>
    </div>
  );
};
