interface Segment {
  value: number;
  color: string;
  label: string;
}

interface DonutChartProps {
  segments: Segment[];
  centerLabel: string;
  centerSub: string;
  size?: number;
  strokeWidth?: number;
}

export default function DonutChart({
  segments,
  centerLabel,
  centerSub,
  size = 200,
  strokeWidth = 28,
}: DonutChartProps) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;

  let cumulativeAngle = -90;

  return (
    <div className="relative flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments.map((seg, i) => {
          const pct = seg.value / total;
          const dashLen = pct * circumference;
          const gapLen = circumference - dashLen;
          const angle = cumulativeAngle;
          cumulativeAngle += pct * 360;

          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLen} ${gapLen}`}
              strokeDashoffset={0}
              transform={`rotate(${angle} ${cx} ${cy})`}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <span className="text-xl font-bold text-gray-800">{centerLabel}</span>
        <span className="text-xs text-gray-500 mt-0.5">{centerSub}</span>
      </div>
    </div>
  );
}
