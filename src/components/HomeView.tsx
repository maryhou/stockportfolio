import { useEffect, useRef } from 'react';
import type { Stock, AppSettings } from '../types';
import {
  calcAvgCost,
  calcRemainingShares,
  calcTotalRealizedProfit,
  calcTotalNetProceeds,
  calcTotalInvested,
  formatNTD,
  formatNumber,
  formatPrice,
} from '../utils/calculations';
import { BellIcon, SearchIcon, TrendUpIcon, TrendDownIcon, RefreshIcon } from './icons/Icons';

interface HomeViewProps {
  stocks: Stock[];
  settings: AppSettings;
  onStockClick: (id: string) => void;
  onAddClick: () => void;
  onViewAllHoldings: () => void;
  onViewAllActivity: () => void;
  onBellClick: () => void;
  onVisibleStocksChange: (ids: Set<string>) => void;
  hasUnread: boolean;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
}

export default function HomeView({ stocks, settings, onStockClick, onViewAllHoldings, onViewAllActivity, onBellClick, onVisibleStocksChange, hasUnread, onAddClick, onRefresh, isRefreshing }: HomeViewProps) {
  const totalProfit = stocks.reduce((s, st) => s + calcTotalRealizedProfit(st.sells), 0);
  const totalProceeds = stocks.reduce((s, st) => s + calcTotalNetProceeds(st.sells), 0);
  const totalCurrentValue = stocks.reduce((acc, stock) => {
    const remaining = calcRemainingShares(stock.buys, stock.sells);
    return acc + remaining * stock.currentPrice;
  }, 0);

  const displayValue = totalCurrentValue + totalProceeds;
  const isProfitable = totalProfit >= 0;

  // ── Visibility tracking ─────────────────────────────────────────────────────
  // Observe each stock card with IntersectionObserver so the poller only
  // fetches prices for cards that are actually in the viewport.
  const containerRef = useRef<HTMLDivElement>(null);
  const visibleRef   = useRef<Set<string>>(new Set());

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.stockId;
          if (!id) continue;
          if (entry.isIntersecting) {
            if (!visibleRef.current.has(id)) { visibleRef.current.add(id); changed = true; }
          } else {
            if (visibleRef.current.has(id))  { visibleRef.current.delete(id); changed = true; }
          }
        }
        if (changed) onVisibleStocksChange(new Set(visibleRef.current));
      },
      { threshold: 0.4 }, // card must be ≥ 40 % visible in the viewport
    );

    // Observe every card button that carries data-stock-id
    container.querySelectorAll<HTMLElement>('[data-stock-id]').forEach((el) => {
      observer.observe(el);
      visibleRef.current.add(el.dataset.stockId!); // seed: treat all as visible initially
    });
    onVisibleStocksChange(new Set(visibleRef.current));

    return () => {
      observer.disconnect();
      visibleRef.current.clear();
    };
  }, [stocks, onVisibleStocksChange]);

  const allTrades = stocks.flatMap((stock) => [
    ...stock.sells.map((tx) => ({
      key: `sell-${tx.id}`,
      symbol: stock.symbol, name: stock.name, type: 'sell' as const,
      date: tx.date, shares: tx.shares, amount: tx.netProceeds, profit: tx.profit,
    })),
    ...stock.buys.map((tx) => ({
      key: `buy-${tx.id}`,
      symbol: stock.symbol, name: stock.name, type: 'buy' as const,
      date: tx.date, shares: tx.shares, amount: tx.price * tx.shares + tx.fee, profit: null,
    })),
  ]).sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key)).slice(0, 10);

  return (
    <div className="flex flex-col gap-5 px-5 pt-6 pb-32 lg:pb-10 lg:px-8 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">Hello,</p>
          <h1 className="text-2xl font-bold text-gray-800">{settings.userName}</h1>
        </div>
        <div className="flex gap-2">
          <button className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
            <SearchIcon size={18} />
          </button>
          <button onClick={onBellClick} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 relative">
            <BellIcon size={18} />
            {hasUnread && <span className="absolute top-2 right-2 w-2 h-2 bg-violet-500 rounded-full" />}
          </button>
        </div>
      </div>

      {/* Portfolio Value Card */}
      <div
        className="rounded-3xl p-6 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #a78bfa 100%)' }}
      >
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10" />
        <div className="absolute -right-4 -bottom-10 w-32 h-32 rounded-full bg-white/10" />
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm text-white/70">投資組合價值</p>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="opacity-60 hover:opacity-100 active:opacity-100 disabled:opacity-30 transition-opacity"
            aria-label="更新股價"
          >
            <RefreshIcon size={13} className={`text-white ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold tracking-tight">
              NT${formatNumber(Math.round(displayValue))}
            </p>
            <div className={`flex items-center gap-1 mt-2 text-sm font-medium ${isProfitable ? 'text-red-300' : 'text-emerald-300'}`}>
              {isProfitable ? <TrendUpIcon size={14} /> : <TrendDownIcon size={14} />}
              <span>已實現損益 {isProfitable ? '+' : ''}{formatNTD(totalProfit)}</span>
            </div>
          </div>
          <div className="text-right text-white/70 text-xs space-y-1">
            <p>可取得金額</p>
            <p className="text-white font-semibold text-sm">{formatNTD(totalProceeds)}</p>
          </div>
        </div>
      </div>

      {/* Holdings + Recent: side-by-side on desktop */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
        {/* Stock Holdings */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800">我的持股</h2>
            <button
              onClick={onViewAllHoldings}
              className="text-xs text-violet-600 font-medium hover:text-violet-800 transition-colors"
            >
              查看全部
            </button>
          </div>
          <div
            ref={containerRef}
            className={stocks.length > 2
              ? 'flex gap-3 overflow-x-auto scrollbar-hide pb-1 lg:grid lg:grid-cols-2 lg:overflow-visible'
              : 'grid grid-cols-2 gap-3'
            }
          >
            {stocks.map((stock) => (
              <StockCard key={stock.id} stock={stock} onClick={() => onStockClick(stock.id)} carousel={stocks.length > 2} />
            ))}
          </div>
        </div>

        {/* Recent Transactions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800">最近交易</h2>
            <button
              onClick={onViewAllActivity}
              className="text-xs text-violet-600 font-medium hover:text-violet-800 transition-colors"
            >
              查看全部
            </button>
          </div>
          {allTrades.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center bg-white rounded-2xl shadow-sm border border-gray-50">
              <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="1" />
                  <line x1="9" y1="12" x2="15" y2="12" />
                  <line x1="9" y1="16" x2="13" y2="16" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-700 mb-1">尚無交易紀錄</p>
              <p className="text-xs text-gray-400 mb-4">新增交易後，最近交易會顯示在這裡</p>
              <button
                onClick={onAddClick}
                className="px-5 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl active:bg-violet-700 transition-colors"
              >
                新增交易
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {allTrades.map(({ key, ...tx }, idx) => (
                <div key={key} className={idx >= 5 ? 'hidden lg:block' : undefined}>
                  <RecentItem {...tx} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StockCard({ stock, onClick, carousel = false }: { stock: Stock; onClick: () => void; carousel?: boolean }) {
  const avgCost    = calcAvgCost(stock.buys);
  const remaining  = calcRemainingShares(stock.buys, stock.sells);
  const realized   = calcTotalRealizedProfit(stock.sells);
  const unrealized = remaining > 0 ? (stock.currentPrice - avgCost) * remaining : 0;
  const totalPL    = realized + unrealized;
  const isUp       = totalPL > 0;
  const isZero     = totalPL === 0;
  const invested   = calcTotalInvested(stock.buys);
  const plPct      = invested > 0 ? (totalPL / invested) * 100 : 0;
  const holdingVal = remaining * stock.currentPrice;

  // Sparkline: transaction prices sorted by date
  const chartPrices = [
    ...stock.buys.map( b => ({ d: b.date, p: b.price })),
    ...stock.sells.map(s => ({ d: s.date, p: s.price })),
  ].sort((a, b) => a.d.localeCompare(b.d)).map(t => t.p);

  return (
    <button
      data-stock-id={stock.id}
      onClick={onClick}
      className={`bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left active:scale-[0.98] transition-transform ${
        carousel ? 'min-w-[44%] flex-shrink-0 lg:min-w-0 lg:w-full' : 'w-full'
      }`}
    >
      {/* Code badge */}
      <span className="inline-flex items-center bg-violet-100 text-violet-600 text-[11px] font-bold rounded-full px-2.5 py-0.5 mb-2">
        {stock.symbol}
      </span>

      {/* Name + sparkline */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 text-sm leading-snug">{stock.name}</p>
          <p className={`text-xl font-bold leading-tight mt-1 ${isZero ? 'text-gray-800' : isUp ? 'text-red-500' : 'text-emerald-600'}`}>
            {isUp ? '+' : ''}{formatNTD(totalPL)}
          </p>
          <p className={`text-[11px] font-medium mt-0.5 ${isZero ? 'text-gray-600' : isUp ? 'text-red-400' : 'text-emerald-500'}`}>
            {isZero ? '0%' : `${isUp ? '+' : ''}${plPct.toFixed(2)}%`}
          </p>
        </div>
        <MiniChart prices={chartPrices} isUp={isUp} />
      </div>

      {/* Info grid */}
      <div className="mt-3 pt-3 border-t border-gray-50 grid grid-cols-2 gap-y-2">
        <div>
          <p className="text-[10px] text-gray-400">成本</p>
          <p className="text-xs font-semibold text-gray-700">{formatPrice(avgCost)}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400">現價</p>
          <p className="text-xs font-semibold text-gray-700">{formatPrice(stock.currentPrice)}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400">股數</p>
          <p className="text-xs font-semibold text-gray-700">{remaining} 股</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400">持有市值</p>
          <p className="text-xs font-semibold text-gray-700">{formatNTD(holdingVal)}</p>
        </div>
      </div>
    </button>
  );
}

function MiniChart({ prices, isUp }: { prices: number[]; isUp: boolean }) {
  const color = isUp ? '#ef4444' : '#10b981';
  const W = 60, H = 34, PAD = 2;

  if (prices.length < 2) {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="flex-shrink-0 opacity-70">
        <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2}
          stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  const min   = Math.min(...prices);
  const max   = Math.max(...prices);
  const range = max - min || min * 0.01 || 1;

  const pts = prices.map((p, i) => {
    const x = PAD + (i / (prices.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((p - min) / range) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="flex-shrink-0 opacity-80">
      <polyline points={pts} fill="none"
        stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RecentItem({ symbol, name, type, date, shares, amount, profit }: {
  symbol: string; name: string; type: 'buy' | 'sell';
  date: string; shares: number; amount: number; profit: number | null;
}) {
  return (
    <div className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-50">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
        type === 'buy' ? 'bg-violet-100' : 'bg-emerald-50'
      }`}>
        <span className={`text-xs font-bold ${type === 'buy' ? 'text-violet-600' : 'text-emerald-600'}`}>
          {symbol.slice(0, 2)}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{name}</p>
        <p className="text-xs text-gray-400">{date} · {type === 'buy' ? '買入' : '賣出'} {shares} 股</p>
      </div>
      <div className="text-right">
        <p className={`text-sm font-semibold ${type === 'sell' ? 'text-emerald-600' : 'text-gray-700'}`}>
          {type === 'sell' ? '+' : '-'}{formatNTD(amount)}
        </p>
        {profit !== null && (
          <p className={`text-xs font-medium ${profit >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
            損益 {profit >= 0 ? '+' : ''}{formatNTD(profit)}
          </p>
        )}
      </div>
    </div>
  );
}
