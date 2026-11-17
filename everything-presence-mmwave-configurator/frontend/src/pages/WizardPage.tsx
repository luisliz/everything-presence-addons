import {
  mdiClose,
  mdiDotsVertical,
  mdiFormatListNumbered,
  mdiRestart,
} from '@mdi/js';
import { useEffect, useState } from 'react';
import type { LiveState } from '../api/types';
import { EntityDiscovery } from '../components/EntityDiscovery';
import {
  Button,
  IconButton,
  Menu,
  Note,
  Sheet,
} from '../components/primitives';
import { useAppData } from '../contexts/AppDataContext';
import { RoomScreen } from './RoomScreen';
import type { TargetPosition } from './room/types';
import { DeviceStep } from './wizard/DeviceStep';
import { FinishStep } from './wizard/FinishStep';
import { RoomChoiceStep } from './wizard/RoomChoiceStep';
import { RoomDetailsStep } from './wizard/RoomDetailsStep';
import { StepFrame } from './wizard/StepFrame';
import { StepList } from './wizard/StepList';
import {
  type CanvasStep,
  isCanvasStep,
  nextBlocker,
  STEP_TITLE,
} from './wizard/steps';
import { useWizard, type Wizard } from './wizard/useWizard';

export interface WizardPageProps {
  liveState: LiveState | null;
  targetPositions: TargetPosition[];
  /** The room the wizard edits, so the app streams its live state. */
  onRoomChange: (roomId: string) => void;
  onExit: () => void;
}

const INSTRUCTION: Record<CanvasStep, string> = {
  outline:
    'Start from a shape, or draw the walls with the Walls tool. Save the layout, then press Next.',
  placement:
    'Drag the device to where it hangs and turn it to face the room. Save the layout, then press Next.',
  doors:
    'Pick the Door tool and click a wall to add a door. Save the layout before Next.',
  furniture:
    'Pick Furniture to open the library and place items. Save the layout before Next.',
  zones:
    'Draw a zone with the Rectangle or Polygon tool, then press Save zones.',
};

const ProgressBar = ({ value }: { value: number }) => (
  <div
    role="progressbar"
    aria-label="Setup progress"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(value * 100)}
    className="h-1 w-full overflow-hidden rounded-full bg-surface-2"
  >
    <div
      className="h-full rounded-full bg-accent transition-[width]"
      style={{ width: `${value * 100}%` }}
    />
  </div>
);

const CanvasStepBody = ({
  wizard,
  step,
  liveState,
  targetPositions,
}: {
  wizard: Wizard;
  step: CanvasStep;
  liveState: LiveState | null;
  targetPositions: TargetPosition[];
}) => {
  if (!wizard.room)
    return (
      <StepFrame title={STEP_TITLE[step]} onBack={wizard.back}>
        <Note
          tone="warning"
          title="No room for this device yet"
          actions={
            <Button size="sm" onClick={() => wizard.goTo('roomChoice')}>
              Choose a room
            </Button>
          }
        >
          This step draws in the device's room. Create or pick one first.
        </Note>
      </StepFrame>
    );
  const blocker = nextBlocker(step, wizard.progress);
  return (
    <RoomScreen
      roomId={wizard.room.id}
      mode={step === 'zones' ? 'zones' : 'build'}
      liveState={liveState}
      targetPositions={targetPositions}
      onWizardProgress={wizard.onLayoutSaved}
      onWizardZonesReady={wizard.onZonesSaved}
      wizard={{
        step,
        instruction: INSTRUCTION[step],
        canNext: blocker === null,
        nextHint: blocker,
        onBack: wizard.back,
        onNext: wizard.next,
      }}
    />
  );
};

