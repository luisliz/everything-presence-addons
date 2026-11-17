import type { ComponentProps } from 'react';
import { RoomBuilderPage } from '../RoomBuilderPage';
import type { RoomFrame } from './types';

export interface BuildEntryProps {
  frame: RoomFrame;
  legacy: Omit<ComponentProps<typeof RoomBuilderPage>, 'onWizardProgress'>;
  onWizardProgress: ComponentProps<typeof RoomBuilderPage>['onWizardProgress'];
  onShowShortcuts: () => void;
}

export const BuildEntry = ({ legacy, onWizardProgress }: BuildEntryProps) => (
  <div className="relative min-h-0 flex-1">
    <RoomBuilderPage {...legacy} onWizardProgress={onWizardProgress} />
  </div>
);
