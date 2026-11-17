import type React from 'react';
import { conePolygon, coverageHeadingRad } from '../utils/coverage';

interface Point {
  x: number;
  y: number;
}

interface EP1DistanceArcProps {
  distance: number | null | undefined; // Distance in meters
  devicePlacement: { x: number; y: number; rotationDeg?: number };
  /** Resolved coverage rotation (placement + installation angle); defaults to devicePlacement.rotationDeg. */
  rotationDeg?: number;
  toCanvas: (point: { x: number; y: number }) => { x: number; y: number };
  rangeMm: number;
  fieldOfViewDeg?: number;
  color?: string;
  fillOpacity?: number;
  strokeOpacity?: number;
  showLabel?: boolean;
  labelText?: string;
  showPulse?: boolean;
  roomShellPoints?: Point[];
  clipToWalls?: boolean;
}

export const EP1DistanceArc: React.FC<EP1DistanceArcProps> = ({
  distance,
  devicePlacement,
  rotationDeg,
  toCanvas,
  rangeMm,
  fieldOfViewDeg = 120,
  color = '#06b6d4',
  fillOpacity = 0.15,
  strokeOpacity = 0.6,
  showLabel = true,
  labelText,
  showPulse = false,
  roomShellPoints = [],
  clipToWalls = false,
}) => {
  // If no distance detected, don't render anything
  if (distance == null || distance <= 0) {
    return null;
  }

  // Convert distance from meters to millimeters
  const distanceMm = distance * 1000;

  const coverageRotationDeg = rotationDeg ?? devicePlacement.rotationDeg ?? 0;
  const rotationRad = coverageHeadingRad(coverageRotationDeg);
  const deviceWorld = { x: devicePlacement.x, y: devicePlacement.y };
  const arcPoints = conePolygon(
    deviceWorld,
    { fovDeg: fieldOfViewDeg, rangeMm: distanceMm, rotationDeg: coverageRotationDeg },
    { clipTo: clipToWalls ? roomShellPoints : undefined },
  );

  // Convert ALL points to canvas coordinates at once
  const arcPath = arcPoints.map(toCanvas);
  const pathData = arcPath.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  // Label position (at the center of the arc, along device direction)
  const labelWorldPos = {
    x: deviceWorld.x + (distanceMm * 0.7) * Math.cos(rotationRad),
    y: deviceWorld.y + (distanceMm * 0.7) * Math.sin(rotationRad),
  };
  const labelCanvasPos = toCanvas(labelWorldPos);

  // Pulse indicator position (at the arc edge, along device direction)
  const pulseWorldPos = {
    x: deviceWorld.x + distanceMm * Math.cos(rotationRad),
    y: deviceWorld.y + distanceMm * Math.sin(rotationRad),
  };
  const pulseCanvasPos = toCanvas(pulseWorldPos);

  const displayLabel = labelText ?? `${distance.toFixed(2)}m`;

  // Determine background color from main color (darken it)
  const getLabelBgColor = (hexColor: string) => {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    return `rgb(${Math.floor(r * 0.7)}, ${Math.floor(g * 0.7)}, ${Math.floor(b * 0.7)})`;
  };

  return (
    <g className="ep1-distance-arc">
      {/* Detection arc - filled pie slice */}
      <path
        d={pathData}
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth="2"
        strokeOpacity={strokeOpacity}
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: 'none' }}
        className="transition-all duration-300"
      />

      {/* Distance label with background */}
      {showLabel && (
        <g transform={`translate(${labelCanvasPos.x}, ${labelCanvasPos.y})`}>
          {/* Label background */}
          <rect
            x="-30"
            y="-12"
            width="60"
            height="24"
            rx="4"
            fill={getLabelBgColor(color)}
            fillOpacity="0.9"
          />
          {/* Label text */}
          <text
            x="0"
            y="0"
            textAnchor="middle"
            dominantBaseline="central"
            fill="white"
            fontSize="13"
            fontWeight="600"
            className="select-none"
          >
            {displayLabel}
          </text>
        </g>
      )}

      {/* Pulsing indicator at arc edge */}
      {showPulse && (
        <circle
          cx={pulseCanvasPos.x}
          cy={pulseCanvasPos.y}
          r="6"
          fill={color}
          fillOpacity="0.8"
        >
          <animate
            attributeName="r"
            values="4;8;4"
            dur="2s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="fill-opacity"
            values="0.8;0.3;0.8"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
      )}
    </g>
  );
};
