import { mdiArrowLeft, mdiArrowRight } from '@mdi/js';
import { Button, Icon, Tooltip } from '../../components/primitives';

export interface StepStripProps {
  title: string;
  instruction: string;
  canNext: boolean;
  /** Why Next is disabled; shown as its tooltip. */
  nextHint?: string | null;
  onBack: () => void;
  onNext: () => void;
}

export const StepStrip = ({
  title,
  instruction,
  canNext,
  nextHint,
  onBack,
  onNext,
}: StepStripProps) => (
  <section
    aria-label="Setup step"
    className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-3 max-lg:py-2"
  >
    <div className="min-w-0 flex-1 basis-64">
      <h2 className="text-base font-medium text-fg max-lg:sr-only">{title}</h2>
      <p className="text-sm text-fg-muted">{instruction}</p>
    </div>
    <div className="flex shrink-0 items-center gap-2 max-md:w-full max-md:justify-end">
      <Button icon={mdiArrowLeft} onClick={onBack}>
        Back
      </Button>
      <Tooltip content={canNext ? null : nextHint}>
        <Button variant="primary" disabled={!canNext} onClick={onNext}>
          Next
          <Icon path={mdiArrowRight} size={20} />
        </Button>
      </Tooltip>
    </div>
  </section>
);
