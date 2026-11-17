import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { ZoneRect, ZonePolygon, Point, FurnitureInstance, Door } from '../api/types';
import { RoomCanvas } from './RoomCanvas';
import type { DevicePlacement, Point as RoomPoint } from './RoomCanvas';
import { getFurnitureIcon } from '../furniture/icons';
import { MIN_POLYGON_VERTICES, canDeleteVertex, insertEdgeMidpoint } from '../utils/polygonVertices';
import { formatLengthLabel } from '../utils/lengthLabels';
import {
  type DeviceFrame,
  type RectHandle,
  constrain45,
  deviceToRoom,
  formatSizeLabel,
  meetsMinSize,
  nudgeDelta,
  rectCorners,
  rectFromCorners,
  rectHandlePoint,
  resizeRect,
  roomDeltaToDevice,
  roomToDevice,
  snapPoint,
  snapRoomToDevice,
  snappedRoomDelta,
  translatePoints,
  withinRadius,
} from '../utils/zoneDrawing';

export interface PolygonVertexSelection {
  zoneId: string;
  vertexIndex: number;
}

export type ZoneTool = 'select' | 'polygon' | 'rectangle';
export type ZoneKind = ZoneRect['type'];
export type NewZone = Omit<ZoneRect, 'id'> | Omit<ZonePolygon, 'id'>;

export interface ZoneDrawDraft {
  tool: 'polygon' | 'rectangle';
  /** Device-frame points placed so far (rectangle: its four corners). */
  vertices: Point[];
  canFinish: boolean;
}

interface HandleMetrics {
  r: number;
  hitR: number;
  midR: number;
  stroke: number;
}

type RoomOverlayContext = Parameters<NonNullable<React.ComponentProps<typeof RoomCanvas>['renderOverlay']>>[0];
type OverlayContext = RoomOverlayContext & { pxToSvg?: number; handle?: HandleMetrics };

type Gesture =
  | { kind: 'rect-move'; zoneId: string; start: ZoneRect; grab: Point }
  | { kind: 'rect-resize'; zoneId: string; handle: RectHandle; start: ZoneRect; grab: Point }
  | { kind: 'polygon-move'; zoneId: string; startPointer: Point; startVertices: Point[] }
  | { kind: 'vertex'; zoneId: string; vertexIndex: number; startVertices: Point[] }
  | { kind: 'draw-rect' };

type Draft =
  | { tool: 'polygon'; points: Point[] }
  | { tool: 'rectangle'; start: Point; end: Point; square: boolean };

const FALLBACK_HANDLE: HandleMetrics = { r: 11, hitR: 11, midR: 8, stroke: 2 };

const ZONE_FILL: Record<ZoneKind, string> = {
  regular: 'fill-zone-regular/20',
  exclusion: 'fill-zone-exclusion/20',
  entry: 'fill-zone-entry/20',
};
const ZONE_STROKE: Record<ZoneKind, string> = {
  regular: 'stroke-zone-regular',
  exclusion: 'stroke-zone-exclusion',
  entry: 'stroke-zone-entry',
};

const RECT_HANDLES: { name: RectHandle; cursor: string }[] = [
  { name: 'nw', cursor: 'nwse-resize' },
  { name: 'ne', cursor: 'nesw-resize' },
  { name: 'sw', cursor: 'nesw-resize' },
  { name: 'se', cursor: 'nwse-resize' },
  { name: 'n', cursor: 'ns-resize' },
  { name: 's', cursor: 'ns-resize' },
  { name: 'w', cursor: 'ew-resize' },
  { name: 'e', cursor: 'ew-resize' },
];

const isTextEntry = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  const tag = el?.tagName?.toLowerCase();
  return !!el?.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
};

const centroidOf = (points: Point[]): Point =>
  points.reduce((acc, v) => ({ x: acc.x + v.x / points.length, y: acc.y + v.y / points.length }), { x: 0, y: 0 });

