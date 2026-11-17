import {
  mdiAlertOutline,
  mdiEraser,
  mdiFire,
  mdiKeyboardOutline,
  mdiMapMarkerPath,
  mdiRecordCircleOutline,
  mdiStopCircleOutline,
  mdiTextBoxSearchOutline,
  mdiTune,
} from '@mdi/js';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { EP1DistanceArc } from '../../components/EP1DistanceArc';
import { HeatmapOverlay } from '../../components/HeatmapOverlay';
import type { SheetSnap } from '../../components/primitives';
import { Badge, Button, cx, IconButton } from '../../components/primitives';
import { ZoneCanvas } from '../../components/ZoneCanvas';
import { useDisplaySettings } from '../../hooks/useDisplaySettings';
import {
  getCeilingSliceLineDepth,
  getCeilingSlicePosition,
} from '../../utils/ceilingSlices';
import { coverageHeadingRad } from '../../utils/coverage';
import { getDeviceIconUrl } from '../../utils/deviceIcon';
import { LayersControl } from './DisplayLayers';
import { Inspector } from './Inspector';
import { LiveRoomPanel, ZONE_STRIPE } from './LiveRoomPanel';
import { PreviewChip } from './PreviewChip';
import { RoomBody } from './RoomBody';
import { TARGET_SWATCH, TargetPanel, targetSwatch } from './TargetPanel';
import type { RoomFrame, TargetPosition } from './types';
import { useLiveRoom } from './useLiveRoom';
import { ZonePanel } from './ZonePanel';
import { clampZoom, ZOOM_STEP, ZoomCluster } from './ZoomCluster';

type Point = { x: number; y: number };
type OverlayContext = Parameters<
  NonNullable<React.ComponentProps<typeof ZoneCanvas>['renderOverlay']>
>[0];

export const LIVE_RANGE_MM = 15000;

const TARGET_FILL = ['fill-target-1', 'fill-target-2', 'fill-target-3'];
const TARGET_STROKE = ['stroke-target-1', 'stroke-target-2', 'stroke-target-3'];
const TARGET_TINT = [
  'fill-target-1/20',
  'fill-target-2/20',
  'fill-target-3/20',
];
const tone = (list: string[], id: number) => list[(id - 1) % list.length];

const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const Separator = () => (
  <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-line" />
);

const Legend = ({ targets, zones }: { targets: boolean; zones: boolean }) => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
    {targets &&
      TARGET_SWATCH.map((swatch, index) => (
        <span key={swatch} className="flex items-center gap-1">
          <span className={cx('h-2.5 w-2.5 rounded-full', swatch)} />T
          {index + 1}
        </span>
      ))}
    {zones &&
      (['regular', 'entry', 'exclusion'] as const).map((kind) => (
        <span key={kind} className="flex items-center gap-1">
          <span className={cx('h-2.5 w-2.5 rounded-sm', ZONE_STRIPE[kind])} />
          {kind === 'regular'
            ? 'Detection'
            : kind === 'entry'
              ? 'Entry'
              : 'Exclusion'}
        </span>
      ))}
  </div>
);

export interface LiveModeProps {
  frame: RoomFrame;
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  onShowShortcuts: () => void;
}

