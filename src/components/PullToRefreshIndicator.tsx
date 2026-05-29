import type { PTRState } from '../hooks/usePullToRefresh';

const RADIUS = 11;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function fmt(d: Date) {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export default function PullToRefreshIndicator({ state }: { state: PTRState }) {
  const { pullY, status, progress, lastUpdated, errorMsg } = state;

  // Height: follows finger while pulling; holds at 56px during refresh/result; 0 when idle
  const held = status === 'refreshing' || status === 'success' || status === 'error';
  const displayH = held ? 56 : pullY;

  // Animate height only when NOT actively dragging (smooth snap-back / snap-forward)
  const animated = status !== 'pulling';

  const visible = displayH > 0;

  return (
    <div
      aria-hidden="true"
      style={{
        height: `${displayH}px`,
        transition: animated ? 'height 0.28s cubic-bezier(0.25,0.46,0.45,0.94)' : 'none',
        overflow: 'hidden',
        flexShrink: 0,
      }}
      className="flex items-center justify-center bg-gray-50/80"
    >
      {visible && (
        <div className="flex items-center gap-2">
          {/* ── Pulling: arc progress ── */}
          {status === 'pulling' && (
            <svg
              width="28" height="28" viewBox="0 0 28 28"
              style={{ transform: 'rotate(-90deg)' }}
            >
              <circle cx="14" cy="14" r={RADIUS} fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
              <circle
                cx="14" cy="14" r={RADIUS}
                fill="none" stroke="#6C63FF" strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
                style={{ transition: 'stroke-dashoffset 0.05s linear' }}
              />
            </svg>
          )}

          {/* ── Refreshing: spinner ── */}
          {status === 'refreshing' && (
            <div className="w-6 h-6 rounded-full border-2 border-violet-200 border-t-violet-600 animate-spin" />
          )}

          {/* ── Success ── */}
          {status === 'success' && (
            <>
              <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="#10b981" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="text-xs text-gray-400">
                已更新{lastUpdated && ` · ${fmt(lastUpdated)}`}
              </span>
            </>
          )}

          {/* ── Error ── */}
          {status === 'error' && (
            <>
              <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M2.5 2.5l6 6M8.5 2.5l-6 6" stroke="#ef4444" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>
              <span className="text-xs text-red-400">{errorMsg}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