interface ZoneCanvasProps {
  zones: ZoneRect[];
  onZonesChange: (zones: ZoneRect[]) => void;
  // Polygon zones support
  polygonZones?: ZonePolygon[];
  onPolygonZonesChange?: (zones: ZonePolygon[]) => void;
  polygonMode?: boolean; // Whether we're in polygon editing mode
  polygonReadOnly?: boolean;
  polygonLateralOnlyAxis?: 'x' | 'y';
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  // Polygon vertex (node) selection + deletion. Selection state lives in the
  // owning page so the keyboard shortcut stays out of read-only canvases.
  selectedVertex?: PolygonVertexSelection | null;
  onVertexSelect?: (selection: PolygonVertexSelection | null) => void;
  onVertexDelete?: (zoneId: string, vertexIndex: number) => void;
  tool?: ZoneTool;
  drawKind?: ZoneKind;
  onToolChange?: (tool: ZoneTool) => void;
  onDraftChange?: (draft: ZoneDrawDraft | null) => void;
  /** A finished polygon or rectangle in device coordinates; the page assigns the slot id. */
  onCommitZone?: (zone: NewZone) => void;
  /** Alt held: bypass snapping. */
  snapBypass?: boolean;
  /** Delete/Backspace with no vertex selected. Passing it moves those keys from the page into the canvas. */
  onDeleteSelected?: () => void;
  displayUnits?: 'metric' | 'imperial';
  rangeMm?: number;
  snapGridMm?: number;
  height?: number | string;
  zoom?: number;
  panOffsetMm?: { x: number; y: number };
  onPanChange?: (offset: { x: number; y: number }) => void;
  onZoomChange?: (zoom: number) => void;
  touchPanEnabled?: boolean;
  onCanvasMove?: (point: { x: number; y: number }) => void;
  roomShell?: { points: RoomPoint[] };
  roomShellFillMode?: 'overlay' | 'material';
  floorMaterial?: 'wood-oak' | 'wood-walnut' | 'wood-cherry' | 'wood-ash' | 'wood-mahogany' | 'wood-herringbone' | 'carpet-beige' | 'carpet-gray' | 'carpet-charcoal' | 'carpet-navy' | 'carpet-burgundy' | 'tile-white' | 'tile-gray' | 'tile-terracotta' | 'marble-white' | 'marble-black' | 'slate' | 'concrete' | 'vinyl-light' | 'none';
  devicePlacement?: DevicePlacement;
  installationAngle?: number;
  fieldOfViewDeg?: number;
  maxRangeMeters?: number;
  deviceIconUrl?: string;
  clipRadarToWalls?: boolean;
  showRadar?: boolean;
  heightCoverage?: {
    enabled: boolean;
    heightMm: number;
    pitchDeg: number;
    horizontalFovDeg: number;
    verticalFovDeg: number;
    maxRangeMeters?: number;
  };
  furniture?: FurnitureInstance[];
  selectedFurnitureId?: string | null;
  onFurnitureSelect?: (id: string | null) => void;
  doors?: Door[];
  onDragStateChange?: (isDragging: boolean) => void;
  // Zone labels from device mapping (overrides zone.label)
  zoneLabels?: Record<string, string>;
  // Visibility toggles
  showWalls?: boolean;
  showFurniture?: boolean;
  showDoors?: boolean;
  showZones?: boolean;
  showZoneLabels?: boolean;
  zoneLabelScale?: number;
  showDevice?: boolean;
  deviceMarkerStyle?: 'icon' | 'node';
  deviceMarkerScale?: number;
  deviceMarkerOpacity?: number;
  renderOverlay?: (params: RoomOverlayContext) => React.ReactNode;
}

