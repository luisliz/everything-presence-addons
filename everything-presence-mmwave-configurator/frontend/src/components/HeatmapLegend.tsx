interface HeatmapLegendProps {
  visible: boolean;
}

export const HeatmapLegend = ({ visible }: HeatmapLegendProps) => {
  if (!visible) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2 py-1.5">
      <span className="text-[10px] text-fg-muted">Low</span>
      <div className="h-2 w-20 rounded-full bg-gradient-to-r from-success via-warning to-danger" />
      <span className="text-[10px] text-fg-muted">High</span>
    </div>
  );
};
