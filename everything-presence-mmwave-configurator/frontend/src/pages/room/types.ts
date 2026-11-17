import type { DeviceProfile, LiveState, RoomConfig } from '../../api/types';
import type { RoomMode } from '../../router';
import type {
  CanvasCoverage,
  SensorCoverageConfig,
} from '../../utils/coverage';
import type { Viewport } from '../../utils/fitViewport';
import type { SensorSettings } from './sensorApi';
import type { SensorDraftApi } from './useSensorDraft';

export interface TargetPosition {
  id: number;
  x: number;
  y: number;
  distance: number | null;
  speed: number | null;
  angle: number | null;
}

export type Selection =
  | { kind: 'none' }
  | { kind: 'target'; id: number }
  | { kind: 'zone'; id: string }
  | { kind: 'device' };

export const NO_SELECTION: Selection = { kind: 'none' };

/** Everything a mode body needs from the room screen; modes own only their tool state. */
export interface RoomFrame {
  room: RoomConfig;
  profile: DeviceProfile | null;
  mode: RoomMode;
  /** Live state for this room's device only; null while none has arrived. */
  liveState: LiveState | null;
  /** Targets in room coordinates, rotated by the draft installation angle. */
  targetPositions: TargetPosition[];
  offline: boolean;
  /** When `presence` and `zone1`..`zone4` last changed while this screen was open; null when unknown. */
  stateSince: Record<string, number | null>;
  viewport: Viewport;
  setViewport: (viewport: Viewport) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: Viewport['panOffsetMm']) => void;
  fit: () => void;
  onContainerSize: (size: { width: number; height: number }) => void;
  selection: Selection;
  select: (selection: Selection) => void;
  sensor: SensorSettings;
  draft: SensorDraftApi;
  /** `{ ...liveState.config, ...draft.values }` in the coverage resolver's shape. */
  sensorConfig: SensorCoverageConfig;
  coverage: CanvasCoverage;
  openLogs: () => void;
  openResync: () => void;
}