export const ZoneCanvas: React.FC<ZoneCanvasProps> = ({
  zones,
  onZonesChange,
  polygonZones = [],
  onPolygonZonesChange,
  polygonMode = false,
  polygonReadOnly = false,
  polygonLateralOnlyAxis,
  selectedId,
  onSelect,
  selectedVertex,
  onVertexSelect,
  onVertexDelete,
  tool = 'select',
  drawKind = 'regular',
  onToolChange,
  onDraftChange,
  onCommitZone,
  snapBypass = false,
  onDeleteSelected,
  displayUnits = 'metric',
  rangeMm = 6000,
  snapGridMm = 0,
  height = 520,
  zoom = 1,
  panOffsetMm = { x: 0, y: 0 },
  onPanChange,
  onZoomChange,
  touchPanEnabled = true,
  onCanvasMove,
  roomShell,
  roomShellFillMode,
  floorMaterial,
  devicePlacement,
  installationAngle,
  fieldOfViewDeg,
  maxRangeMeters,
  deviceIconUrl,
  clipRadarToWalls,
  showRadar,
  heightCoverage,
  furniture = [],
  selectedFurnitureId,
  onFurnitureSelect,
  doors = [],
  onDragStateChange,
  zoneLabels,
  showWalls = true,
  showFurniture = true,
  showDoors = true,
  showZones = true,
  showZoneLabels = true,
  zoneLabelScale = 1,
  showDevice = true,
  deviceMarkerStyle = 'icon',
  deviceMarkerScale = 0.5,
  deviceMarkerOpacity = 1,
  renderOverlay,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const modsRef = useRef({ shift: false, alt: false });
  const rawCursorRef = useRef<Point | null>(null);
  const [cursor, setCursor] = useState<{ raw: Point; point: Point } | null>(null);
  const [draft, setDraftState] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;

  // Node (vertex) deletion is only offered while polygons are hand-editable:
  // never read-only, and never in ceiling-slice mode where the lateral-only
  // axis makes vertex count structural.
  const vertexEditingEnabled = !polygonReadOnly && !polygonLateralOnlyAxis && !!onVertexDelete;
  const drawing =
    (tool === 'rectangle' && (!polygonMode || !polygonReadOnly)) ||
    (tool === 'polygon' && polygonMode && !polygonReadOnly);

  const effectiveRotationDeg =
    devicePlacement ? (devicePlacement.rotationDeg ?? 0) + (installationAngle ?? 0) : 0;
  const effectiveZoneLabelScale = Math.min(1.75, Math.max(0.5, zoneLabelScale));
  const frame: DeviceFrame | null = devicePlacement
    ? { x: devicePlacement.x, y: devicePlacement.y, rotationDeg: effectiveRotationDeg }
    : null;
  const snapStep = () => (modsRef.current.alt || snapBypass ? 0 : snapGridMm);
  // Rectangle zones are axis-aligned in the device frame; polygon-mode rectangles align with the room.
  const fromRectFrame = (p: Point) => (polygonMode ? p : deviceToRoom(p, frame));
  const toRectFrame = (p: Point) => (polygonMode ? p : roomToDevice(p, frame));

  const setDraft = (next: Draft | null) => {
    draftRef.current = next;
    setDraftState(next);
    if (!next) {
      onDraftChangeRef.current?.(null);
      return;
    }
    if (next.tool === 'polygon') {
      onDraftChangeRef.current?.({
        tool: 'polygon',
        vertices: next.points.map((p) => roomToDevice(p, frame)),
        canFinish: next.points.length >= MIN_POLYGON_VERTICES,
      });
      return;
    }
    const rect = rectFromCorners(toRectFrame(next.start), toRectFrame(next.end), next.square);
    onDraftChangeRef.current?.({
      tool: 'rectangle',
      vertices: rectCorners(rect).map((p) => roomToDevice(fromRectFrame(p), frame)),
      canFinish: meetsMinSize(rect),
    });
  };

  const drawSession = `${tool}:${polygonMode}`;
  const drawSessionRef = useRef(drawSession);
  useEffect(() => {
    if (drawSessionRef.current === drawSession) return;
    drawSessionRef.current = drawSession;
    gestureRef.current = null;
    draftRef.current = null;
    setDraftState(null);
    setCursor(null);
    onDraftChangeRef.current?.(null);
  }, [drawSession]);

  const capturePointer = (e: React.PointerEvent<SVGElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Older embedded webviews can reject capture on SVG nodes.
    }
  };

  const trackMods = (e: { shiftKey: boolean; altKey: boolean }) => {
    modsRef.current = { shift: e.shiftKey, alt: e.altKey };
  };

  const replaceRect = (next: ZoneRect) => onZonesChange(zones.map((z) => (z.id === next.id ? next : z)));
  const replaceVertices = (zoneId: string, vertices: Point[]) =>
    onPolygonZonesChange?.(polygonZones.map((z) => (z.id === zoneId ? { ...z, vertices } : z)));

  const applyGesture = (pt: Point) => {
    const g = gestureRef.current;
    if (!g || g.kind === 'draw-rect') return;
    const step = snapStep();

    if (g.kind === 'rect-move') {
      const topLeft = snapRoomToDevice({ x: pt.x - g.grab.x, y: pt.y - g.grab.y }, step, frame);
      replaceRect({ ...g.start, x: topLeft.x, y: topLeft.y });
      return;
    }
    if (g.kind === 'rect-resize') {
      const to = snapRoomToDevice({ x: pt.x + g.grab.x, y: pt.y + g.grab.y }, step, frame);
      replaceRect({ ...g.start, ...resizeRect(g.start, g.handle, to) });
      return;
    }
    if (polygonReadOnly || !onPolygonZonesChange) return;

    if (g.kind === 'polygon-move') {
      const d = roomDeltaToDevice(snappedRoomDelta(g.startPointer, pt, step), frame);
      const delta =
        polygonLateralOnlyAxis === 'x' ? { x: d.x, y: 0 } : polygonLateralOnlyAxis === 'y' ? { x: 0, y: d.y } : d;
      replaceVertices(g.zoneId, translatePoints(g.startVertices, delta));
      return;
    }

    const next = snapRoomToDevice(pt, step, frame);
    const axis = polygonLateralOnlyAxis;
    if (axis) {
      const previous = g.startVertices[g.vertexIndex][axis];
      replaceVertices(
        g.zoneId,
        g.startVertices.map((v) => (Math.abs(v[axis] - previous) < 1 ? { ...v, [axis]: next[axis] } : v)),
      );
      return;
    }
    replaceVertices(g.zoneId, g.startVertices.map((v, i) => (i === g.vertexIndex ? next : v)));
  };

  const startGesture = (gesture: Gesture, zoneId: string) => {
    gestureRef.current = gesture;
    setDraggingId(zoneId);
    onDragStateChange?.(true);
    onSelect?.(zoneId);
  };

  const commitRectDraft = () => {
    const d = draftRef.current;
    setDraft(null);
    if (d?.tool !== 'rectangle') return;
    const rect = rectFromCorners(toRectFrame(d.start), toRectFrame(d.end), d.square);
    if (!meetsMinSize(rect)) return;
    onCommitZone?.(
      polygonMode
        ? { type: drawKind, vertices: rectCorners(rect).map((p) => roomToDevice(p, frame)) }
        : { type: drawKind, ...rect },
    );
    onToolChange?.('select');
  };

  const finishPolygon = () => {
    const d = draftRef.current;
    if (d?.tool !== 'polygon' || d.points.length < MIN_POLYGON_VERTICES) return;
    setDraft(null);
    onCommitZone?.({ type: drawKind, vertices: d.points.map((p) => roomToDevice(p, frame)) });
    onToolChange?.('select');
  };

  const endGesture = () => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;
    if (g.kind === 'draw-rect') {
      commitRectDraft();
      return;
    }
    setDraggingId(null);
    onDragStateChange?.(false);
  };

  const drawPointFor = (raw: Point): Point => {
    const snapped = snapPoint(raw, snapStep());
    const d = draftRef.current;
    const last = d?.tool === 'polygon' ? d.points[d.points.length - 1] : undefined;
    return last && modsRef.current.shift ? constrain45(last, snapped) : snapped;
  };

  const updateDrawCursor = (raw: Point) => {
    rawCursorRef.current = raw;
    const point = drawPointFor(raw);
    setCursor({ raw, point });
    const d = draftRef.current;
    if (d?.tool === 'rectangle') setDraft({ ...d, end: point, square: modsRef.current.shift });
  };

  const nudgeSelection = (key: string, large: boolean) => {
    const delta = nudgeDelta(key, snapGridMm, large);
    if (!delta || !selectedId) return false;
    const d = roomDeltaToDevice(delta, frame);
    if (!polygonMode) {
      const zone = zones.find((z) => z.id === selectedId);
      if (!zone) return false;
      replaceRect({ ...zone, x: zone.x + d.x, y: zone.y + d.y });
      return true;
    }
    const polygon = polygonZones.find((z) => z.id === selectedId);
    if (!polygon || polygonReadOnly || !onPolygonZonesChange) return false;
    const step =
      polygonLateralOnlyAxis === 'x' ? { x: d.x, y: 0 } : polygonLateralOnlyAxis === 'y' ? { x: 0, y: d.y } : d;
    const vertexIndex =
      vertexEditingEnabled && selectedVertex?.zoneId === polygon.id ? selectedVertex.vertexIndex : null;
    replaceVertices(
      polygon.id,
      vertexIndex === null
        ? translatePoints(polygon.vertices, step)
        : polygon.vertices.map((v, i) => (i === vertexIndex ? { x: v.x + step.x, y: v.y + step.y } : v)),
    );
    return true;
  };

  const handleDrawKey = (key: string) => {
    const d = draftRef.current;
    if (key === 'Enter') {
      finishPolygon();
      return true;
    }
    if (key === 'Backspace' && d?.tool === 'polygon') {
      setDraft(d.points.length > 1 ? { ...d, points: d.points.slice(0, -1) } : null);
      return true;
    }
    if (key === 'Escape') {
      if (d) {
        gestureRef.current = null;
        setDraft(null);
      } else {
        onToolChange?.('select');
      }
      return true;
    }
    return false;
  };

  const handleSelectKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (selectedVertex) {
        onVertexSelect?.(null);
        return true;
      }
      if (selectedId) {
        onSelect?.(null);
        return true;
      }
      return false;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && onDeleteSelected) {
      if (polygonMode && vertexEditingEnabled && selectedVertex && selectedVertex.zoneId === selectedId) {
        onVertexDelete?.(selectedVertex.zoneId, selectedVertex.vertexIndex);
      } else if (selectedId) {
        onDeleteSelected();
      }
      return true;
    }
    return nudgeSelection(e.key, e.shiftKey);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isTextEntry(e.target)) return;
    trackMods(e);
    if (e.key === 'Shift' || e.key === 'Alt') {
      if (drawing && rawCursorRef.current) updateDrawCursor(rawCursorRef.current);
      return;
    }
    if (e.ctrlKey || e.metaKey) return;
    if (drawing ? handleDrawKey(e.key) : handleSelectKey(e)) {
      e.preventDefault();
      // Keeps page-level window listeners from handling the same key twice.
      e.stopPropagation();
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    trackMods(e);
    if ((e.key === 'Shift' || e.key === 'Alt') && drawing && rawCursorRef.current) {
      updateDrawCursor(rawCursorRef.current);
    }
  };

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Zone canvas"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the canvas is the focus target for its drawing and nudge keys
      tabIndex={0}
      className="w-full h-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    >
    <RoomCanvas
      points={roomShell?.points ?? []}
      onChange={() => {}}
      roomShellFillMode={roomShellFillMode}
      floorMaterial={floorMaterial}
      onCanvasMove={(pt) => {
        onCanvasMove?.(pt);
        if (drawing) updateDrawCursor(pt);
        applyGesture(pt);
      }}
      onCanvasRelease={endGesture}
      onCanvasClick={() => onSelect?.(null)}
      rangeMm={rangeMm}
      snapGridMm={snapGridMm}
      height={height}
      zoom={zoom}
      panOffsetMm={panOffsetMm}
      onPanChange={onPanChange}
      onZoomChange={onZoomChange}
      touchPanEnabled={touchPanEnabled}
      devicePlacement={devicePlacement}
      fieldOfViewDeg={fieldOfViewDeg}
      maxRangeMeters={maxRangeMeters}
      deviceIconUrl={deviceIconUrl}
      clipRadarToWalls={clipRadarToWalls}
      showRadar={showRadar}
      heightCoverage={heightCoverage}
      doors={doors}
      showWalls={showWalls}
      showFurniture={false}
      showDoors={showDoors}
      showDevice={showDevice}
      deviceMarkerStyle={deviceMarkerStyle}
      deviceMarkerScale={deviceMarkerScale}
      deviceMarkerOpacity={deviceMarkerOpacity}
      deviceInteractive={false}
      lockShell
      renderOverlay={(params) => {
        const ctx = params as OverlayContext;
        const { toCanvas, toWorldFromEvent, onCanvasPointerMove, onCanvasPointerRelease } = ctx;
        const h = ctx.handle ?? FALLBACK_HANDLE;
        const px = ctx.pxToSvg ?? 1;
        const outline = {
          base: ctx.handle ? h.stroke / 2 : 1,
          hover: ctx.handle ? h.stroke : 2,
          selected: ctx.handle ? h.stroke : 3,
        };
        const deviceToCanvas = (p: Point) => toCanvas(deviceToRoom(p, frame));

        const forwardMove = (e: React.PointerEvent<SVGElement>) => {
          trackMods(e);
          onCanvasPointerMove(e);
          e.stopPropagation();
          if (gestureRef.current && e.cancelable) e.preventDefault();
        };
        const forwardRelease = (e: React.PointerEvent<SVGElement>) => {
          onCanvasPointerRelease(e);
          e.stopPropagation();
        };
        const beginPointer = (e: React.PointerEvent<SVGElement>) => {
          if (e.button !== 0) return false;
          e.stopPropagation();
          if (e.cancelable) e.preventDefault();
          capturePointer(e);
          trackMods(e);
          containerRef.current?.focus({ preventScroll: true });
          return true;
        };
        const pointerHandlers = {
          onPointerMove: forwardMove,
          onPointerUp: forwardRelease,
          onPointerCancel: forwardRelease,
          onClick: (e: React.MouseEvent) => e.stopPropagation(),
        };
        const hoverHandlers = (id: string) => ({
          onPointerEnter: () => setHoveredId(id),
          onPointerLeave: () => setHoveredId((current) => (current === id ? null : current)),
        });
        const strokeFor = (id: string, kind: ZoneKind) => {
          const selected = selectedId === id;
          return {
            className: `${ZONE_FILL[kind]} ${selected ? 'stroke-accent' : ZONE_STROKE[kind]}`,
            strokeWidth: selected ? outline.selected : hoveredId === id && !drawing ? outline.hover : outline.base,
          };
        };
        const handleCircle = (key: string, at: Point, active: boolean, cursor: string, onDown: (e: React.PointerEvent<SVGElement>) => void) => (
          <g key={key}>
            <circle
              cx={at.x}
              cy={at.y}
              r={h.r}
              className={active ? 'fill-accent stroke-accent' : 'fill-surface stroke-accent'}
              strokeWidth={h.stroke}
              pointerEvents="none"
            />
            <circle
              cx={at.x}
              cy={at.y}
              r={Math.max(h.hitR, h.r)}
              fill="transparent"
              pointerEvents="all"
              style={{ cursor }}
              onPointerDown={onDown}
              {...pointerHandlers}
            />
          </g>
        );
        const label = (key: string, at: Point, text: string, size = 12 * px) => (
          <text
            key={key}
            x={at.x}
            y={at.y}
            fontSize={size}
            fontWeight="600"
            textAnchor="middle"
            dominantBaseline="middle"
            pointerEvents="none"
            className="fill-fg stroke-cv-halo"
            strokeWidth={3 * px}
            strokeLinejoin="round"
            paintOrder="stroke"
          >
            {text}
          </text>
        );

        // Render furniture (before zones, so zones appear on top)
        const furnitureElements = showFurniture ? furniture.map((item) => {
          const canvasPos = toCanvas({ x: item.x, y: item.y });
          const canvasWidth = (item.width / rangeMm) * 700;
          const canvasHeight = (item.depth / rangeMm) * 700;
          const isSelected = selectedFurnitureId === item.id;
          const Icon = getFurnitureIcon(item.typeId);

          return (
            <g key={item.id} transform={`translate(${canvasPos.x}, ${canvasPos.y}) rotate(${item.rotationDeg})`}>
              {/* Furniture icon - render directly as SVG to fill bounds */}
              {Icon && (
                <svg
                  x={-canvasWidth / 2}
                  y={-canvasHeight / 2}
                  width={canvasWidth}
                  height={canvasHeight}
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  style={{ overflow: 'visible', pointerEvents: 'none' }}
                >
                  <Icon />
                </svg>
              )}
              {/* Clickable interaction rectangle - positioned over furniture */}
              <rect
                x={-canvasWidth / 2}
                y={-canvasHeight / 2}
                width={canvasWidth}
                height={canvasHeight}
                fill="transparent"
                stroke={isSelected ? '#0ea5e9' : 'transparent'}
                strokeWidth={isSelected ? 2 : 0}
                strokeDasharray={isSelected ? '4 2' : undefined}
                rx={3}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onFurnitureSelect?.(item.id);
                }}
              />
            </g>
          );
        }) : [];

        const zoneLabel = (id: string, at: Point, fallback?: string) =>
          showZoneLabels && (
            <text
              x={at.x}
              y={at.y}
              fill="white"
              fontSize={13 * effectiveZoneLabelScale}
              fontWeight="600"
              textAnchor="middle"
              dominantBaseline="middle"
              pointerEvents="none"
              style={{
                filter: 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.8))',
                textShadow: '0 1px 3px rgba(0,0,0,0.8)',
              }}
            >
              {zoneLabels?.[id] || fallback || id}
            </text>
          );

        const zoneElements = showZones ? zones.map((zone) => {
          const roomTopLeft = deviceToRoom({ x: zone.x, y: zone.y }, frame);
          const canvasTopLeft = toCanvas(roomTopLeft);
          const deviceOrigin = deviceToCanvas({ x: 0, y: 0 });
          const deviceRight = deviceToCanvas({ x: zone.width, y: 0 });
          const deviceDown = deviceToCanvas({ x: 0, y: zone.height });
          const canvasWidth = Math.hypot(deviceRight.x - deviceOrigin.x, deviceRight.y - deviceOrigin.y);
          const canvasHeight = Math.hypot(deviceDown.x - deviceOrigin.x, deviceDown.y - deviceOrigin.y);
          const isSelected = selectedId === zone.id;

          return (
            <g key={zone.id}>
              <rect
                x={0}
                y={0}
                width={canvasWidth}
                height={canvasHeight}
                {...strokeFor(zone.id, zone.type)}
                rx={6}
                transform={`translate(${canvasTopLeft.x}, ${canvasTopLeft.y}) rotate(${effectiveRotationDeg})`}
                style={{ transformOrigin: '0 0', cursor: draggingId === zone.id ? 'move' : 'pointer' }}
                onPointerDown={(e) => {
                  if (!beginPointer(e)) return;
                  const world = toWorldFromEvent(e);
                  if (!world) return;
                  startGesture(
                    { kind: 'rect-move', zoneId: zone.id, start: { ...zone }, grab: { x: world.x - roomTopLeft.x, y: world.y - roomTopLeft.y } },
                    zone.id,
                  );
                }}
                {...hoverHandlers(zone.id)}
                {...pointerHandlers}
              />
              {zoneLabel(zone.id, deviceToCanvas({ x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 }), zone.label)}
              {isSelected && RECT_HANDLES.map(({ name, cursor: handleCursor }) => {
                const handleRoom = deviceToRoom(rectHandlePoint(zone, name), frame);
                return handleCircle(name, toCanvas(handleRoom), false, handleCursor, (e) => {
                  if (!beginPointer(e)) return;
                  const world = toWorldFromEvent(e);
                  if (!world) return;
                  startGesture(
                    { kind: 'rect-resize', zoneId: zone.id, handle: name, start: { ...zone }, grab: { x: handleRoom.x - world.x, y: handleRoom.y - world.y } },
                    zone.id,
                  );
                });
              })}
            </g>
          );
        }) : [];

        const lateralCursor = polygonLateralOnlyAxis === 'x' ? 'ew-resize' : 'ns-resize';
        const polygonZoneElements = (showZones && polygonMode) ? polygonZones.map((polygon) => {
          const canvasVertices = polygon.vertices.map(deviceToCanvas);
          if (canvasVertices.length < 3) return null;

          const pointsStr = canvasVertices.map((v) => `${v.x},${v.y}`).join(' ');
          const isSelected = selectedId === polygon.id;
          const editable = isSelected && !polygonReadOnly;
          const activeVertexIndex =
            vertexEditingEnabled && selectedVertex && selectedVertex.zoneId === polygon.id
              ? selectedVertex.vertexIndex
              : null;
          const lateralDragEdges = polygonLateralOnlyAxis
            ? canvasVertices
                .map((v, idx) => ({ start: v, end: canvasVertices[(idx + 1) % canvasVertices.length], idx }))
                .filter(({ start, end }) => (
                  polygonLateralOnlyAxis === 'x'
                    ? Math.abs(start.x - end.x) < 1
                    : Math.abs(start.y - end.y) < 1
                ))
            : [];

          const startPolygonMove = (e: React.PointerEvent<SVGElement>) => {
            if (!beginPointer(e)) return;
            if (polygonReadOnly) {
              onSelect?.(polygon.id);
              return;
            }
            const world = toWorldFromEvent(e);
            if (!world) return;
            startGesture({ kind: 'polygon-move', zoneId: polygon.id, startPointer: world, startVertices: polygon.vertices }, polygon.id);
          };
          const startVertexDrag = (vertexIndex: number, vertices = polygon.vertices) => {
            startGesture({ kind: 'vertex', zoneId: polygon.id, vertexIndex, startVertices: vertices }, polygon.id);
            if (vertexEditingEnabled) onVertexSelect?.({ zoneId: polygon.id, vertexIndex });
          };
          const bodyCursor = polygonReadOnly
            ? 'pointer'
            : polygonLateralOnlyAxis
              ? lateralCursor
              : draggingId === polygon.id ? 'move' : 'pointer';

          return (
            <g key={polygon.id}>
              <polygon
                points={pointsStr}
                {...strokeFor(polygon.id, polygon.type)}
                strokeLinejoin="round"
                style={{ cursor: bodyCursor }}
                pointerEvents="all"
                onPointerDown={startPolygonMove}
                {...hoverHandlers(polygon.id)}
                {...pointerHandlers}
              />
              {polygonLateralOnlyAxis && (
                <polygon
                  points={pointsStr}
                  fill="transparent"
                  stroke="transparent"
                  strokeWidth={24}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="all"
                  style={{ cursor: lateralCursor }}
                  onPointerDown={startPolygonMove}
                  {...pointerHandlers}
                />
              )}
              {zoneLabel(polygon.id, centroidOf(canvasVertices), polygon.label)}
              {editable && polygonLateralOnlyAxis && lateralDragEdges.map(({ start, end, idx }) => (
                <line
                  key={`lateral-edge-${idx}`}
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke="transparent"
                  strokeWidth={28}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="stroke"
                  style={{ cursor: lateralCursor }}
                  onPointerDown={(e) => {
                    if (beginPointer(e)) startVertexDrag(idx);
                  }}
                  {...pointerHandlers}
                />
              ))}
              {editable && !polygonLateralOnlyAxis && canvasVertices.map((v, idx) => {
                const next = canvasVertices[(idx + 1) % canvasVertices.length];
                const mid = { x: (v.x + next.x) / 2, y: (v.y + next.y) / 2 };
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a vertex has no identity beyond its index
                  <g key={`midpoint-${idx}`}>
                    <circle
                      cx={mid.x}
                      cy={mid.y}
                      r={h.midR}
                      className="fill-surface/40 stroke-accent"
                      strokeWidth={h.stroke * 0.75}
                      pointerEvents="none"
                    />
                    <circle
                      cx={mid.x}
                      cy={mid.y}
                      r={Math.max(h.midR, h.hitR * 0.75)}
                      fill="transparent"
                      pointerEvents="all"
                      style={{ cursor: 'copy' }}
                      onPointerDown={(e) => {
                        if (!beginPointer(e) || !onPolygonZonesChange) return;
                        const vertices = insertEdgeMidpoint(polygon.vertices, idx);
                        replaceVertices(polygon.id, vertices);
                        startVertexDrag(idx + 1, vertices);
                      }}
                      {...pointerHandlers}
                    />
                  </g>
                );
              })}
              {editable && canvasVertices.map((v, idx) => handleCircle(
                `vertex-${idx}`,
                v,
                activeVertexIndex === idx,
                polygonLateralOnlyAxis ? lateralCursor : 'move',
                (e) => {
                  if (!beginPointer(e)) return;
                  if (e.altKey) {
                    if (vertexEditingEnabled && canDeleteVertex(polygon.vertices, idx)) onVertexDelete?.(polygon.id, idx);
                    return;
                  }
                  startVertexDrag(idx);
                },
              ))}
            </g>
          );
        }).filter(Boolean) : [];

        const draftElements = (() => {
          if (!drawing) return null;
          const capture = (
            <rect
              key="draw-capture"
              x={-5000}
              y={-5000}
              width={10700}
              height={10700}
              fill="transparent"
              pointerEvents="all"
              style={{ cursor: 'crosshair' }}
              onPointerDown={(e) => {
                if (!beginPointer(e)) return;
                const raw = toWorldFromEvent(e);
                if (!raw) return;
                rawCursorRef.current = raw;
                const point = drawPointFor(raw);
                if (tool === 'rectangle') {
                  gestureRef.current = { kind: 'draw-rect' };
                  setDraft({ tool: 'rectangle', start: point, end: point, square: false });
                  return;
                }
                const d = draftRef.current;
                if (d?.tool !== 'polygon') {
                  setDraft({ tool: 'polygon', points: [point] });
                  return;
                }
                if (d.points.length >= MIN_POLYGON_VERTICES && withinRadius(toCanvas(d.points[0]), toCanvas(raw), h.hitR)) {
                  finishPolygon();
                  return;
                }
                // The second click of a double-click lands on the vertex the first one placed.
                if (withinRadius(toCanvas(d.points[d.points.length - 1]), toCanvas(point), h.r)) return;
                setDraft({ ...d, points: [...d.points, point] });
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                finishPolygon();
              }}
              {...pointerHandlers}
            />
          );
          if (!draft) {
            return [capture, cursor && (
              <circle
                key="draw-cursor"
                cx={toCanvas(cursor.point).x}
                cy={toCanvas(cursor.point).y}
                r={h.r * 0.5}
                className="fill-accent"
                pointerEvents="none"
              />
            )];
          }
          if (draft.tool === 'rectangle') {
            const rect = rectFromCorners(toRectFrame(draft.start), toRectFrame(draft.end), draft.square);
            const corners = rectCorners(rect).map((p) => toCanvas(fromRectFrame(p)));
            const end = toCanvas(draft.end);
            return [
              capture,
              <polygon
                key="draft-rect"
                points={corners.map((p) => `${p.x},${p.y}`).join(' ')}
                className={`${ZONE_FILL[drawKind]} stroke-accent`}
                strokeWidth={outline.selected}
                strokeDasharray={meetsMinSize(rect) ? undefined : `${4 * px} ${3 * px}`}
                pointerEvents="none"
              />,
              label('draft-size', { x: end.x + 14 * px, y: end.y + 14 * px }, formatSizeLabel(rect.width, rect.height, displayUnits)),
            ];
          }
          const placed = draft.points.map((p) => toCanvas(p));
          const tip = cursor ? toCanvas(cursor.point) : null;
          const last = placed[placed.length - 1];
          const closing = !!cursor && placed.length >= MIN_POLYGON_VERTICES && withinRadius(placed[0], toCanvas(cursor.raw), h.hitR);
          const outlinePts = tip && !closing ? [...placed, tip] : placed;
          const lastRoom = draft.points[draft.points.length - 1];
          return [
            capture,
            <polygon
              key="draft-fill"
              points={outlinePts.map((p) => `${p.x},${p.y}`).join(' ')}
              className={`${ZONE_FILL[drawKind]} stroke-none`}
              pointerEvents="none"
            />,
            <polyline
              key="draft-edges"
              points={placed.map((p) => `${p.x},${p.y}`).join(' ')}
              className="fill-none stroke-accent"
              strokeWidth={outline.selected}
              strokeLinejoin="round"
              pointerEvents="none"
            />,
            tip && !closing && (
              <line
                key="draft-rubber"
                x1={last.x}
                y1={last.y}
                x2={tip.x}
                y2={tip.y}
                className="stroke-accent"
                strokeWidth={outline.selected}
                strokeDasharray={`${6 * px} ${4 * px}`}
                pointerEvents="none"
              />
            ),
            tip && !closing && cursor && label(
              'draft-length',
              { x: (last.x + tip.x) / 2, y: (last.y + tip.y) / 2 - 12 * px },
              formatLengthLabel(Math.hypot(cursor.point.x - lastRoom.x, cursor.point.y - lastRoom.y), displayUnits),
            ),
            ...placed.map((p, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a vertex has no identity beyond its index
              <circle key={`draft-v-${i}`}
                cx={p.x}
                cy={p.y}
                r={h.r * (i === 0 ? 0.8 : 0.6)}
                className="fill-accent"
                pointerEvents="none"
              />
            )),
            closing && (
              <circle
                key="draft-close"
                cx={placed[0].x}
                cy={placed[0].y}
                r={h.r * 1.6}
                className="fill-none stroke-accent"
                strokeWidth={2 * px}
                pointerEvents="none"
              />
            ),
          ];
        })();

        // Rendered before zones so zones stay interactable.
        const customOverlay = renderOverlay ? renderOverlay(params) : null;

        return (
          <>
            {furnitureElements}
            {params.deviceElement}
            {customOverlay}
            {!polygonMode && zoneElements}
            {polygonMode && polygonZoneElements}
            {draftElements}
          </>
        );
      }}
    />
    </div>
  );
};
