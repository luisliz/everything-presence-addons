import { mdiAccessPoint, mdiLockOutline } from '@mdi/js';
import type { DiscoveredDevice, RoomConfig } from '../../api/types';
import {
  Badge,
  Button,
  ChoiceList,
  type ChoiceOption,
  Note,
} from '../../components/primitives';
import { navigate, roomRoute } from '../../router';
import { StepFrame } from './StepFrame';

export interface DeviceStepProps {
  devices: DiscoveredDevice[];
  rooms: RoomConfig[];
  deviceId: string | null;
  onSelect: (device: DiscoveredDevice) => void;
  onContinue: () => void;
}

export const DeviceStep = ({
  devices,
  rooms,
  deviceId,
  onSelect,
  onContinue,
}: DeviceStepProps) => {
  const options: ChoiceOption<string>[] = devices.map((device) => {
    const room =
      device.id === deviceId
        ? undefined
        : rooms.find((candidate) => candidate.deviceId === device.id);
    const details = [
      device.model ?? 'Unknown model',
      device.firmwareVersion && `v${device.firmwareVersion}`,
      device.areaName && `Area ${device.areaName}`,
    ].filter(Boolean);
    return {
      value: device.id,
      title: device.name,
      subtitle: (
        <>
          {room && <span className="sm:hidden">In {room.name} · </span>}
          {details.join(' · ')}
        </>
      ),
      icon: room ? mdiLockOutline : mdiAccessPoint,
      disabled: Boolean(room),
      trailing: room && (
        <span className="flex shrink-0 items-center gap-2">
          <Badge className="max-sm:hidden">In {room.name}</Badge>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate(roomRoute(room.id))}
          >
            Open room
          </Button>
        </span>
      ),
    };
  });

  return (
    <StepFrame
      title="Choose a device"
      description="Pick the Everything Presence device to set up. A device belongs to one room."
      action={
        <Button variant="primary" disabled={!deviceId} onClick={onContinue}>
          Continue
        </Button>
      }
    >
      {devices.length === 0 ? (
        <Note tone="info" title="No devices found">
          Check that the device is powered on and added to Home Assistant.
        </Note>
      ) : (
        <ChoiceList
          ariaLabel="Device"
          value={deviceId}
          options={options}
          onChange={(id) => {
            const device = devices.find((candidate) => candidate.id === id);
            if (device) onSelect(device);
          }}
        />
      )}
    </StepFrame>
  );
};
