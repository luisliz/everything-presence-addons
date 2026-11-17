import {
  mdiAlertOutline,
  mdiCursorDefaultOutline,
  mdiKeyboardOutline,
  mdiMagnet,
  mdiRedo,
  mdiTune,
  mdiUndo,
  mdiVectorPolygon,
  mdiVectorRectangle,
} from '@mdi/js';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  cx,
  IconButton,
  Kbd,
  Panel,
  SaveState,
  Segmented,
  type SheetSnap,
  useToast,
} from '../../../components/primitives';
import {
  type NewZone,
  type PolygonVertexSelection,
  ZoneCanvas,
  type ZoneDrawDraft,
  type ZoneTool,
} from '../../../components/ZoneCanvas';
import { useDisplaySettings } from '../../../hooks/useDisplaySettings';
import { useLeaveGuard } from '../../../router';
import {
  getCeilingSliceLineDepth,
  getCeilingSlicePosition,
} from '../../../utils/ceilingSlices';
import { getDeviceIconUrl } from '../../../utils/deviceIcon';
import { LayersControl } from '../DisplayLayers';
import { Inspector } from '../Inspector';
import { LIVE_RANGE_MM } from '../LiveMode';
import { ZONE_STRIPE } from '../LiveRoomPanel';
import { PreviewChip } from '../PreviewChip';
import { RoomBody } from '../RoomBody';
import { SensorSection } from '../SensorSection';
import { NO_SELECTION, type RoomFrame } from '../types';
import type { LiveZone } from '../useLiveRoom';
import { useZoneKeys } from '../useRoomKeys';
import { type ZoneEdit, ZonePanel } from '../ZonePanel';
import { clampZoom, ZOOM_STEP, ZoomCluster } from '../ZoomCluster';
import { useZonesEditor } from './useZonesEditor';
import { ZoneBackupsSheet } from './ZoneBackupsSheet';
import { ZonesRoomPanel } from './ZonesRoomPanel';
import { KIND_PREFIX, slotNumber, type ZoneKind } from './zoneSlots';

type Point = { x: number; y: number };
type OverlayContext = Parameters<
  NonNullable<React.ComponentProps<typeof ZoneCanvas>['renderOverlay']>
>[0] & { pxToSvg?: number };

/** Canvas column width at which the tool segments keep their labels next to the kind segments and Save. */
const TOOL_LABELS_MIN_PX = 1180;

const TARGET_FILL = ['fill-target-1', 'fill-target-2', 'fill-target-3'];
const TARGET_STROKE = ['stroke-target-1', 'stroke-target-2', 'stroke-target-3'];
const tone = (list: string[], id: number) => list[(id - 1) % list.length];
const KIND_NOUN: Record<ZoneKind, string> = {
  regular: 'zone',
  exclusion: 'exclusion',
  entry: 'entry',
};

const Separator = () => (
  <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-line" />
);

const KeyRow = ({ keys, children }: { keys: string[]; children: string }) => (
  <li className="flex items-center gap-3">
    <span className="flex w-28 shrink-0 flex-wrap gap-1">
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </span>
    <span className="text-fg">{children}</span>
  </li>
);

export interface ZonesModeProps {
  frame: RoomFrame;
  onWizardZonesReady: () => void;
  onShowShortcuts: () => void;
}

