import type { ComponentProps } from 'react';
import { ZoneEditorPage } from '../ZoneEditorPage';
import type { RoomFrame } from './types';

export interface ZonesEntryProps {
  frame: RoomFrame;
  legacy: Omit<ComponentProps<typeof ZoneEditorPage>, 'onWizardZonesReady'>;
  onWizardZonesReady: () => void;
  onShowShortcuts: () => void;
}

export const ZonesEntry = ({ legacy, onWizardZonesReady }: ZonesEntryProps) => (
  <div className="relative min-h-0 flex-1">
    <ZoneEditorPage {...legacy} onWizardZonesReady={onWizardZonesReady} />
  </div>
);
