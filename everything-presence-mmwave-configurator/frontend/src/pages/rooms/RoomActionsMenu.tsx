import {
  mdiDeleteOutline,
  mdiDotsVertical,
  mdiExport,
  mdiLinkOff,
  mdiLinkVariantPlus,
  mdiPencilOutline,
  mdiStarOffOutline,
  mdiStarOutline,
  mdiSync,
} from '@mdi/js';
import type { RoomConfig } from '../../api/types';
import { IconButton, Menu, type MenuItem } from '../../components/primitives';

export interface RoomActionHandlers {
  onRename: () => void;
  onToggleDefault: () => void;
  onResync: () => void;
  onLinkDevice: () => void;
  onUnlink: () => void;
  onExport: () => void;
  onDelete: () => void;
}

export interface RoomActionsMenuProps extends RoomActionHandlers {
  room: RoomConfig;
  isDefault: boolean;
  busy: boolean;
}

export const RoomActionsMenu = ({
  room,
  isDefault,
  busy,
  onRename,
  onToggleDefault,
  onResync,
  onLinkDevice,
  onUnlink,
  onExport,
  onDelete,
}: RoomActionsMenuProps) => {
  const items: MenuItem[] = [
    { label: 'Rename', icon: mdiPencilOutline, onSelect: onRename },
    isDefault
      ? {
          label: 'Clear default',
          icon: mdiStarOffOutline,
          onSelect: onToggleDefault,
        }
      : {
          label: 'Set as default',
          icon: mdiStarOutline,
          onSelect: onToggleDefault,
        },
    ...(room.deviceId
      ? [
          ...(room.profileId
            ? [{ label: 'Re-sync entities', icon: mdiSync, onSelect: onResync }]
            : []),
          { label: 'Unlink device', icon: mdiLinkOff, onSelect: onUnlink },
        ]
      : [
          {
            label: 'Link a device',
            icon: mdiLinkVariantPlus,
            onSelect: onLinkDevice,
          },
        ]),
    { label: 'Export', icon: mdiExport, onSelect: onExport },
    {
      label: 'Delete',
      icon: mdiDeleteOutline,
      onSelect: onDelete,
      danger: true,
    },
  ];
  return (
    <Menu
      label={`${room.name} actions`}
      items={items}
      trigger={
        <IconButton
          icon={mdiDotsVertical}
          label="Room actions"
          size="sm"
          busy={busy}
          disabled={busy}
        />
      }
    />
  );
};
