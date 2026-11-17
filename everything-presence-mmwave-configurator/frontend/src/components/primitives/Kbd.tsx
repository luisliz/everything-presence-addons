import type { ReactNode } from 'react';

export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 font-body text-xs font-medium text-fg-muted shadow-e1">
    {children}
  </kbd>
);
