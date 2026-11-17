import {
  mdiAccessPoint,
  mdiAngleAcute,
  mdiCheck,
  mdiChevronDown,
  mdiCursorDefaultOutline,
  mdiDeleteSweepOutline,
  mdiDoor,
  mdiDotsVertical,
  mdiFloorPlan,
  mdiKeyboardOutline,
  mdiLockOpenVariantOutline,
  mdiLockOutline,
  mdiRedo,
  mdiRotateLeftVariant,
  mdiRotateRightVariant,
  mdiShapeOutline,
  mdiSofaOutline,
  mdiSwapVertical,
  mdiUndo,
  mdiVectorLine,
  mdiVectorPolyline,
} from '@mdi/js';
import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { RoomConfig } from '../../../api/types';
import { BasicRoomShapesPicker } from '../../../components/BasicRoomShapesPicker';
import { furnitureLabel } from '../../../components/FurnitureEditor';
import { FurnitureLibrary } from '../../../components/FurnitureLibrary';
import {
  Button,
  ConfirmDialog,
  IconButton,
  Kbd,
  Menu,
  Note,
  Panel,
  Popover,
  SaveState,
  Segmented,
  Sheet,
  type SheetSnap,
  useToast,
} from '../../../components/primitives';
import { RoomCanvas } from '../../../components/RoomCanvas';
import { useAppData } from '../../../contexts/AppDataContext';
import { useDisplaySettings } from '../../../hooks/useDisplaySettings';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { useLeaveGuard } from '../../../router';
import {
  resolveCanvasCoverage,
  resolveCoverageFov,
} from '../../../utils/coverage';
import { getDeviceIconUrl } from '../../../utils/deviceIcon';
import { coverageBounds, fitViewport } from '../../../utils/fitViewport';
import { formatLengthLabel } from '../../../utils/lengthLabels';
import {
  areAllItemsLocked,
  areAllSegmentsLocked,
  isDevicePositionLocked,
} from '../../../utils/lockState';
import {
  describeRotationScope,
  ROTATION_STEP_DEG,
} from '../../../utils/roomRotation';
import { LayersControl } from '../DisplayLayers';
import { Inspector } from '../Inspector';
import { PreviewChip } from '../PreviewChip';
import { RoomBody } from '../RoomBody';
import { NO_SELECTION, type RoomFrame, type Selection } from '../types';
import { clampZoom, ZOOM_STEP, ZoomCluster } from '../ZoomCluster';
import { DevicePanel } from './DevicePanel';
import { DoorPanel } from './DoorPanel';
import { FurniturePanel } from './FurniturePanel';
import { heightCoverageFor, LayoutOverlay } from './LayoutOverlay';
import {
  LAYOUT_POSITION_ID,
  LayoutRoomPanel,
  lockedObjectCount,
} from './LayoutRoomPanel';
import type { Units } from './units';
import { type LayoutTool, useLayoutEditor } from './useLayoutEditor';
import { useLayoutKeys } from './useLayoutKeys';
import { WallPanel } from './WallPanel';

type Point = { x: number; y: number };

export const LAYOUT_RANGE_MM = 15000;
const LAYOUT_KINDS = new Set<Selection['kind']>(['wall', 'door', 'furniture']);

const Separator = () => (
  <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-line" />
);

const KeyRow = ({
  keys,
  children,
}: {
  keys: string[];
  children: ReactNode;
}) => (
  <li className="flex items-center gap-2 py-1 text-sm text-fg">
    <span className="flex shrink-0 gap-1">
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </span>
    {children}
  </li>
);

