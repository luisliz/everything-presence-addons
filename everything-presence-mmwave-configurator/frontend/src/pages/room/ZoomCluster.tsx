import { mdiFitToScreenOutline, mdiMinus, mdiPlus } from '@mdi/js';
import { IconButton } from '../../components/primitives';

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 5;
export const ZOOM_STEP = 0.1;
export const clampZoom = (zoom: number) =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));

export interface ZoomClusterProps {
  zoom: number;
  onZoom: (zoom: number) => void;
  onFit: () => void;
}

export const ZoomCluster = ({ zoom, onZoom, onFit }: ZoomClusterProps) => (
  <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1 rounded-xl border border-line bg-surface/95 p-1 shadow-e1">
    <IconButton
      icon={mdiPlus}
      label="Zoom in"
      shortcut="+"
      tooltipSide="left"
      className="max-md:hidden"
      disabled={zoom >= ZOOM_MAX}
      onClick={() => onZoom(clampZoom(zoom + ZOOM_STEP))}
    />
    <IconButton
      icon={mdiMinus}
      label="Zoom out"
      shortcut="-"
      tooltipSide="left"
      className="max-md:hidden"
      disabled={zoom <= ZOOM_MIN}
      onClick={() => onZoom(clampZoom(zoom - ZOOM_STEP))}
    />
    <IconButton
      icon={mdiFitToScreenOutline}
      label="Fit room and coverage"
      shortcut="F"
      tooltipSide="left"
      onClick={onFit}
    />
  </div>
);