export const LiveMode = ({
  frame,
  snap,
  onSnapChange,
  onShowShortcuts,
}: LiveModeProps) => {
  const {
    room,
    profile,
    liveState,
    viewport,
    selection,
    select,
    coverage,
    sensorConfig,
    draft,
  } = frame;
  const display = useDisplaySettings();
  const [smoothTracking, setSmoothTracking] = useState(true);
  const [showTrails, setShowTrails] = useState(false);
  const [cursor, setCursor] = useState<Point | null>(null);
  const live = useLiveRoom(frame, {
    heatmapEnabled: display.heatmapEnabled,
    heatmapHours: display.heatmapHours,
    showTrails,
    smoothTracking,
  });
  const canvasBox = useRef<HTMLDivElement>(null);
  const placement = room.devicePlacement;
  const tracking =
    live.capabilities.tracking === true &&
    !live.capabilities.distanceOnlyTracking;

  const { setZoom, onContainerSize } = frame;
  const zoomRef = useRef(viewport.zoom);
  zoomRef.current = viewport.zoom;
  useEffect(() => {
    const box = canvasBox.current;
    if (!box) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom(
        clampZoom(
          zoomRef.current + (event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP),
        ),
      );
    };
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) onContainerSize({ width, height });
    });
    box.addEventListener('wheel', onWheel, { passive: false });
    observer.observe(box);
    return () => {
      box.removeEventListener('wheel', onWheel);
      observer.disconnect();
    };
  }, [onContainerSize, setZoom]);

  // ZoneCanvas reads rotation from the placement only, so the resolved rotation (placement + draft angle) goes there.
  const canvasPlacement = useMemo(
    () =>
      placement
        ? { ...placement, rotationDeg: coverage.rotationDeg }
        : undefined,
    [coverage.rotationDeg, placement],
  );
  const deviceIconUrl = useMemo(
    () => getDeviceIconUrl(profile, placement),
    [profile, placement],
  );

  const deviceLocalToRoom = (x: number, y: number): Point => {
    if (!placement) return { x, y };
    const rad = (coverage.rotationDeg * Math.PI) / 180;
    return {
      x: x * Math.cos(rad) - y * Math.sin(rad) + placement.x,
      y: x * Math.sin(rad) + y * Math.cos(rad) + placement.y,
    };
  };

  const ring = (
    key: string,
    distanceM: number | null | undefined,
    className: string,
    label: string,
    ctx: OverlayContext,
    extra: { fillOpacity?: number; pulse?: boolean } = {},
  ): ReactNode => {
    if (!placement || !finite(distanceM) || distanceM <= 0) return null;
    const heading = coverageHeadingRad(coverage.rotationDeg);
    const labelPoint = ctx.toCanvas({
      x: placement.x + distanceM * 1000 * Math.cos(heading),
      y: placement.y + distanceM * 1000 * Math.sin(heading),
    });
    const px = ctx.pxToSvg ?? 1;
    return (
      <g key={key} className={className} style={{ pointerEvents: 'none' }}>
        <EP1DistanceArc
          distance={distanceM}
          devicePlacement={placement}
          rotationDeg={coverage.rotationDeg}
          toCanvas={ctx.toCanvas}
          rangeMm={LIVE_RANGE_MM}
          fieldOfViewDeg={coverage.fovDeg}
          color="currentColor"
          fillOpacity={extra.fillOpacity ?? 0.06}
          strokeOpacity={0.6}
          showLabel={false}
          showPulse={extra.pulse}
          roomShellPoints={ctx.roomShellPoints}
          clipToWalls={display.clipRadarToWalls}
        />
        <text
          x={labelPoint.x + 6 * px}
          y={labelPoint.y - 6 * px}
          fontSize={11 * px}
          fontWeight={600}
          className="fill-current stroke-cv-halo"
          strokeWidth={3 * px}
          paintOrder="stroke"
        >
          {label}
        </text>
      </g>
    );
  };

  const stop = (event: React.SyntheticEvent) => event.stopPropagation();

  const renderTargets = (ctx: OverlayContext) => {
    if (!display.showTargets || live.isCeilingMount) return null;
    const px = ctx.pxToSvg ?? 1;
    const scale = display.targetMarkerScale;
    const now = Date.now();
    return (
      <g data-layer="targets">
        {showTrails &&
          frame.targetPositions.map((target) => {
            const trail = live.trails.get(target.id) ?? [];
            if (trail.length < 2) return null;
            const points = trail.map((p) => ctx.toCanvas(p));
            return (
              <g
                key={`trail-${target.id}`}
                className={tone(TARGET_FILL, target.id)}
                style={{ pointerEvents: 'none' }}
              >
                <polyline
                  points={points.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  className={tone(TARGET_STROKE, target.id)}
                  strokeWidth={2 * px}
                  strokeLinecap="round"
                  opacity={0.3}
                />
                {points.map((p, index) => {
                  const age = Math.min(
                    1,
                    (now - trail[index].timestamp) / 5000,
                  );
                  return (
                    <circle
                      key={trail[index].timestamp}
                      cx={p.x}
                      cy={p.y}
                      r={(3 + (1 - age) * 2) * px}
                      opacity={Math.max(0.1, 1 - age) * 0.6}
                    />
                  );
                })}
              </g>
            );
          })}
        {frame.targetPositions.map((target: TargetPosition) => {
          const pos = ctx.toCanvas(live.renderPosition(target));
          const beyond =
            placement &&
            Math.hypot(target.x - placement.x, target.y - placement.y) >
              coverage.rangeMm;
          const selected =
            selection.kind === 'target' && selection.id === target.id;
          return (
            // biome-ignore lint/a11y/useSemanticElements: SVG has no button element
            <g
              key={target.id}
              role="button"
              tabIndex={-1}
              aria-label={`Target ${target.id}`}
              data-target-id={target.id}
              className="cursor-pointer"
              onPointerDown={stop}
              onClick={(event) => {
                event.stopPropagation();
                select({ kind: 'target', id: target.id });
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter')
                  select({ kind: 'target', id: target.id });
              }}
            >
              <circle
                cx={pos.x}
                cy={pos.y}
                r={18 * px * scale}
                className={cx(
                  beyond ? 'fill-none' : tone(TARGET_TINT, target.id),
                  tone(TARGET_STROKE, target.id),
                )}
                strokeWidth={1.5 * px}
              />
              <circle
                cx={pos.x}
                cy={pos.y}
                r={7 * px * scale}
                className={cx(
                  beyond ? 'fill-none' : tone(TARGET_FILL, target.id),
                  tone(TARGET_STROKE, target.id),
                  !beyond && 'stroke-cv-halo',
                )}
                strokeWidth={2 * px}
              />
              {selected && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={22 * px * scale}
                  className="fill-none stroke-accent"
                  strokeWidth={2 * px}
                />
              )}
              <text
                x={pos.x}
                y={pos.y - 24 * px * scale}
                textAnchor="middle"
                fontSize={11 * px * scale}
                fontWeight={700}
                className="pointer-events-none fill-fg stroke-cv-halo"
                strokeWidth={3 * px}
                paintOrder="stroke"
              >
                T{target.id}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  const renderCeilingTargets = (ctx: OverlayContext) => {
    if (!display.showTargets || !live.isCeilingMount || !liveState?.targets)
      return null;
    const px = ctx.pxToSvg ?? 1;
    const config = live.ceilingSliceConfig;
    return (
      <g data-layer="ceiling-targets" style={{ pointerEvents: 'none' }}>
        {liveState.targets.map((target) => {
          if (target.x === null || target.y === null) return null;
          if (target.x === 0 && target.y === 0 && target.active !== true)
            return null;
          const lateral = getCeilingSlicePosition(target, config);
          if (lateral === null) return null;
          const depth = getCeilingSliceLineDepth(
            lateral,
            config,
            live.heightCoverage,
            live.maxRangeMm,
          );
          if (!depth) return null;
          const [a, b] = (
            config.axis === 'x'
              ? [
                  deviceLocalToRoom(lateral, depth.min),
                  deviceLocalToRoom(lateral, depth.max),
                ]
              : [
                  deviceLocalToRoom(depth.min, lateral),
                  deviceLocalToRoom(depth.max, lateral),
                ]
          ).map((p) => ctx.toCanvas(p));
          const mid = ctx.toCanvas(
            deviceLocalToRoom(
              config.axis === 'x' ? lateral : 0,
              config.axis === 'x' ? 0 : lateral,
            ),
          );
          return (
            <g key={target.id} className={tone(TARGET_STROKE, target.id)}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className="stroke-cv-halo"
                strokeWidth={6 * px}
                strokeLinecap="round"
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                strokeWidth={3 * px}
                strokeLinecap="round"
                strokeDasharray={`${8 * px} ${6 * px}`}
              />
              <circle
                cx={mid.x}
                cy={mid.y}
                r={7 * px}
                className={cx(tone(TARGET_FILL, target.id), 'stroke-cv-halo')}
                strokeWidth={2 * px}
              />
              <text
                x={mid.x}
                y={mid.y - 12 * px}
                textAnchor="middle"
                fontSize={11 * px}
                fontWeight={700}
                className="fill-fg stroke-cv-halo"
                strokeWidth={3 * px}
                paintOrder="stroke"
              >
                T{target.id}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  const renderRecorded = (ctx: OverlayContext) => {
    if (!live.recorded.length) return null;
    const px = ctx.pxToSvg ?? 1;
    const ids = [...new Set(live.recorded.map((p) => p.targetId))];
    return (
      <g data-layer="recorded-path" style={{ pointerEvents: 'none' }}>
        {ids.map((id) => {
          const points = live.recorded
            .filter((p) => p.targetId === id)
            .map((p) => ctx.toCanvas(p));
          if (points.length < 2) return null;
          return (
            <g key={id} className={tone(TARGET_STROKE, id)}>
              <path
                d={points
                  .map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`)
                  .join(' ')}
                fill="none"
                strokeWidth={2.5 * px}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.75}
              />
              <circle
                cx={points[0].x}
                cy={points[0].y}
                r={6 * px}
                fill="none"
                strokeWidth={2 * px}
              />
              <text
                x={points[0].x + 9 * px}
                y={points[0].y + 4 * px}
                fontSize={10 * px}
                fontWeight={700}
                className="fill-fg stroke-cv-halo"
                strokeWidth={3 * px}
                paintOrder="stroke"
              >
                Start
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  const renderAligned = (ctx: OverlayContext) => {
    const angle = sensorConfig.installationAngle ?? 0;
    if (!display.showAlignedDirection || !placement || angle === 0) return null;
    const px = ctx.pxToSvg ?? 1;
    const heading = coverageHeadingRad(coverage.rotationDeg);
    const start = ctx.toCanvas(placement);
    const length = 80 * px;
    const end = {
      x: start.x + Math.cos(heading) * length,
      y: start.y + Math.sin(heading) * length,
    };
    const wing = (offset: number) => ({
      x: end.x + Math.cos(heading + offset) * 8 * px,
      y: end.y + Math.sin(heading + offset) * 8 * px,
    });
    const [w1, w2] = [wing(Math.PI * 0.85), wing(-Math.PI * 0.85)];
    const rotation = (
      (((coverage.rotationDeg % 360) + 540) % 360) -
      180
    ).toFixed(0);
    return (
      <g
        data-layer="aligned-direction"
        className="text-warning"
        style={{ pointerEvents: 'none' }}
      >
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke="currentColor"
          strokeWidth={2 * px}
          strokeDasharray={`${6 * px} ${4 * px}`}
        />
        <path
          d={`M ${end.x} ${end.y} L ${w1.x} ${w1.y} L ${w2.x} ${w2.y} Z`}
          fill="currentColor"
        />
        <text
          x={end.x + 10 * px}
          y={end.y + 4 * px}
          fontSize={11 * px}
          fontWeight={600}
          className="fill-warning-ink stroke-cv-halo"
          strokeWidth={3 * px}
          paintOrder="stroke"
        >
          Aligned {rotation}°
        </text>
      </g>
    );
  };

  const renderDeviceHit = (ctx: OverlayContext) => {
    if (!placement) return null;
    const px = ctx.pxToSvg ?? 1;
    const p = ctx.toCanvas(placement);
    const selected = selection.kind === 'device';
    return (
      // biome-ignore lint/a11y/useSemanticElements: SVG has no button element
      <g
        role="button"
        tabIndex={-1}
        aria-label="Sensor settings"
        aria-pressed={selected}
        data-device-marker=""
        className="cursor-pointer"
        onPointerDown={stop}
        onClick={(event) => {
          event.stopPropagation();
          select({ kind: 'device' });
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') select({ kind: 'device' });
        }}
      >
        {selected && (
          <circle
            cx={p.x}
            cy={p.y}
            r={20 * px}
            className="fill-none stroke-accent"
            strokeWidth={2 * px}
          />
        )}
        <circle cx={p.x} cy={p.y} r={22 * px} fill="transparent" />
      </g>
    );
  };

  const renderOverlay = (ctx: OverlayContext) => {
    const config = liveState?.config;
    const cm = (draftKey: string, live?: number | null) => {
      const value = draft.draft.values[draftKey] ?? live;
      return finite(value) ? value / 100 : null;
    };
    const ep1 = live.capabilities.distanceOnlyTracking === true;
    return (
      <g
        data-coverage-rotation={ctx.coverage.rotationDeg}
        data-coverage-range={ctx.coverage.rangeMm}
      >
        {tracking && (
          <HeatmapOverlay
            data={live.heatmap.data}
            visible={display.heatmapEnabled}
            toCanvas={ctx.toCanvas}
            devicePlacement={placement}
            installationAngle={sensorConfig.installationAngle ?? 0}
            intensityThreshold={display.heatmapThreshold}
            roomShellPoints={ctx.roomShellPoints}
          />
        )}
        {renderRecorded(ctx)}
        {ep1 &&
          display.showMaxDistanceOverlay &&
          ring(
            'min',
            cm('mmwaveDistanceMin', config?.distanceMin),
            'text-cv-dim',
            'Min',
            ctx,
            { fillOpacity: 0 },
          )}
        {ep1 &&
          display.showMaxDistanceOverlay &&
          ring(
            'max',
            cm('mmwaveDistanceMax', config?.distanceMax),
            'text-cv-wall',
            'Max',
            ctx,
          )}
        {ep1 &&
          display.showTriggerDistanceOverlay &&
          ring(
            'trigger',
            cm('mmwaveTriggerDistance', config?.triggerDistance),
            'text-accent',
            'Trigger',
            ctx,
          )}
        {ep1 &&
          finite(liveState?.distance) &&
          ring(
            'distance',
            liveState.distance,
            'text-target-1',
            `${liveState.distance.toFixed(2)} m`,
            ctx,
            { fillOpacity: 0.15, pulse: true },
          )}
        {tracking &&
          display.showMaxDistanceOverlay &&
          finite(sensorConfig.maxDistance) &&
          ring(
            'max',
            sensorConfig.maxDistance / 100,
            'text-cv-ring',
            `Max ${(sensorConfig.maxDistance / 100).toFixed(2)} m`,
            ctx,
            { fillOpacity: 0 },
          )}
        {renderCeilingTargets(ctx)}
        {renderTargets(ctx)}
        {tracking && renderAligned(ctx)}
        {renderDeviceHit(ctx)}
      </g>
    );
  };

  const selectedTitle = (() => {
    switch (selection.kind) {
      case 'target':
        return {
          title: `Target ${selection.id}`,
          swatchClass: targetSwatch(selection.id),
        };
      case 'zone':
        return {
          title: live.zones.find((z) => z.id === selection.id)?.label ?? 'Zone',
        };
      case 'device':
        return { title: 'Sensor', icon: mdiTune };
      default:
        return { title: room.name };
    }
  })();

  const inspectorBody = () => {
    switch (selection.kind) {
      case 'target':
        return (
          <TargetPanel frame={frame} live={live} targetId={selection.id} />
        );
      case 'zone':
        return <ZonePanel frame={frame} live={live} zoneId={selection.id} />;
      default:
        return (
          <LiveRoomPanel
            frame={frame}
            live={live}
            display={display}
            focus={selection.kind === 'device' ? 'sensor' : undefined}
          />
        );
    }
  };

  const toolbar = (
    <>
      {tracking && (
        <IconButton
          icon={live.recording ? mdiStopCircleOutline : mdiRecordCircleOutline}
          label={live.recording ? 'Stop recording' : 'Record path'}
          pressed={live.recording}
          className={
            live.recording ? 'text-danger-ink [&>svg]:animate-pulse' : undefined
          }
          badge={live.recorded.length > 0 ? live.recorded.length : undefined}
          tooltipSide="bottom"
          onClick={live.toggleRecording}
        />
      )}
      {tracking && live.recorded.length > 0 && (
        <IconButton
          icon={mdiEraser}
          label="Clear path"
          tooltipSide="bottom"
          onClick={live.clearRecording}
        />
      )}
      {tracking && (
        <IconButton
          icon={mdiMapMarkerPath}
          label="Movement trails"
          pressed={showTrails}
          tooltipSide="bottom"
          onClick={() => setShowTrails((on) => !on)}
        />
      )}
      {live.supportsHeatmap && (
        <IconButton
          icon={mdiFire}
          label="Heatmap"
          pressed={display.heatmapEnabled}
          busy={display.heatmapEnabled && live.heatmap.loading}
          tooltipSide="bottom"
          onClick={() => display.setHeatmapEnabled(!display.heatmapEnabled)}
        />
      )}
      {tracking && <Separator />}
      <LayersControl
        display={display}
        features={{
          triggerRing: live.capabilities.distanceOnlyTracking === true,
          alignedDirection: tracking,
        }}
        smoothTracking={
          tracking
            ? { value: smoothTracking, onChange: setSmoothTracking }
            : undefined
        }
      />
      {room.deviceId && (
        <IconButton
          icon={mdiTextBoxSearchOutline}
          label="Device logs"
          tooltipSide="bottom"
          onClick={frame.openLogs}
        />
      )}
    </>
  );

  return (
    <RoomBody
      canvasRef={canvasBox}
      dimmed={frame.offline}
      toolbar={toolbar}
      toolbarEnd={
        <IconButton
          icon={mdiKeyboardOutline}
          label="Keyboard shortcuts"
          shortcut="?"
          tooltipSide="bottom"
          className="max-md:hidden"
          onClick={onShowShortcuts}
        />
      }
      canvas={
        <ZoneCanvas
          zones={live.rectZones}
          onZonesChange={() => undefined}
          polygonZones={live.displayPolygonZones}
          polygonMode={live.polygonMode}
          polygonReadOnly
          selectedId={selection.kind === 'zone' ? selection.id : null}
          onSelect={(id) =>
            select(id ? { kind: 'zone', id } : { kind: 'none' })
          }
          rangeMm={LIVE_RANGE_MM}
          height="100%"
          zoom={viewport.zoom}
          panOffsetMm={viewport.panOffsetMm}
          onPanChange={frame.setPan}
          onZoomChange={frame.setZoom}
          touchPanEnabled
          onCanvasMove={setCursor}
          roomShell={room.roomShell}
          roomShellFillMode={room.roomShellFillMode}
          floorMaterial={room.floorMaterial}
          devicePlacement={canvasPlacement}
          installationAngle={0}
          fieldOfViewDeg={coverage.fovDeg}
          maxRangeMeters={coverage.rangeMm / 1000}
          deviceIconUrl={deviceIconUrl}
          heightCoverage={
            display.showDeviceRadar
              ? (live.heightCoverage ?? undefined)
              : undefined
          }
          showRadar={display.showDeviceRadar && !live.isCeilingMount}
          clipRadarToWalls={display.clipRadarToWalls}
          furniture={room.furniture ?? []}
          doors={room.doors ?? []}
          zoneLabels={live.zoneLabels}
          showWalls={display.showWalls}
          showFurniture={display.showFurniture}
          showDoors={display.showDoors}
          showZones={display.showZones && !frame.offline}
          showZoneLabels={display.showZoneLabels}
          zoneLabelScale={display.zoneLabelScale}
          showDevice={display.showDeviceIcon}
          deviceMarkerStyle={display.deviceMarkerStyle}
          deviceMarkerScale={display.deviceMarkerScale}
          deviceMarkerOpacity={display.deviceMarkerOpacity}
          renderOverlay={renderOverlay}
        />
      }
      overlays={
        <>
          <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-2">
            {draft.dirtyCount > 0 && (
              <PreviewChip
                count={draft.dirtyCount}
                busy={draft.applying}
                onApply={() => void draft.apply()}
                onDiscard={draft.discard}
              />
            )}
            {live.needsResync && (
              <div className="flex items-center gap-2 rounded-xl border border-warning/40 bg-surface/95 py-1 pl-2 pr-1 shadow-e1">
                <Badge tone="warning" icon={mdiAlertOutline}>
                  Entity mappings are not set up
                </Badge>
                <Button size="sm" onClick={frame.openResync}>
                  Re-sync
                </Button>
              </div>
            )}
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 space-y-1 rounded-lg bg-surface/80 px-2 py-1.5 max-md:hidden">
            <Legend targets={tracking} zones={tracking && display.showZones} />
            {cursor && (
              <output className="block text-xs tabular-nums text-fg-muted [@media(pointer:coarse)]:hidden">
                X {(cursor.x / 1000).toFixed(2)} m, Y{' '}
                {(cursor.y / 1000).toFixed(2)} m
              </output>
            )}
          </div>
          <ZoomCluster
            zoom={viewport.zoom}
            onZoom={setZoom}
            onFit={frame.fit}
          />
        </>
      }
      inspector={
        <Inspector
          {...selectedTitle}
          onBack={
            selection.kind === 'none'
              ? undefined
              : () => select({ kind: 'none' })
          }
          snap={snap}
          onSnapChange={onSnapChange}
          peekAction={
            draft.dirtyCount > 0 ? (
              <Button
                size="sm"
                variant="primary"
                busy={draft.applying}
                onClick={() => void draft.apply()}
              >
                Apply
              </Button>
            ) : undefined
          }
        >
          {inspectorBody()}
        </Inspector>
      }
    />
  );
};
