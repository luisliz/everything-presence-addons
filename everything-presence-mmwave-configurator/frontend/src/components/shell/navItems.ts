import { mdiAccessPoint, mdiFloorPlan, mdiVectorPolygon } from '@mdi/js';
import type { RoomMode } from '../../router';

export const MODE_ITEMS: ReadonlyArray<{
  mode: RoomMode;
  label: string;
  icon: string;
}> = [
  { mode: 'live', label: 'Live', icon: mdiAccessPoint },
  { mode: 'zones', label: 'Zones', icon: mdiVectorPolygon },
  { mode: 'build', label: 'Layout', icon: mdiFloorPlan },
];

export const APP_NAME = 'Zone Configurator';

export const SKELETON_KEYS = [
  'skeleton-1',
  'skeleton-2',
  'skeleton-3',
] as const;
