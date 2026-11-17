import {
  mdiAlertCircleOutline,
  mdiCloudCheckOutline,
  mdiContentSaveOutline,
} from '@mdi/js';
import { Button } from './Button';
import { cx } from './cx';
import { Icon } from './Icon';
import { Tooltip } from './Tooltip';

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const ErrorMark = ({ error }: { error: string }) => (
  <Tooltip content={error}>
    <span className="inline-flex text-danger-ink">
      <Icon
        path={mdiAlertCircleOutline}
        size={20}
        label="Last attempt failed"
      />
    </span>
  </Tooltip>
);

export interface SaveStateProps {
  dirtyCount: number;
  onSave: () => void;
  busy?: boolean;
  lastError?: string | null;
  savedLabel?: string;
  saveLabel?: string;
  className?: string;
}

export const SaveState = ({
  dirtyCount,
  onSave,
  busy,
  lastError,
  savedLabel = 'All changes saved',
  saveLabel = 'Save',
  className,
}: SaveStateProps) => (
  <div className={cx('flex items-center gap-3', className)}>
    <output className="flex items-center gap-1.5 text-sm text-fg-muted">
      {lastError && <ErrorMark error={lastError} />}
      {dirtyCount === 0 ? (
        <>
          <Icon
            path={mdiCloudCheckOutline}
            size={20}
            className="text-success-ink"
          />
          {savedLabel}
        </>
      ) : (
        plural(dirtyCount, 'unsaved change', 'unsaved changes')
      )}
    </output>
    <Button
      variant="primary"
      icon={mdiContentSaveOutline}
      busy={busy}
      disabled={dirtyCount === 0}
      onClick={onSave}
    >
      {saveLabel}
    </Button>
  </div>
);

export interface ApplyBarProps {
  dirtyCount: number;
  onApply: () => void;
  onDiscard?: () => void;
  busy?: boolean;
  lastError?: string | null;
  className?: string;
}

export const ApplyBar = ({
  dirtyCount,
  onApply,
  onDiscard,
  busy,
  lastError,
  className,
}: ApplyBarProps) => {
  if (dirtyCount === 0 && !lastError) return null;
  return (
    <div
      className={cx(
        'sticky bottom-0 flex items-center gap-2 border-t border-line bg-surface py-3',
        className,
      )}
    >
      <output className="flex flex-1 items-center gap-1.5 text-sm text-fg-muted">
        {lastError && <ErrorMark error={lastError} />}
        {plural(dirtyCount, 'change', 'changes')} not on the device
      </output>
      {onDiscard && (
        <Button variant="ghost" size="sm" onClick={onDiscard} disabled={busy}>
          Discard
        </Button>
      )}
      <Button
        variant="primary"
        size="sm"
        onClick={onApply}
        busy={busy}
        disabled={dirtyCount === 0}
      >
        Apply
      </Button>
    </div>
  );
};
