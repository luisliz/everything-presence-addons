import {
  mdiBackupRestore,
  mdiDeleteOutline,
  mdiDownload,
  mdiRefresh,
} from '@mdi/js';
import { useCallback, useEffect, useState } from 'react';
import { deleteZoneBackup, fetchZoneBackups } from '../../../api/client';
import type { ZoneBackup } from '../../../api/types';
import {
  Badge,
  ConfirmDialog,
  IconButton,
  Sheet,
  useToast,
} from '../../../components/primitives';
import {
  downloadJson,
  fileSafeName,
  fileTimestamp,
} from '../../../utils/downloadJson';
import type { ZonesEditor } from './useZonesEditor';

export interface ZoneBackupsSheetProps {
  open: boolean;
  onClose: () => void;
  deviceId: string;
  deviceName: string;
  editor: ZonesEditor;
}

const messageOf = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

export const ZoneBackupsSheet = ({
  open,
  onClose,
  deviceId,
  deviceName,
  editor,
}: ZoneBackupsSheetProps) => {
  const toast = useToast();
  const [backups, setBackups] = useState<ZoneBackup[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ZoneBackup | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const { reloadBackups } = editor;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { backups: list } = await fetchZoneBackups(deviceId);
      setBackups(
        [...(list ?? [])].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );
    } catch (err) {
      toast.show(messageOf(err, 'Could not load the zone backups'), {
        tone: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [deviceId, toast]);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  const restore = async (backup: ZoneBackup) => {
    setRestoringId(backup.id);
    if (await editor.restoreBackup(backup)) onClose();
    setRestoringId(null);
  };

  const remove = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await deleteZoneBackup(deleting.id);
      setBackups((current) => current.filter((b) => b.id !== deleting.id));
      void reloadBackups();
      toast.show('Zone backup deleted.', { tone: 'success' });
      setDeleting(null);
    } catch (err) {
      toast.show(messageOf(err, 'Could not delete the zone backup'), {
        tone: 'danger',
      });
    } finally {
      setDeletingBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="side"
      title="Zone backups"
      description={deviceName}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-xs text-fg-muted">
            A restore writes the backup to the device as polygon zones.
          </p>
          <IconButton
            icon={mdiRefresh}
            label="Refresh backups"
            variant="outline"
            busy={loading}
            disabled={loading}
            onClick={() => void reload()}
          />
        </div>
        {loading && backups.length === 0 ? (
          <div
            aria-hidden="true"
            className="h-16 animate-pulse rounded-lg bg-surface-2"
          />
        ) : backups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-sm text-fg-muted">
            No backups yet for this device.
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
                  className="flex items-center gap-2 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-fg">
                      {new Date(backup.createdAt).toLocaleString()}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
                      <span>
                        {counts.regular} zone{counts.regular === 1 ? '' : 's'} ·{' '}
                        {counts.exclusion} exclusion · {counts.entry} entry
                      </span>
                      <span>
                        {backup.source}
                        {backup.firmwareVersion
                          ? ` · v${backup.firmwareVersion}`
                          : ''}
                      </span>
                      {labelCount > 0 && (
                        <Badge>
                          {labelCount} name{labelCount === 1 ? '' : 's'}
                        </Badge>
                      )}
                    </div>
                  </div>
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
                    onClick={() =>
                      downloadJson(
                        `zone_backup_${fileSafeName(backup.deviceName || deviceName)}_${fileTimestamp(new Date(backup.createdAt))}.json`,
                        backup,
                      )
                    }
                  />
                  <IconButton
                    icon={mdiDeleteOutline}
                    label="Delete backup"
                    className="hover:text-danger-ink"
                    onClick={() => setDeleting(backup)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
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
    </Sheet>
  );
};
