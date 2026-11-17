export interface TooltipRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipPosition {
  left: number;
  top: number;
  placement: TooltipSide;
}

type Size = Pick<TooltipRect, 'width' | 'height'>;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

export function calculateTooltipPosition(
  trigger: TooltipRect,
  tooltip: Size,
  viewport: { width: number; height: number },
  gap = 8,
  margin = 8,
  side: TooltipSide = 'top',
): TooltipPosition {
  const fitsLeft = trigger.left - tooltip.width - gap >= margin;
  const fitsRight = trigger.right + tooltip.width + gap <= viewport.width - margin;
  if ((side === 'left' && fitsLeft) || (side === 'right' && fitsRight)) {
    const left = side === 'left' ? trigger.left - tooltip.width - gap : trigger.right + gap;
    const top = clamp(trigger.top + trigger.height / 2 - tooltip.height / 2, margin, viewport.height - tooltip.height - margin);
    return { left, top, placement: side };
  }

  const fitsAbove = trigger.top - tooltip.height - gap >= margin;
  const fitsBelow = trigger.bottom + tooltip.height + gap <= viewport.height - margin;
  const placement = side === 'bottom'
    ? (fitsBelow || !fitsAbove ? 'bottom' : 'top')
    : (fitsAbove || !fitsBelow ? 'top' : 'bottom');
  const left = clamp(trigger.left + trigger.width / 2 - tooltip.width / 2, margin, viewport.width - tooltip.width - margin);
  const desiredTop = placement === 'top' ? trigger.top - tooltip.height - gap : trigger.bottom + gap;
  const top = clamp(desiredTop, margin, viewport.height - tooltip.height - margin);
  return { left, top, placement };
}

/** Places a menu or popover under its anchor (flipping above when short of room), aligned to the anchor's start or end edge. */
export function calculateAnchorPosition(
  anchor: TooltipRect,
  layer: Size,
  viewport: { width: number; height: number },
  align: 'start' | 'end' = 'start',
  gap = 4,
  margin = 8,
): { left: number; top: number; placement: 'top' | 'bottom' } {
  const fitsBelow = anchor.bottom + gap + layer.height <= viewport.height - margin;
  const fitsAbove = anchor.top - gap - layer.height >= margin;
  const placement = fitsBelow || !fitsAbove ? 'bottom' : 'top';
  const desiredLeft = align === 'start' ? anchor.left : anchor.right - layer.width;
  const left = clamp(desiredLeft, margin, viewport.width - layer.width - margin);
  const desiredTop = placement === 'bottom' ? anchor.bottom + gap : anchor.top - gap - layer.height;
  const top = clamp(desiredTop, margin, viewport.height - layer.height - margin);
  return { left, top, placement };
}