export const WizardPage = ({
  liveState,
  targetPositions,
  onRoomChange,
  onExit,
}: WizardPageProps) => {
  const { devices, rooms } = useAppData();
  const wizard = useWizard();
  const [listOpen, setListOpen] = useState(false);
  const { step, steps, index } = wizard;
  const position = `Step ${index + 1} of ${steps.length}`;
  const roomId = wizard.room?.id;

  useEffect(() => {
    if (roomId) onRoomChange(roomId);
  }, [onRoomChange, roomId]);

  const menu = (
    <Menu
      label="Setup actions"
      trigger={
        <IconButton
          icon={mdiDotsVertical}
          label="Setup actions"
          tooltipSide="bottom"
        />
      }
      items={[
        { label: 'Start over', icon: mdiRestart, onSelect: wizard.startOver },
      ]}
    />
  );
  const exit = (
    <IconButton
      icon={mdiClose}
      label="Exit setup"
      tooltipSide="bottom"
      onClick={onExit}
    />
  );

  const body = (() => {
    if (isCanvasStep(step))
      return (
        <CanvasStepBody
          wizard={wizard}
          step={step}
          liveState={liveState}
          targetPositions={targetPositions}
        />
      );
    switch (step) {
      case 'device':
        return (
          <DeviceStep
            devices={devices}
            rooms={rooms}
            deviceId={wizard.deviceId}
            onSelect={wizard.selectDevice}
            onContinue={wizard.next}
          />
        );
      case 'entityDiscovery':
        return wizard.deviceId && wizard.profileId ? (
          <div className="mx-auto h-full w-full max-w-3xl md:py-4">
            <EntityDiscovery
              deviceId={wizard.deviceId}
              profileId={wizard.profileId}
              deviceName={wizard.device?.name ?? wizard.deviceId}
              onComplete={(_, saved) => wizard.completeDiscovery(saved)}
              onCancel={wizard.back}
            />
          </div>
        ) : (
          <StepFrame title={STEP_TITLE.entityDiscovery} onBack={wizard.back}>
            <Note tone="warning" title="No device profile">
              The device model does not match a known profile. Choose another
              device.
            </Note>
          </StepFrame>
        );
      case 'roomChoice':
        return (
          <RoomChoiceStep
            value={wizard.roomPath}
            onChange={wizard.setRoomPath}
            hasFreeRooms={rooms.some((room) => !room.deviceId)}
            busy={wizard.busy}
            error={wizard.error}
            onBack={wizard.back}
            onContinue={wizard.continueFromRoomChoice}
          />
        );
      case 'roomDetails':
        return (
          <RoomDetailsStep
            path={wizard.roomPath === 'existing' ? 'existing' : 'new'}
            rooms={rooms}
            devices={devices}
            busy={wizard.busy}
            error={wizard.error}
            onBack={wizard.back}
            onCreate={wizard.createNamedRoom}
            onBind={wizard.bindExistingRoom}
          />
        );
      default:
        return (
          <FinishStep
            room={wizard.room}
            device={wizard.device}
            profile={wizard.profile}
            onBack={wizard.back}
            onOpen={wizard.finish}
            onStartOver={wizard.startOver}
          />
        );
    }
  })();

  return (
    <div className="flex h-full flex-col">
      <header className="hidden h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-4 md:flex">
        <h1 className="min-w-0 flex-1 truncate text-lg font-medium text-fg">
          Set up a device
        </h1>
        {menu}
        {exit}
      </header>
      <div className="flex shrink-0 flex-col gap-2 border-b border-line bg-surface px-4 py-2 lg:hidden">
        <div className="flex items-center gap-1">
          <p className="min-w-0 flex-1 truncate text-sm text-fg">
            <span className="tabular-nums text-fg-muted">{position}, </span>
            <span className="font-medium">{STEP_TITLE[step]}</span>
          </p>
          <IconButton
            icon={mdiFormatListNumbered}
            label="All steps"
            onClick={() => setListOpen(true)}
          />
          <span className="flex md:hidden">
            {menu}
            {exit}
          </span>
        </div>
        <ProgressBar value={(index + 1) / steps.length} />
      </div>
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Setup"
          className="hidden w-64 shrink-0 overflow-y-auto border-r border-line bg-surface p-3 lg:block"
        >
          <StepList steps={steps} current={step} onSelect={wizard.goTo} />
        </nav>
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          {body}
        </div>
      </div>
      <Sheet
        open={listOpen}
        onClose={() => setListOpen(false)}
        variant="bottom"
        title="Setup steps"
        description={position}
      >
        <StepList
          steps={steps}
          current={step}
          onSelect={(target) => {
            setListOpen(false);
            wizard.goTo(target);
          }}
        />
      </Sheet>
    </div>
  );
};
