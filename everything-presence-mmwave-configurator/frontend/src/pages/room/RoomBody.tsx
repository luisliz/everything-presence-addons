import type { ReactNode, Ref } from 'react';
import { cx } from '../../components/primitives';

export interface RoomBodyProps {
  toolbar: ReactNode;
  /** Right end of the toolbar: save state, Apply. */
  toolbarEnd?: ReactNode;
  canvas: ReactNode;
  /** Absolutely positioned overlays inside the canvas box (chips, zoom cluster, legend). */
  overlays?: ReactNode;
  inspector: ReactNode;
  canvasRef?: Ref<HTMLDivElement>;
  dimmed?: boolean;
}

export const RoomBody = ({
  toolbar,
  toolbarEnd,
  canvas,
  overlays,
  inspector,
  canvasRef,
  dimmed,
}: RoomBodyProps) => (
  <div className="flex min-h-0 flex-1">
    <div className="flex min-w-0 flex-1 flex-col pb-[88px] md:pb-0">
      <div
        role="toolbar"
        aria-label="Mode tools"
        className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-surface px-2 max-md:[mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-12px),transparent)]"
      >
        {toolbar}
        <div className="flex-1" />
        {toolbarEnd}
      </div>
      <div
        ref={canvasRef}
        className="relative min-h-[50dvh] flex-1 overflow-hidden bg-cv-bg md:min-h-0"
      >
        <div className={cx('h-full w-full', dimmed && 'opacity-60')}>
          {canvas}
        </div>
        {overlays}
      </div>
    </div>
    {inspector}
  </div>
);
