import { mdiCheck } from '@mdi/js';
import { cx, Icon } from '../../components/primitives';
import { STEP_TITLE, type StepKey } from './steps';

export interface StepListProps {
  steps: StepKey[];
  current: StepKey;
  onSelect: (step: StepKey) => void;
  className?: string;
}

export const StepList = ({
  steps,
  current,
  onSelect,
  className,
}: StepListProps) => {
  const currentIndex = steps.indexOf(current);
  return (
    <ol
      aria-label="Setup steps"
      className={cx('flex flex-col gap-0.5', className)}
    >
      {steps.map((step, index) => {
        const done = index < currentIndex;
        const isCurrent = index === currentIndex;
        const marker = (
          <span
            aria-hidden
            className={cx(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
              done && 'bg-accent text-accent-fg',
              isCurrent && 'border-2 border-accent text-accent-ink',
              !done && !isCurrent && 'border border-line-strong text-fg-subtle',
            )}
          >
            {done ? <Icon path={mdiCheck} size={16} /> : index + 1}
          </span>
        );
        const row = cx(
          'flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm',
          isCurrent && 'bg-accent-tint font-medium text-fg',
          done && 'text-fg hover:bg-surface-2',
          !done && !isCurrent && 'text-fg-subtle',
        );
        return (
          <li key={step}>
            {done ? (
              <button
                type="button"
                className={cx(
                  row,
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                )}
                onClick={() => onSelect(step)}
              >
                {marker}
                <span className="min-w-0 truncate">{STEP_TITLE[step]}</span>
                <span className="sr-only">, done</span>
              </button>
            ) : (
              <div
                className={row}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {marker}
                <span className="min-w-0 truncate">{STEP_TITLE[step]}</span>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
};
