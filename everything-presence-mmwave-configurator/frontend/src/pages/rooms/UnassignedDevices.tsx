import { mdiPlus } from '@mdi/js';
import type { DiscoveredDevice } from '../../api/types';
import { Badge, Button, Note } from '../../components/primitives';

export interface UnassignedDevicesProps {
  devices: DiscoveredDevice[];
  modelOf: (device: DiscoveredDevice) => string | undefined;
  onSetUp: (device: DiscoveredDevice) => void;
}

export const UnassignedDevices = ({
  devices,
  modelOf,
  onSetUp,
}: UnassignedDevicesProps) => {
  if (devices.length === 0) return null;
  return (
    <Note
      tone="info"
      title={
        devices.length === 1
          ? '1 device is not in a room'
          : `${devices.length} devices are not in a room`
      }
    >
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {devices.map((device) => {
          const model = modelOf(device);
          return (
            <li
              key={device.id}
              className="flex min-h-11 items-center gap-2 py-1.5"
            >
              {model && <Badge>{model}</Badge>}
              <span className="min-w-0 flex-1 truncate">{device.name}</span>
              {device.areaName && (
                <span className="hidden truncate text-xs text-fg-muted sm:inline">
                  {device.areaName}
                </span>
              )}
              <Button
                size="sm"
                variant="ghost"
                icon={mdiPlus}
                onClick={() => onSetUp(device)}
              >
                Set up
              </Button>
            </li>
          );
        })}
      </ul>
    </Note>
  );
};
