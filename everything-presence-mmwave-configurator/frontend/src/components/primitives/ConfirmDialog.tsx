import { type ReactNode, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { useEscape, useFocusTrap, useScrollLock } from './layer';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
  /** A third choice between cancel and confirm, e.g. "Discard" next to "Save and leave". */
  secondary?: {
    label: string;
    onSelect: () => void;
    tone?: 'default' | 'danger';
  };
  busy?: boolean;
}

export const ConfirmDialog = ({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
  secondary,
  busy,
}: ConfirmDialogProps) => {
  const titleId = useId();
  const bodyId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(panelRef, open, cancelRef);
  useScrollLock(open);
  // Stays the top Escape layer while busy, so Escape cannot reach the layer underneath.
  useEscape(open, () => {
    if (!busy) onCancel();
  });

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div
        className="mobile-sheet-backdrop absolute inset-0 bg-black/55"
        aria-hidden="true"
        onClick={busy ? undefined : onCancel}
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-e2"
      >
        <h2 id={titleId} className="text-lg font-semibold text-fg">
          {title}
        </h2>
        <div id={bodyId} className="mt-2 text-sm text-fg-muted">
          {body}
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            ref={cancelRef}
            variant="secondary"
            onClick={onCancel}
            disabled={busy}
            className="w-full sm:w-auto"
          >
            {cancelLabel}
          </Button>
          {secondary && (
            <Button
              variant={secondary.tone === 'danger' ? 'ghost' : 'secondary'}
              onClick={secondary.onSelect}
              disabled={busy}
              className={
                secondary.tone === 'danger'
                  ? 'w-full text-danger-ink hover:bg-danger-tint sm:w-auto'
                  : 'w-full sm:w-auto'
              }
            >
              {secondary.label}
            </Button>
          )}
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            busy={busy}
            className="w-full sm:w-auto"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