export const ZonesMode = ({
  frame,
  onWizardZonesReady,
  onShowShortcuts,
}: ZonesModeProps) => {
  const {
    room,
    profile,
    viewport,
    selection,
    select,
    coverage,
    draft,
    liveState,
  } = frame;
  const display = useDisplaySettings();
  const toast = useToast();
  const units = display.units;
  const editor = useZonesEditor(frame, onWizardZonesReady);
  const [labelled, setLabelled] = useState(false);
  const [tool, setTool] = useState<ZoneTool>('select');
  const [kind, setKind] = useState<ZoneKind>('regular');
  const [snapMm, setSnapMm] = useState(100);
  const lastSnap = useRef(100);
  const [altHeld, setAltHeld] = useState(false);
  const [drawDraft, setDrawDraft] = useState<ZoneDrawDraft | null>(null);
  const [vertex, setVertex] = useState<PolygonVertexSelection | null>(null);
  const [focusNameFor, setFocusNameFor] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('peek');
  const [backupsOpen, setBackupsOpen] = useState(false);
  const canvasBox = useRef<HTMLDivElement>(null);
  const placement = room.devicePlacement;
  const selectedId = selection.kind === 'zone' ? selection.id : null;
  const polygonAllowed = editor.polygonMode && !editor.isCeiling;
  const activeTool: ZoneTool =
    tool === 'polygon' && !polygonAllowed ? 'select' : tool;

  const { setZoom, onContainerSize } = frame;
  const zoomRef = useRef(viewport.zoom);
  zoomRef.current = viewport.zoom;
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;
  useEffect(() => {
    const box = canvasBox.current;
    if (!box) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (draggingRef.current) return;
      setZoom(
        clampZoom(
          zoomRef.current + (event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP),
        ),
      );
    };
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) onContainerSize({ width, height });
      setLabelled(width >= TOOL_LABELS_MIN_PX);
    });
    box.addEventListener('wheel', onWheel, { passive: false });
    observer.observe(box);
    return () => {
      box.removeEventListener('wheel', onWheel);
      observer.disconnect();
    };
  }, [onContainerSize, setZoom]);

  useEffect(() => {
    const track = (event: KeyboardEvent) => setAltHeld(event.altKey);
    const release = () => setAltHeld(false);
    window.addEventListener('keydown', track);
    window.addEventListener('keyup', track);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', track);
      window.removeEventListener('keyup', track);
      window.removeEventListener('blur', release);
    };
  }, []);

  const selectionKey =
    selection.kind === 'zone' ? selection.id : selection.kind;
  useEffect(() => {
    if (selectionKey !== 'none')
      setSheetSnap((current) => (current === 'peek' ? 'half' : current));
    setVertex((current) => (current?.zoneId === selectionKey ? current : null));
    setFocusNameFor((current) => (current === selectionKey ? current : null));
  }, [selectionKey]);

  useEffect(() => {
    if (
      editor.loaded &&
      selectedId &&
      !editor.zones.some((z) => z.id === selectedId)
    )
      select(NO_SELECTION);
  }, [editor.loaded, editor.zones, select, selectedId]);

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

  const chooseTool = (next: ZoneTool) => {
    if (next === 'polygon' && !polygonAllowed) return;
    const drawable = editor.slots.filter(
      (s) => s.next !== null && (!editor.isCeiling || s.kind === 'exclusion'),
    );
    if (next !== 'select' && !drawable.some((s) => s.kind === kind)) {
      if (drawable.length === 0) {
        toast.show('All zone slots on this device are used', {
          tone: 'warning',
        });
        return;
      }
      setKind(drawable[0].kind);
    }
    if (next !== 'select') select(NO_SELECTION);
    setTool(next);
  };

  const commitZone = (shape: NewZone) => {
    const id = editor.commit(shape);
    if (!id) return;
    select({ kind: 'zone', id });
    setFocusNameFor(id);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    editor.removeZone(selectedId);
    select(NO_SELECTION);
  };

  const save = () => {
    if (editor.dirtyCount > 0 && !editor.saving) void editor.save();
  };

  useLeaveGuard(
    editor.dirtyCount > 0,
    'Zone changes are not on the device yet.',
    {
      title: 'Unsaved zones',
      onSave: editor.save,
    },
  );

  useZoneKeys({
    tool: chooseTool,
    undo: editor.undo,
    redo: editor.redo,
    save,
    fit: frame.fit,
    zoomBy: (delta) => setZoom(zoomRef.current + delta * ZOOM_STEP),
    escape: () => {
      if (activeTool !== 'select') setTool('select');
      else select(NO_SELECTION);
    },
    canvasKey: (event) => {
      const el = canvasBox.current?.querySelector<HTMLElement>(
        '[role="application"]',
      );
      if (!el || el.contains(event.target as Node)) return false;
      el.focus({ preventScroll: true });
      return !el.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: event.key,
          shiftKey: event.shiftKey,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
  });

  const occupancy = liveState?.zoneOccupancy as
    | Record<string, boolean | undefined>
    | undefined;
  const liveZones: LiveZone[] = editor.zones.map((zone) => {
    const slot =
      zone.type === 'regular' ? (slotNumber(zone.id) ?? undefined) : undefined;
    return {
      id: zone.id,
      kind: zone.type,
      label: zone.label || zone.id,
      slot,
      occupied: slot ? (occupancy?.[`zone${slot}`] ?? false) : undefined,
    };
  });
  const selectedZone = selectedId
    ? editor.zones.find((z) => z.id === selectedId)
    : undefined;
  const edit: ZoneEdit | undefined = selectedZone && {
    zone: selectedZone,
    units,
    focusName: focusNameFor === selectedZone.id,
    geometryLocked: editor.isCeiling,
    deletable: !editor.isCeiling || selectedZone.type === 'exclusion',
    unavailable: editor.unavailable(selectedZone),
    selectedVertex:
      vertex?.zoneId === selectedZone.id ? vertex.vertexIndex : null,
    onSelectVertex: (index) =>
      setVertex(
        index === null ? null : { zoneId: selectedZone.id, vertexIndex: index },
      ),
    onRename: (label) => editor.rename(selectedZone.id, label),
    onChange: editor.updateZone,
    onDeleteVertex: (index) => {
      if (editor.removeVertex(selectedZone.id, index)) setVertex(null);
    },
    onDelete: deleteSelected,
    onHistoryKey: (redo) => (redo ? editor.redo() : editor.undo()),
  };

  const stop = (event: React.SyntheticEvent) => event.stopPropagation();

  const renderOverlay = (ctx: OverlayContext) => {
    const px = ctx.pxToSvg ?? 1;
    const rad = (coverage.rotationDeg * Math.PI) / 180;
    const local = (x: number, y: number) =>
      placement
        ? {
            x: placement.x + x * Math.cos(rad) - y * Math.sin(rad),
            y: placement.y + x * Math.sin(rad) + y * Math.cos(rad),
          }
        : { x, y };
    const ceilingTargets =
      display.showTargets && editor.isCeiling
        ? (liveState?.targets ?? []).flatMap((target) => {
            if (target.x === null || target.y === null) return [];
            if (target.x === 0 && target.y === 0 && target.active !== true)
              return [];
            const config = editor.ceilingConfig;
            const lateral = getCeilingSlicePosition(target, config);
            if (lateral === null) return [];
            const depth = getCeilingSliceLineDepth(
              lateral,
              config,
              editor.heightCoverage,
              coverage.rangeMm,
            );
            if (!depth) return [];
            const [a, b] = (
              config.axis === 'x'
                ? [local(lateral, depth.min), local(lateral, depth.max)]
                : [local(depth.min, lateral), local(depth.max, lateral)]
            ).map((p) => ctx.toCanvas(p));
            return [
              <line
                key={target.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className={tone(TARGET_STROKE, target.id)}
                strokeWidth={3 * px}
                strokeLinecap="round"
                strokeDasharray={`${8 * px} ${6 * px}`}
              />,
            ];
          })
        : [];
    const device = placement ? ctx.toCanvas(placement) : null;
    return (
      <g>
        <g data-layer="targets" style={{ pointerEvents: 'none' }}>
          {display.showTargets &&
            !editor.isCeiling &&
            frame.targetPositions.map((target) => {
              const p = ctx.toCanvas(target);
              return (
                <circle
                  key={target.id}
                  cx={p.x}
                  cy={p.y}
                  r={6 * px * display.targetMarkerScale}
                  className={cx(tone(TARGET_FILL, target.id), 'stroke-cv-halo')}
                  strokeWidth={2 * px}
                />
              );
            })}
          {ceilingTargets}
        </g>
        {device && (
          // biome-ignore lint/a11y/useSemanticElements: SVG has no button element
          <g
            role="button"
            tabIndex={-1}
            aria-label="Sensor settings"
            aria-pressed={selection.kind === 'device'}
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
            {selection.kind === 'device' && (
              <circle
                cx={device.x}
                cy={device.y}
                r={20 * px}
                className="fill-none stroke-accent"
                strokeWidth={2 * px}
              />
            )}
            <circle
              cx={device.x}
              cy={device.y}
              r={22 * px}
              fill="transparent"
            />
          </g>
        )}
      </g>
    );
  };

  const slotFor = editor.slots.find((s) => s.kind === kind);
  const drawingPanel = () => {
    const points = drawDraft?.vertices.length ?? 0;
    const short =
      activeTool === 'polygon' && points > 0 && !drawDraft?.canFinish;
    return (
      <Panel variant="section" className="border-t-0">
        <div className="space-y-4">
          <ul className="space-y-2 text-sm">
            {activeTool === 'polygon' ? (
              <>
                <KeyRow keys={['Click']}>Click to add a point</KeyRow>
                <KeyRow keys={['Enter']}>
                  Enter or click the first point to finish
                </KeyRow>
                <KeyRow keys={['Backspace', 'Esc']}>
                  Backspace removes the last point, Esc cancels
                </KeyRow>
              </>
            ) : (
              <>
                <KeyRow keys={['Drag']}>Drag to draw the rectangle</KeyRow>
                <KeyRow keys={['Shift', 'Alt']}>
                  Shift keeps it square, Alt turns snap off
                </KeyRow>
                <KeyRow keys={['Esc']}>Esc cancels</KeyRow>
              </>
            )}
          </ul>
          {activeTool === 'polygon' && (
            <output
              data-draft-points={points}
              className={cx(
                'block text-sm tabular-nums',
                short ? 'text-warning-ink' : 'text-fg-muted',
              )}
            >
              {points} {points === 1 ? 'point' : 'points'}
              {short ? '. Add at least 3 points' : ''}
            </output>
          )}
          {slotFor?.next && !editor.isCeiling && (
            <p className="text-sm text-fg-muted">
              The zone goes into slot {slotFor.next}.
            </p>
          )}
        </div>
      </Panel>
    );
  };

  const header = (() => {
    if (activeTool !== 'select')
      return {
        title: `New ${activeTool} ${KIND_NOUN[kind]}`,
        icon: activeTool === 'polygon' ? mdiVectorPolygon : mdiVectorRectangle,
      };
    if (selectedZone)
      return {
        title: selectedZone.label || selectedZone.id,
        swatchClass: ZONE_STRIPE[selectedZone.type],
      };
    if (selection.kind === 'device') return { title: 'Sensor', icon: mdiTune };
    return { title: room.name };
  })();

  const body = () => {
    if (activeTool !== 'select') return drawingPanel();
    if (selectedId)
      return (
        <ZonePanel
          frame={frame}
          live={{ zones: liveZones }}
          zoneId={selectedId}
          edit={edit}
        />
      );
    if (selection.kind === 'device')
      return (
        <SensorSection
          sensor={frame.sensor}
          draft={draft}
          offline={frame.offline}
          hasDevice={Boolean(room.deviceId)}
          defaultOpen
          onResync={frame.openResync}
        />
      );
    return (
      <ZonesRoomPanel
        frame={frame}
        editor={editor}
        units={units}
        snapMm={snapMm}
        onSnapChange={(mm) => {
          if (mm > 0) lastSnap.current = mm;
          setSnapMm(mm);
        }}
        onOpenBackups={() => setBackupsOpen(true)}
      />
    );
  };

  const toolOptions = [
    {
      value: 'select' as const,
      label: 'Select',
      icon: mdiCursorDefaultOutline,
      tooltip: 'Select (V)',
    },
    ...(polygonAllowed
      ? [
          {
            value: 'polygon' as const,
            label: 'Polygon',
            icon: mdiVectorPolygon,
            tooltip: 'Polygon (P)',
          },
        ]
      : []),
    {
      value: 'rectangle' as const,
      label: 'Rectangle',
      icon: mdiVectorRectangle,
      tooltip: 'Rectangle (R)',
    },
  ];

  const toolbar = (
    <>
      <Segmented<ZoneTool>
        ariaLabel="Tool"
        value={activeTool}
        onChange={chooseTool}
        iconOnly={!labelled}
        options={toolOptions}
      />
      {activeTool !== 'select' && (
        <Segmented<ZoneKind>
          ariaLabel="Zone kind"
          value={kind}
          onChange={setKind}
          className="ml-1"
          options={editor.slots.map((slot) => ({
            value: slot.kind,
            label: KIND_PREFIX[slot.kind],
            disabled:
              slot.next === null ||
              (editor.isCeiling && slot.kind !== 'exclusion'),
            tooltip:
              slot.next === null
                ? `All ${slot.total} ${KIND_NOUN[slot.kind]} slots are used`
                : undefined,
            badge: (
              <Badge className="ml-0.5 px-1.5 py-0 text-[10px]">
                {slot.total - slot.used} left
              </Badge>
            ),
          }))}
        />
      )}
      <Separator />
      <IconButton
        icon={mdiUndo}
        label="Undo"
        shortcut="Ctrl+Z"
        tooltipSide="bottom"
        disabled={!editor.canUndo}
        onClick={editor.undo}
      />
      <IconButton
        icon={mdiRedo}
        label="Redo"
        shortcut="Shift+Ctrl+Z"
        tooltipSide="bottom"
        disabled={!editor.canRedo}
        onClick={editor.redo}
      />
      <IconButton
        icon={mdiMagnet}
        label="Snap"
        tooltip={`Snap to ${(snapMm || lastSnap.current) / 10} cm (Alt to bypass)`}
        tooltipSide="bottom"
        pressed={snapMm > 0 && !altHeld}
        onClick={() => setSnapMm(snapMm > 0 ? 0 : lastSnap.current)}
      />
      <LayersControl display={display} />
    </>
  );

  const saveButton = (
    <Button
      size="sm"
      variant="primary"
      busy={editor.saving}
      disabled={editor.dirtyCount === 0}
      onClick={save}
    >
      Save zones
    </Button>
  );

  return (
    <>
      <RoomBody
        canvasRef={canvasBox}
        dimmed={frame.offline}
        toolbar={toolbar}
        toolbarEnd={
          <>
            <SaveState
              dirtyCount={editor.dirtyCount}
              onSave={save}
              busy={editor.saving}
              lastError={editor.lastError}
              saveLabel="Save zones"
              className="shrink-0 whitespace-nowrap max-md:hidden"
            />
            <IconButton
              icon={mdiKeyboardOutline}
              label="Keyboard shortcuts"
              shortcut="?"
              tooltipSide="bottom"
              className="max-md:hidden"
              onClick={onShowShortcuts}
            />
          </>
        }
        canvas={
          <ZoneCanvas
            zones={editor.polygonMode ? [] : editor.rectZones}
            onZonesChange={(next) => editor.setZones(next, 'canvas')}
            polygonZones={editor.polygonZones}
            onPolygonZonesChange={(next) => editor.setZones(next, 'canvas')}
            polygonMode={editor.polygonMode}
            polygonLateralOnlyAxis={
              editor.isCeiling ? editor.ceilingConfig.axis : undefined
            }
            selectedId={selectedId}
            onSelect={(id) => select(id ? { kind: 'zone', id } : NO_SELECTION)}
            selectedVertex={vertex}
            onVertexSelect={editor.isCeiling ? undefined : setVertex}
            onVertexDelete={
              editor.isCeiling
                ? undefined
                : (id, index) => {
                    if (editor.removeVertex(id, index)) setVertex(null);
                  }
            }
            tool={activeTool}
            drawKind={kind}
            onToolChange={setTool}
            onDraftChange={setDrawDraft}
            onCommitZone={commitZone}
            snapBypass={altHeld}
            onDeleteSelected={deleteSelected}
            displayUnits={units}
            rangeMm={LIVE_RANGE_MM}
            snapGridMm={snapMm}
            height="100%"
            zoom={viewport.zoom}
            panOffsetMm={viewport.panOffsetMm}
            onPanChange={frame.setPan}
            onZoomChange={setZoom}
            touchPanEnabled={!dragging}
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
                ? (editor.heightCoverage ?? undefined)
                : undefined
            }
            showRadar={display.showDeviceRadar && !editor.isCeiling}
            clipRadarToWalls={display.clipRadarToWalls}
            furniture={room.furniture ?? []}
            doors={room.doors ?? []}
            showWalls={display.showWalls}
            showFurniture={display.showFurniture}
            showDoors={display.showDoors}
            showZones={display.showZones}
            showZoneLabels={display.showZoneLabels}
            zoneLabelScale={display.zoneLabelScale}
            showDevice={display.showDeviceIcon}
            deviceMarkerStyle={display.deviceMarkerStyle}
            deviceMarkerScale={display.deviceMarkerScale}
            deviceMarkerOpacity={display.deviceMarkerOpacity}
            onDragStateChange={(next) => {
              setDragging(next);
              if (!next && editor.isCeiling) void editor.persistCeiling();
            }}
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
              {editor.needsResync && (
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
            {cursor && (
              <output className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg bg-surface/80 px-2 py-1.5 text-xs tabular-nums text-fg-muted max-md:hidden [@media(pointer:coarse)]:hidden">
                X {(cursor.x / 1000).toFixed(2)} m, Y{' '}
                {(cursor.y / 1000).toFixed(2)} m
              </output>
            )}
            <ZoomCluster
              zoom={viewport.zoom}
              onZoom={setZoom}
              onFit={frame.fit}
            />
          </>
        }
        inspector={
          <Inspector
            {...header}
            onBack={
              selection.kind === 'none' && activeTool === 'select'
                ? undefined
                : () => {
                    setTool('select');
                    select(NO_SELECTION);
                  }
            }
            snap={sheetSnap}
            onSnapChange={setSheetSnap}
            peekAction={saveButton}
          >
            {body()}
          </Inspector>
        }
      />
      {room.deviceId && (
        <ZoneBackupsSheet
          open={backupsOpen}
          onClose={() => setBackupsOpen(false)}
          deviceId={room.deviceId}
          deviceName={room.name}
          editor={editor}
        />
      )}
    </>
  );
};
