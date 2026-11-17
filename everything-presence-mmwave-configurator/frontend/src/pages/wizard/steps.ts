export type StepKey =
  | 'device'
  | 'entityDiscovery'
  | 'roomChoice'
  | 'roomDetails'
  | 'outline'
  | 'placement'
  | 'doors'
  | 'furniture'
  | 'zones'
  | 'finish';

export type RoomPath = 'new' | 'existing' | 'skip';

export type CanvasStep = Extract<
  StepKey,
  'outline' | 'placement' | 'doors' | 'furniture' | 'zones'
>;

export const STEP_TITLE: Record<StepKey, string> = {
  device: 'Choose device',
  entityDiscovery: 'Find entities',
  roomChoice: 'Choose room',
  roomDetails: 'Room details',
  outline: 'Draw walls',
  placement: 'Place device',
  doors: 'Add doors',
  furniture: 'Add furniture',
  zones: 'Draw zones',
  finish: 'Finish',
};

const CANVAS_STEPS: ReadonlySet<StepKey> = new Set([
  'outline',
  'placement',
  'doors',
  'furniture',
  'zones',
]);

export const isCanvasStep = (step: StepKey): step is CanvasStep =>
  CANVAS_STEPS.has(step);

const ALL_STEPS = Object.keys(STEP_TITLE) as StepKey[];

export const isStepKey = (value: unknown): value is StepKey =>
  ALL_STEPS.includes(value as StepKey);

/** Step order for a room path; a profile without zone editing has no zones step. A null path orders as a new room. */
export function stepsFor(
  path: RoomPath | null,
  supportsZones: boolean,
): StepKey[] {
  const base: StepKey[] = ['device', 'entityDiscovery', 'roomChoice'];
  const tail: StepKey[] = supportsZones ? ['zones', 'finish'] : ['finish'];
  if (path === 'skip') return [...base, ...tail];
  if (path === 'existing')
    return [...base, 'roomDetails', 'placement', ...tail];
  return [
    ...base,
    'roomDetails',
    'outline',
    'placement',
    'doors',
    'furniture',
    ...tail,
  ];
}

/** The persisted step when the current order has it, else the first step. */
export const resumeStep = (saved: unknown, steps: StepKey[]): StepKey =>
  isStepKey(saved) && steps.includes(saved) ? saved : steps[0];

export interface StepProgress {
  outlineDone: boolean;
  placementDone: boolean;
  zonesReady: boolean;
}

/** Why Next is unavailable on a canvas step, or null when the step may advance. */
export function nextBlocker(
  step: StepKey,
  progress: StepProgress,
): string | null {
  if (step === 'outline' && !progress.outlineDone)
    return 'Save a room outline with at least 3 corners first';
  if (step === 'placement' && !progress.placementDone)
    return 'Save the device position first';
  if (step === 'zones' && !progress.zonesReady)
    return 'Save at least one zone first';
  return null;
}

/** Profile whose model matches the Home Assistant device model exactly. */
export const profileIdForModel = (
  model: string | undefined,
  profiles: ReadonlyArray<{ id: string; model?: string }>,
): string | null =>
  (model && profiles.find((profile) => profile.model === model)?.id) || null;
