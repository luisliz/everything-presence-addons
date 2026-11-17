import { mdiArrowLeft } from '@mdi/js';
import type { ReactNode } from 'react';
import { Button, Note } from '../../components/primitives';

export interface StepFrameProps {
  title: string;
  description?: ReactNode;
  error?: string | null;
  onBack?: () => void;
  /** Primary action at the footer's right end. */
  action?: ReactNode;
  children: ReactNode;
}

export const StepFrame = ({
  title,
  description,
  error,
  onBack,
  action,
  children,
}: StepFrameProps) => (
  <section className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 md:px-6">
    <header>
      <h2 className="text-xl font-medium text-fg">{title}</h2>
      {description && (
        <p className="mt-1 text-sm text-fg-muted">{description}</p>
      )}
    </header>
    {error && <Note tone="danger">{error}</Note>}
    {children}
    {(onBack || action) && (
      <footer className="flex items-center justify-between gap-3 border-t border-line pt-4">
        {onBack ? (
          <Button icon={mdiArrowLeft} onClick={onBack}>
            Back
          </Button>
        ) : (
          <span />
        )}
        {action}
      </footer>
    )}
  </section>
);
