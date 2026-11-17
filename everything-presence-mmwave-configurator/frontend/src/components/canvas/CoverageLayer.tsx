import type React from 'react';
import { useId } from 'react';
import { canvasLayerProps } from '../../utils/canvasLayers';
import {
  type CanvasCoverage,
  conePolygon,
  coverageHeadingRad,
} from '../../utils/coverage';

type Point = { x: number; y: number };

interface CoverageLayerProps {
  interactive: boolean;
  toCanvasCoord: (p: Point) => Point;
  device: Point;
  coverage: CanvasCoverage;
  roomPoints: Point[];
  clipToWalls: boolean;
  showRadar: boolean;
  heightCoveragePath: string | null;
  pxToSvg: number;
  marker: {
    show: boolean;
    style: 'icon' | 'node';
    size: number;
    opacity: number;
    iconUrl?: string;
    iconRotationDeg: number;
    cursor?: string;
  };
  onMarkerPointerDown?: (e: React.PointerEvent<SVGElement>) => void;
  onMarkerPointerUp?: (e: React.PointerEvent<SVGElement>) => void;
  children?: React.ReactNode;
}

const toPath = (points: Point[]) =>
  `${points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')} Z`;

// Presentation attributes are fallbacks; the cv-* classes win once the tokens exist.
const areaProps = {
  className: 'fill-cv-cover/10 stroke-cv-ring/70',
  fill: 'rgb(110 231 183 / 0.1)',
  stroke: 'rgb(110 231 183 / 0.7)',
  strokeWidth: 1.5,
  vectorEffect: 'non-scaling-stroke',
  style: { pointerEvents: 'none' },
} as const;

export const CoverageLayer: React.FC<CoverageLayerProps> = ({
  interactive,
  toCanvasCoord,
  device,
  coverage,
  roomPoints,
  clipToWalls,
  showRadar,
  heightCoveragePath,
  pxToSvg,
  marker,
  onMarkerPointerDown,
  onMarkerPointerUp,
  children,
}) => {
  const uid = useId().replace(/:/g, '');
  const hatchId = `cov-hatch-${uid}`;
  const maskId = `cov-outside-${uid}`;
  const hasOutline = roomPoints.length >= 3;
  const clip = clipToWalls && hasOutline;
  const hatchOutside = !clip && hasOutline;
  const conePath = showRadar
    ? toPath(
        conePolygon(device, coverage, {
          clipTo: clip ? roomPoints : undefined,
        }).map(toCanvasCoord),
      )
    : null;
  const { x: px, y: py } = toCanvasCoord(device);
  const headingRad = coverageHeadingRad(coverage.rotationDeg);
  const hatchSize = 7 * pxToSvg;

  const renderArea = (d: string) => (
    <>
      <path d={d} {...areaProps} />
      {hatchOutside && (
        <path
          d={d}
          fill={`url(#${hatchId})`}
          mask={`url(#${maskId})`}
          stroke="none"
          style={{ pointerEvents: 'none' }}
        />
      )}
    </>
  );

  return (
    <g
      style={interactive ? undefined : { pointerEvents: 'none' }}
      {...canvasLayerProps('device')}
    >
      {hatchOutside && (conePath || heightCoveragePath) && (
        <defs>
          <pattern
            id={hatchId}
            width={hatchSize}
            height={hatchSize}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={hatchSize}
              className="stroke-cv-ring/40"
              stroke="rgb(110 231 183 / 0.4)"
              strokeWidth={1.5 * pxToSvg}
            />
          </pattern>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x={-1e6}
            y={-1e6}
            width={2e6}
            height={2e6}
          >
            <rect x={-1e6} y={-1e6} width={2e6} height={2e6} fill="white" />
            <path d={toPath(roomPoints.map(toCanvasCoord))} fill="black" />
          </mask>
        </defs>
      )}
      {heightCoveragePath && renderArea(heightCoveragePath)}
      {conePath && renderArea(conePath)}

      {marker.show && (
        <g opacity={marker.opacity} style={{ pointerEvents: 'none' }}>
          {marker.style === 'node' ? (
            <circle
              cx={px}
              cy={py}
              r={Math.max(4, marker.size / 3)}
              fill="#38bdf880"
              stroke="#e0f2fe"
              strokeWidth={1.5}
            />
          ) : marker.iconUrl ? (
            <g
              transform={`translate(${px}, ${py}) rotate(${marker.iconRotationDeg})`}
            >
              <image
                href={marker.iconUrl}
                x={-marker.size / 2}
                y={-marker.size / 2}
                width={marker.size}
                height={marker.size}
              />
            </g>
          ) : (
            <>
              <circle
                cx={px}
                cy={py}
                r={marker.size / 3}
                fill="#3b82f6"
                stroke="#1d4ed8"
                strokeWidth={2}
              />
              <line
                x1={px}
                y1={py}
                x2={px + (Math.cos(headingRad) * marker.size) / 2}
                y2={py + (Math.sin(headingRad) * marker.size) / 2}
                stroke="#ffffff"
                strokeWidth={3}
                strokeLinecap="round"
              />
            </>
          )}
        </g>
      )}
      {interactive && marker.show && (
        <circle
          cx={px}
          cy={py}
          r={Math.max(22, marker.size / 2)}
          fill="transparent"
          onPointerDown={onMarkerPointerDown}
          onPointerUp={onMarkerPointerUp}
          style={{ cursor: marker.cursor }}
          aria-label="Device marker"
        />
      )}
      {children}
    </g>
  );
};
