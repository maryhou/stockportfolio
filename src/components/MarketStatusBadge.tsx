import { getMarketStatus } from '../utils/marketStatus';

/**
 * Small freshness hint shown next to prices:
 *   盤中  → prices are live (real-time / bid-ask midpoint)
 *   已收盤 → prices are the latest close
 *
 * `tone="onDark"` styles it for coloured/gradient backgrounds (e.g. the Home
 * hero card); default suits light cards. Recomputed on each render — the 15 s
 * price poller re-renders often enough to flip it around the 09:00 / 13:30 edges.
 */
export default function MarketStatusBadge({ tone = 'light' }: { tone?: 'light' | 'onDark' }) {
  const open = getMarketStatus() === 'open';
  const base = 'inline-flex items-center gap-1 text-[0.625rem] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap';
  const dot = <span className={`w-1.5 h-1.5 rounded-full ${open ? 'bg-emerald-400' : tone === 'onDark' ? 'bg-white/50' : 'bg-gray-300'}`} />;
  const label = open ? '盤中·即時' : '已收盤·收盤價';

  if (tone === 'onDark') {
    return <span className={`${base} bg-white/15 text-white/90`}>{dot}{label}</span>;
  }
  return (
    <span className={`${base} ${open ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
      {dot}{label}
    </span>
  );
}