/** A popover on wide screens, a bottom sheet on phones. */
const Flyout = ({
  wide,
  trigger,
  title,
  children,
}: {
  wide: boolean;
  trigger: ReactElement;
  title: string;
  children: (close: () => void) => ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  if (wide)
    return (
      <Popover trigger={trigger} label={title}>
        {children}
      </Popover>
    );
  const close = () => setOpen(false);
  return (
    <>
      <span className="inline-flex" onClickCapture={() => setOpen(true)}>
        {trigger}
      </span>
      <Sheet open={open} onClose={close} title={title}>
        {children(close)}
      </Sheet>
    </>
  );
};

export interface LayoutModeProps {
  frame: RoomFrame;
  onWizardProgress: (progress: {
    outlineDone?: boolean;
    placementDone?: boolean;
  }) => void;
  onShowShortcuts: () => void;
}

export const LayoutMode = ({
  frame,
  onWizardProgress,
  onShowShortcuts,
}: LayoutModeProps) => {
  const { profile, viewport, selection, sensorConfig, setViewport, setZoom } =
    frame;
  const toast = useToast();
  const { updateRoom: storeRoom } = useAppData();
  const display = useDisplaySettings();
  const units = display.units as Units;
  const wide = useMediaQuery('(min-width: 768px)', true);
  const toolLabels = useMediaQuery('(min-width: 1800px)', false);
  const [snap, setSnap] = useState<SheetSnap>('peek');
  const [container, setContainer] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [hoveredWall, setHoveredWall] = useState<number | null>(null);
  const canvasBox = useRef<HTMLDivElement>(null);

  const frameSelect = frame.select;
  const select = useCallback(
    (next: Selection) => {
      frameSelect(next);
      if (next.kind !== 'none') setSnap((s) => (s === 'peek' ? 'half' : s));
    },
    [frameSelect],
  );

  const fitTo = useCallback(
    (room: RoomConfig) => {
      const placement = room.devicePlacement;
      const furniture = (room.furniture ?? []).flatMap((f) => {
        const r = Math.max(f.width, f.depth) / 2;
        return [
          { x: f.x - r, y: f.y - r },
          { x: f.x + r, y: f.y + r },
        ];
      });
      setViewport(
        fitViewport(
          coverageBounds({
            room: room.roomShell?.points ?? [],
            device: placement,
            coverage: placement
              ? resolveCanvasCoverage(profile, placement, sensorConfig)
              : null,
            points: furniture,
          }),
          container,
          { rangeMm: LAYOUT_RANGE_MM },
        ),
      );
    },
    [container, profile, sensorConfig, setViewport],
  );

  const notify = useCallback(
    (message: string) => toast.show(message, { tone: 'warning' }),
    [toast],
  );
  const onSaved = useCallback(
    (room: RoomConfig) => {
      storeRoom(room);
      onWizardProgress({ outlineDone: true, placementDone: true });
      toast.show('Layout saved', { tone: 'success' });
    },
    [onWizardProgress, storeRoom, toast],
  );

  const editor = useLayoutEditor({
    room: frame.room,
    selection,
    select,
    fitTo,
    notify,
    onSaved,
  });
  const { room, tool, drawing } = editor;
  const points = room.roomShell?.points ?? [];
  const placement = room.devicePlacement;
  const dirty = editor.dirtyCount > 0;

  useLeaveGuard(
    dirty,
    'This room has layout changes that are not saved yet. Save them, or discard them and keep the last saved layout.',
    { title: 'Unsaved layout', onSave: editor.save, onDiscard: editor.discard },
  );
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  useEffect(
    () => () => {
      if (LAYOUT_KINDS.has(selectionRef.current.kind))
        frameSelect(NO_SELECTION);
    },
    [frameSelect],
  );

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
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, [setZoom]);

  const { onContainerSize } = frame;
  const containerChange = useCallback(
    (size: { width: number; height: number }) => {
      setContainer(size);
      onContainerSize(size);
    },
    [onContainerSize],
  );

  const fit = useCallback(() => fitTo(editor.room), [editor.room, fitTo]);
  const canRotate = points.length > 0;
  useLayoutKeys({
    tool,
    setTool: editor.setTool,
    finishWalls: editor.finishWalls,
    deleteTarget: editor.deleteKeyTarget,
    deleteSelection: editor.deleteSelection,
    undo: editor.undo,
    redo: editor.redo,
    rotate: (angle) => editor.rotate(angle),
    canRotate,
    save: () => {
      if (dirty && !editor.saving) void editor.save();
    },
    fit,
    zoomBy: (delta) => setZoom(clampZoom(viewport.zoom + delta * ZOOM_STEP)),
    escape: () => {
      if (tool !== 'select') editor.setTool('select');
      else select(NO_SELECTION);
    },
  });

  const wallIndex =
    selection.kind === 'wall' && selection.index < points.length
      ? selection.index
      : null;
  const door =
    selection.kind === 'door'
      ? room.doors?.find((d) => d.id === selection.id)
      : undefined;
  const furniture =
    selection.kind === 'furniture'
      ? room.furniture?.find((f) => f.id === selection.id)
      : undefined;
  const deviceSelected = selection.kind === 'device';

  const deviceIconUrl = useMemo(
    () => getDeviceIconUrl(profile, placement),
    [profile, placement],
  );
  const heightCoverage = useMemo(
    () =>
      display.showDeviceRadar
        ? heightCoverageFor(placement, resolveCoverageFov(profile, placement))
        : undefined,
    [display.showDeviceRadar, placement, profile],
  );
  const caps = profile?.capabilities as
    | { tracking?: boolean; distanceOnlyTracking?: boolean }
    | undefined;
  const layers = {
    display,
    features: {
      triggerRing: caps?.distanceOnlyTracking === true,
      alignedDirection: Boolean(caps?.tracking && !caps.distanceOnlyTracking),
    },
  };

  const allFurnitureLocked = areAllItemsLocked(room.furniture);
  const allDoorsLocked = areAllItemsLocked(room.doors);
  const allWallsLocked = areAllSegmentsLocked(room.roomShell);
  const devicePositionLocked = isDevicePositionLocked(placement);

  const toolOptions: Array<{
    value: LayoutTool;
    label: string;
    icon: string;
    disabled?: boolean;
    tooltip?: string;
  }> = [
    {
      value: 'select',
      label: 'Select',
      icon: mdiCursorDefaultOutline,
      tooltip: 'Select (V)',
    },
    {
      value: 'walls',
      label: 'Walls',
      icon: mdiVectorPolyline,
      tooltip: 'Draw walls (A)',
    },
    {
      value: 'door',
      label: 'Door',
      icon: mdiDoor,
      disabled: points.length < 3,
      tooltip:
        points.length < 3
          ? 'Draw the walls first'
          : 'Place a door on a wall (D)',
    },
    {
      value: 'furniture',
      label: 'Furniture',
      icon: mdiSofaOutline,
      tooltip: 'Add furniture',
    },
  ];

  const toolbar = (
    <>
      <Segmented
        ariaLabel="Tool"
        value={tool}
        onChange={editor.setTool}
        options={toolOptions}
        iconOnly={!toolLabels}
        size={toolLabels ? 'sm' : 'md'}
        className="shrink-0"
      />
      <Flyout
        wide={wide}
        title="Start from a shape"
        trigger={
          <IconButton
            icon={mdiShapeOutline}
            label="Start from a shape"
            tooltipSide="bottom"
          />
        }
      >
        {(close) => (
          <BasicRoomShapesPicker
            compact
            units={units}
            onApply={(shapePoints, shape) => {
              close();
              editor.requestShape(shapePoints, shape);
            }}
            onDrawOwn={() => {
              close();
              editor.setTool('walls');
            }}
          />
        )}
      </Flyout>
      {tool === 'walls' && (
        <Button
          size="sm"
          variant="primary"
          icon={mdiCheck}
          disabled={points.length < 2}
          onClick={editor.finishWalls}
        >
          Finish
        </Button>
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
      <Separator />
      <IconButton
        icon={mdiRotateLeftVariant}
        label="Rotate 90° left"
        shortcut="Shift+R"
        tooltipSide="bottom"
        disabled={!canRotate}
        onClick={() => editor.rotate(-ROTATION_STEP_DEG)}
      />
      <IconButton
        icon={mdiRotateRightVariant}
        label="Rotate 90° right"
        shortcut="R"
        tooltipSide="bottom"
        disabled={!canRotate}
        onClick={() => editor.rotate(ROTATION_STEP_DEG)}
      />
      <Menu
        label="Rotation"
        align="start"
        trigger={
          <IconButton
            icon={mdiChevronDown}
            label="Rotation options"
            size="sm"
            tooltipSide="bottom"
          />
        }
        items={[
          ...(['layout', 'roomOnly'] as const).map((scope) => ({
            label: describeRotationScope(scope),
            checked: editor.rotationScope === scope,
            onSelect: () => editor.setRotationScope(scope),
          })),
          {
            label: 'Turn end to end',
            icon: mdiSwapVertical,
            disabled: !canRotate,
            onSelect: () => editor.rotate(180),
          },
          {
            label: 'Custom angle…',
            icon: mdiAngleAcute,
            onSelect: () => {
              select(NO_SELECTION);
              editor.setTool('select');
              setSnap('full');
              requestAnimationFrame(() =>
                document
                  .getElementById(LAYOUT_POSITION_ID)
                  ?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
              );
            },
          },
        ]}
      />
      <Menu
        label="Locks"
        align="start"
        trigger={
          <IconButton
            icon={
              lockedObjectCount(room) > 0
                ? mdiLockOutline
                : mdiLockOpenVariantOutline
            }
            label="Locks"
            tooltipSide="bottom"
          />
        }
        items={[
          {
            label: 'Lock walls',
            checked: allWallsLocked,
            disabled: !points.length,
            onSelect: () => editor.setShellLock(!allWallsLocked),
          },
          {
            label: 'Lock device position',
            checked: devicePositionLocked,
            onSelect: () =>
              editor.updatePlacement({ locked: !devicePositionLocked }),
          },
          {
            label: 'Lock all furniture',
            checked: allFurnitureLocked,
            disabled: !room.furniture?.length,
            onSelect: () => editor.lockAll('furniture', !allFurnitureLocked),
          },
          {
            label: 'Lock all doors',
            checked: allDoorsLocked,
            disabled: !room.doors?.length,
            onSelect: () => editor.lockAll('doors', !allDoorsLocked),
          },
        ]}
      />
      <LayersControl {...layers} />
      <Menu
        label="More"
        align="start"
        trigger={
          <IconButton
            icon={mdiDotsVertical}
            label="More"
            tooltipSide="bottom"
          />
        }
        items={[
          {
            label: 'Clear walls',
            icon: mdiDeleteSweepOutline,
            danger: true,
            disabled: !points.length,
            onSelect: editor.requestClear,
          },
          {
            label: 'Keyboard shortcuts',
            icon: mdiKeyboardOutline,
            onSelect: onShowShortcuts,
          },
        ]}
      />
    </>
  );

  const saveButton = (
    <Button
      size="sm"
      variant="primary"
      busy={editor.saving}
      disabled={!dirty}
      onClick={() => void editor.save()}
    >
      Save layout
    </Button>
  );

  const header = (() => {
    if (wallIndex !== null)
      return { title: `Wall ${wallIndex + 1}`, icon: mdiVectorLine };
    if (door) return { title: 'Door', icon: mdiDoor };
    if (furniture)
      return { title: furnitureLabel(furniture), icon: mdiSofaOutline };
    if (deviceSelected)
      return { title: profile?.label ?? 'Device', icon: mdiAccessPoint };
    if (tool === 'walls')
      return { title: 'Drawing walls', icon: mdiVectorPolyline };
    if (tool === 'door') return { title: 'Place a door', icon: mdiDoor };
    return { title: room.name, icon: mdiFloorPlan };
  })();

  const body = (() => {
    if (wallIndex !== null)
      return <WallPanel editor={editor} index={wallIndex} units={units} />;
    if (door) return <DoorPanel editor={editor} door={door} />;
    if (furniture)
      return <FurniturePanel editor={editor} furniture={furniture} />;
    if (deviceSelected)
      return <DevicePanel frame={frame} editor={editor} units={units} />;
    if (tool === 'walls')
      return (
        <Panel variant="section" title="Walls">
          <ul className="space-y-0.5">
            <KeyRow keys={['Click']}>Place a corner</KeyRow>
            <KeyRow keys={['Enter']}>Finish, or click the first corner</KeyRow>
            <KeyRow keys={['Backspace']}>Remove the last corner</KeyRow>
            <KeyRow keys={['Esc']}>Stop drawing</KeyRow>
          </ul>
          <p className="mt-3 text-sm tabular-nums text-fg-muted">
            {points.length} {points.length === 1 ? 'corner' : 'corners'}
          </p>
        </Panel>
      );
    if (tool === 'door')
      return (
        <Panel variant="section" title="Door">
          <p className="text-sm text-fg-muted">
            Click a wall to place a door there.
          </p>
          <Button
            size="sm"
            className="mt-3"
            onClick={() => editor.setTool('select')}
          >
            Cancel
          </Button>
        </Panel>
      );
    return (
      <LayoutRoomPanel
        editor={editor}
        units={units}
        setUnits={display.setUnits}
        layers={layers}
      />
    );
  })();

  const spin = editor.spin;
  const canvas = (
    <div
      className={
        spin
          ? 'room-rotate-spin pointer-events-none h-full w-full'
          : 'h-full w-full'
      }
      style={
        spin
          ? ({ '--room-rotate-from': `${spin.fromDeg}deg` } as CSSProperties)
          : undefined
      }
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) editor.endSpin();
      }}
    >
      <RoomCanvas
        points={points}
        onChange={(next) =>
          editor.changePoints(next, { coalesceKey: 'points:vertex-drag' })
        }
        onCanvasClick={editor.canvas.click}
        onCanvasMove={(pt) => {
          setCursor(pt);
          editor.canvas.move(pt);
        }}
        onCanvasRelease={editor.canvas.release}
        lockShell={Boolean(editor.activeShape)}
        lockedSegments={editor.lockedWalls}
        showLockIndicators
        showAllWallLengthLabels={Boolean(editor.activeShape)}
        onWallLengthChange={
          editor.activeShape ? editor.resizeShapeWall : undefined
        }
        rangeMm={LAYOUT_RANGE_MM}
        gridSpacingMm={1000}
        snapGridMm={editor.snapGridMm}
        zoom={viewport.zoom}
        panOffsetMm={viewport.panOffsetMm}
        onPanChange={frame.setPan}
        onZoomChange={setZoom}
        touchPanEnabled={tool === 'select'}
        displayUnits={units}
        devicePlacement={placement ?? { x: 0, y: 0, rotationDeg: 0 }}
        onDeviceChange={editor.updatePlacement}
        onDeviceClick={() => {
          editor.setTool('select');
          select({ kind: 'device' });
        }}
        profile={profile}
        sensorConfig={sensorConfig}
        onContainerSizeChange={containerChange}
        deviceIconUrl={deviceIconUrl}
        clipRadarToWalls={display.clipRadarToWalls}
        heightCoverage={heightCoverage}
        showRadar={
          display.showDeviceRadar && placement?.mountType !== 'ceiling'
        }
        previewFrom={drawing.pendingStart}
        previewTo={drawing.pendingStart ? drawing.previewPoint : null}
        hoveredSegment={hoveredWall}
        onSegmentHover={setHoveredWall}
        selectedSegment={wallIndex}
        onSegmentSelect={
          tool === 'select'
            ? (index) =>
                select(index === null ? NO_SELECTION : { kind: 'wall', index })
            : undefined
        }
        onSegmentDragStart={
          tool === 'select' ? editor.canvas.segmentDragStart : undefined
        }
        onEndpointDragStart={editor.canvas.endpointDragStart}
        onSegmentInsert={tool === 'select' ? editor.splitWall : undefined}
        height="100%"
        furniture={room.furniture ?? []}
        selectedFurnitureId={furniture?.id ?? null}
        onFurnitureSelect={(id) =>
          select(id ? { kind: 'furniture', id } : NO_SELECTION)
        }
        onFurnitureChange={editor.changeFurniture}
        doors={room.doors ?? []}
        selectedDoorId={door?.id ?? null}
        onDoorSelect={(id) => select(id ? { kind: 'door', id } : NO_SELECTION)}
        onDoorChange={editor.changeDoor}
        isDoorPlacementMode={editor.doorMode}
        onWallSegmentClick={editor.placeDoor}
        onDoorDragStart={(id) => editor.canvas.doorDragStart(id)}
        onDoorDragEnd={editor.canvas.release}
        roomShellFillMode={room.roomShellFillMode}
        floorMaterial={room.floorMaterial}
        showWalls={display.showWalls}
        showFurniture={display.showFurniture}
        showDoors={display.showDoors}
        showDevice={display.showDeviceIcon}
        deviceMarkerStyle={display.deviceMarkerStyle}
        deviceMarkerScale={display.deviceMarkerScale}
        deviceMarkerOpacity={display.deviceMarkerOpacity}
        renderOverlay={(ctx) => (
          <LayoutOverlay
            ctx={ctx}
            room={room}
            profile={profile}
            liveState={frame.liveState}
            targets={frame.targetPositions}
            showTargets={display.showTargets}
            targetScale={display.targetMarkerScale}
            heightCoverage={heightCoverage}
            deviceSelected={deviceSelected}
          />
        )}
      />
    </div>
  );

  const delta =
    drawing.pendingStart && cursor
      ? Math.hypot(
          cursor.x - drawing.pendingStart.x,
          cursor.y - drawing.pendingStart.y,
        )
      : null;
  const readout = (mm: number) =>
    units === 'metric'
      ? `${(mm / 1000).toFixed(2)} m`
      : `${(mm / 304.8).toFixed(2)} ft`;

  const overlays = (
    <>
      <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-2">
        {frame.draft.dirtyCount > 0 && (
          <PreviewChip
            count={frame.draft.dirtyCount}
            busy={frame.draft.applying}
            onApply={() => void frame.draft.apply()}
            onDiscard={frame.draft.discard}
          />
        )}
        {editor.clearedPoints?.length && !points.length ? (
          <Note
            tone="warning"
            className="max-w-sm bg-surface/95 shadow-e1"
            actions={
              <>
                <Button size="sm" onClick={editor.restoreCleared}>
                  Restore walls
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={editor.dismissCleared}
                >
                  Dismiss
                </Button>
              </>
            }
          >
            Walls cleared. Nothing is saved until you press Save layout.
          </Note>
        ) : null}
      </div>
      {!points.length && tool === 'select' && !editor.clearedPoints?.length && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-xl border border-line bg-surface/95 px-5 py-4 text-center shadow-e1">
            <p className="text-sm font-medium text-fg">No walls yet</p>
            <Button
              size="sm"
              variant="primary"
              icon={mdiVectorPolyline}
              onClick={() => editor.setTool('walls')}
            >
              Draw walls
            </Button>
          </div>
        </div>
      )}
      {cursor && (
        <output className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg bg-surface/80 px-2 py-1.5 text-xs tabular-nums text-fg-muted max-md:hidden [@media(pointer:coarse)]:hidden">
          X {readout(cursor.x)}, Y {readout(cursor.y)}
          {delta !== null && ` · wall ${formatLengthLabel(delta, units)}`}
        </output>
      )}
      <ZoomCluster zoom={viewport.zoom} onZoom={setZoom} onFit={fit} />
    </>
  );

  return (
    <>
      <RoomBody
        canvasRef={canvasBox}
        toolbar={toolbar}
        toolbarEnd={
          <SaveState
            dirtyCount={editor.dirtyCount}
            onSave={() => void editor.save()}
            busy={editor.saving}
            lastError={editor.saveError}
            saveLabel="Save layout"
            className="shrink-0 whitespace-nowrap pl-2 max-md:hidden"
          />
        }
        canvas={canvas}
        overlays={overlays}
        inspector={
          <Inspector
            {...header}
            onBack={
              selection.kind === 'none' ? undefined : () => select(NO_SELECTION)
            }
            snap={snap}
            onSnapChange={setSnap}
            peekAction={saveButton}
          >
            {body}
          </Inspector>
        }
      />
      {editor.libraryOpen && (
        <FurnitureLibrary
          onSelect={editor.addFurniture}
          onClose={() => editor.setTool('select')}
        />
      )}
      <ConfirmDialog
        open={editor.clearConfirmOpen}
        title="Delete all walls?"
        body={`This removes the outline of ${room.name}. Undo brings it back while you stay on this screen; after a reload only the saved layout can.`}
        confirmLabel="Delete walls"
        tone="danger"
        onConfirm={editor.confirmClear}
        onCancel={editor.cancelClear}
      />
      <ConfirmDialog
        open={editor.pendingShape !== null}
        title="Replace the walls?"
        body="Manual wall changes and the doors on those walls are removed."
        confirmLabel="Replace walls"
        tone="danger"
        onConfirm={() =>
          editor.pendingShape &&
          editor.applyShape(
            editor.pendingShape.points,
            editor.pendingShape.selection,
          )
        }
        onCancel={editor.cancelShape}
      />
    </>
  );
};
