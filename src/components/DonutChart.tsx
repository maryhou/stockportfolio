import { useState } from 'react';

interface Segment {
  value: number;
  color: string;
  label: string;
  /** 選用：點擊該區塊時，中心顯示的額外明細列 */
  rows?: { label: string; value: string }[];
}

interface DonutChartProps {
  segments: Segment[];
  centerLabel: string;
  centerSub: string;
  centerSub2?: string;
  centerOffsetY?: number;
  size?: number;
  strokeWidth?: number;
  /** 開啟後可點擊區塊，於中心顯示該區塊明細 */
  interactive?: boolean;
  /** 受控模式：由外部提供選取索引（例如與圖例共用狀態）。未提供時 DonutChart 自行管理 */
  activeIndex?: number | null;
  onActiveChange?: (index: number | null) => void;
}

export default function DonutChart({
  segments,
  centerLabel,
  centerSub,
  centerSub2,
  centerOffsetY = 0,
  size = 200,
  strokeWidth = 28,
  interactive = false,
  activeIndex: controlledActive,
  onActiveChange,
}: DonutChartProps) {
  const [internalActive, setInternalActive] = useState<number | null>(null);
  const isControlled = controlledActive !== undefined;
  const activeIndex = isControlled ? controlledActive : internalActive;
  const setActiveIndex = (index: number | null) => {
    if (onActiveChange) onActiveChange(index);
    if (!isControlled) setInternalActive(index);
  };

  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;

  const active = activeIndex !== null && activeIndex < segments.length ? segments[activeIndex] : null;

  let cumulativeAngle = -90;

  return (
    <div
      className="relative flex items-center justify-center"
      onClick={() => interactive && setActiveIndex(null)}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments.map((seg, i) => {
          const pct = seg.value / total;
          const dashLen = pct * circumference;
          const gapLen = circumference - dashLen;
          const angle = cumulativeAngle;
          cumulativeAngle += pct * 360;
          const dimmed = activeIndex !== null && activeIndex !== i;

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
              opacity={dimmed ? 0.25 : 1}
              className={interactive ? 'cursor-pointer' : undefined}
              style={{ transition: 'opacity 0.2s ease' }}
              onClick={interactive ? (e) => {
                e.stopPropagation();
                setActiveIndex(activeIndex === i ? null : i);
              } : undefined}
            />
          );
        })}
      </svg>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center text-center px-3 pointer-events-none"
        style={!active && centerOffsetY ? { paddingTop: centerOffsetY } : undefined}
      >
        {active ? (
          <>
            <span className="text-sm font-bold text-gray-800 leading-tight">{active.label}</span>
            <span className="text-2xl font-bold leading-tight tabular-nums" style={{ color: active.color }}>
              {((active.value / total) * 100).toFixed(1)}%
            </span>
            {active.rows?.map((row, i) => (
              <span key={row.label} className={`text-[11px] text-gray-500 leading-tight whitespace-nowrap ${i === 0 ? 'mt-1' : ''}`}>
                {row.label} <span className="font-semibold text-gray-700 tabular-nums">{row.value}</span>
              </span>
            ))}
          </>
        ) : (
          <>
            <span className="text-xl font-bold text-gray-800 leading-tight">{centerLabel}</span>
            <span className="text-xs font-medium text-gray-600 mt-1">{centerSub}</span>
            {centerSub2 && <span className="text-[10px] text-gray-400 mt-0.5">{centerSub2}</span>}
          </>
        )}
      </div>
    </div>
  );
}
