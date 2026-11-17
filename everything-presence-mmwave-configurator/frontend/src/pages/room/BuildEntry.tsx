import { LayoutMode, type LayoutModeProps } from './layout/LayoutMode';

export const BuildEntry = ({
  frame,
  onWizardProgress,
  onShowShortcuts,
}: LayoutModeProps) => (
  <LayoutMode
    key={frame.room.id}
    frame={frame}
    onWizardProgress={onWizardProgress}
    onShowShortcuts={onShowShortcuts}
  />
);
