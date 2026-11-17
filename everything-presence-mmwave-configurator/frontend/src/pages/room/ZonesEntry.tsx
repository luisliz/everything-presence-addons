import type { RoomFrame } from './types';
import { ZonesMode } from './zones/ZonesMode';

export interface ZonesEntryProps {
  frame: RoomFrame;
  /** Still passed by the room screen; Zones mode reads everything from `frame`. */
  legacy?: unknown;
  onWizardZonesReady: () => void;
  onShowShortcuts: () => void;
}

export const ZonesEntry = ({
  frame,
  onWizardZonesReady,
  onShowShortcuts,
}: ZonesEntryProps) => (
  <ZonesMode
    frame={frame}
    onWizardZonesReady={onWizardZonesReady}
    onShowShortcuts={onShowShortcuts}
  />
);
