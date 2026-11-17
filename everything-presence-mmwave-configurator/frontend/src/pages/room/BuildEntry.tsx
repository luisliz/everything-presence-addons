import { LayoutMode, type LayoutModeProps } from './layout/LayoutMode';

export interface BuildEntryProps extends LayoutModeProps {
  legacy?: unknown;
}

export const BuildEntry = ({
  frame,
  onWizardProgress,
  onShowShortcuts,
}: BuildEntryProps) => (
  <LayoutMode
    key={frame.room.id}
    frame={frame}
    onWizardProgress={onWizardProgress}
    onShowShortcuts={onShowShortcuts}
  />
);
