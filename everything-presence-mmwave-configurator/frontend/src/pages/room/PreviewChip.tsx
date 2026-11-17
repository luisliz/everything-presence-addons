import { mdiClose, mdiEyeOutline } from '@mdi/js';
import { Badge, Button, IconButton } from '../../components/primitives';

export interface PreviewChipProps {
  count: number;
  busy?: boolean;
  onApply: () => void;
  onDiscard: () => void;
}

export const PreviewChip = ({
  count,
  busy,
  onApply,
  onDiscard,
}: PreviewChipProps) => (
  <output
    aria-live="polite"
    className="flex items-center gap-2 rounded-xl border border-accent/40 bg-surface/95 py-1 pl-2 pr-1 shadow-e1"
  >
    <Badge tone="accent" icon={mdiEyeOutline}>
      Previewing {count} unapplied {count === 1 ? 'change' : 'changes'}
    </Badge>
    <Button size="sm" variant="primary" busy={busy} onClick={onApply}>
      Apply
    </Button>
    <IconButton
      icon={mdiClose}
      label="Discard changes"
      size="sm"
      disabled={busy}
      onClick={onDiscard}
    />
  </output>
);
