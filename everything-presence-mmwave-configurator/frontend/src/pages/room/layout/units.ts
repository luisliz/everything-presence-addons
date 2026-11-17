import { formatSnapPresetLabel } from '../../../utils/snapLabels';

export type Units = 'metric' | 'imperial';

const MM_PER_UNIT: Record<Units, number> = { metric: 1000, imperial: 304.8 };

export const lengthUnit = (units: Units) => (units === 'metric' ? 'm' : 'ft');
export const toUnits = (mm: number, units: Units) => mm / MM_PER_UNIT[units];
export const fromUnits = (value: number, units: Units) =>
  value * MM_PER_UNIT[units];

export const SNAP_STEPS_MM = [0, 50, 100, 200] as const;
export const snapLabel = (mm: number, units: Units) =>
  units === 'metric' && mm > 0
    ? `${mm / 10} cm`
    : formatSnapPresetLabel(mm, units);

/** Step for nudge buttons: 5 cm, or 0.1 ft in imperial. */
export const nudgeMm = (units: Units) => (units === 'metric' ? 50 : 30.48);
