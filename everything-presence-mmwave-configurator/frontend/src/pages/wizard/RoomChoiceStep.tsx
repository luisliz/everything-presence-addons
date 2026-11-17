import { mdiDebugStepOver, mdiHomeOutline, mdiHomePlusOutline } from '@mdi/js';
import { Button, ChoiceList } from '../../components/primitives';
import { StepFrame } from './StepFrame';
import type { RoomPath } from './steps';

export interface RoomChoiceStepProps {
  value: RoomPath | null;
  onChange: (path: RoomPath) => void;
  hasFreeRooms: boolean;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onContinue: () => void;
}

export const RoomChoiceStep = ({
  value,
  onChange,
  hasFreeRooms,
  busy,
  error,
  onBack,
  onContinue,
}: RoomChoiceStepProps) => (
  <StepFrame
    title="Choose a room"
    description="Draw a new room, reuse a room without a device, or skip the floor plan."
    error={error}
    onBack={onBack}
    action={
      <Button
        variant="primary"
        disabled={!value}
        busy={busy}
        onClick={onContinue}
      >
        Continue
      </Button>
    }
  >
    <ChoiceList<RoomPath>
      ariaLabel="Room"
      value={value}
      onChange={onChange}
      options={[
        {
          value: 'new',
          title: 'New room',
          subtitle: 'Name it, then draw the walls and place the device.',
          icon: mdiHomePlusOutline,
        },
        {
          value: 'existing',
          title: 'Existing room',
          subtitle: hasFreeRooms
            ? 'Link the device to a room that has none.'
            : 'Every room already has a device.',
          icon: mdiHomeOutline,
          disabled: !hasFreeRooms,
        },
        {
          value: 'skip',
          title: 'Skip',
          subtitle: 'Use a generic radar view without walls.',
          icon: mdiDebugStepOver,
        },
      ]}
    />
  </StepFrame>
);
