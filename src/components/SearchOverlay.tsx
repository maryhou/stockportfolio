import { useState, useEffect, useRef } from 'react';
import type { Stock } from '../types';
import {
  calcRemainingShares,
  calcExactRealizedProfit,
  calcTotalNetProceeds,
  calcTotalInvested,
  formatNTD,
  formatPrice,
} from '../utils/calculations';

const RECENT_KEY = 'stock-tracker-recent';
const MAX_RECENT = 5;

export function loadRecentIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

export function pushRecentId(id: string) {
  const prev = loadRecentIds().filter((x) => x !== id);
  localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...prev].slice(0, MAX_RECENT)));
}

interface SearchOverlayProps {
  stocks: Stock[];
  onStockClick: (id: string) => void;
  onClose: () => void;
}

interface TxResult {
  key: string;
  stockId: string;
  symbol: string;
  name: string;
  type: 'buy' | 'sell';
  date: string;
  shares: number;
  amount: number;
  profit: number | null;
}

export default function SearchOverlay({ stocks, onStockClick, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecentIds(loadRecentIds());
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  // Reset keyboard focus when query changes
  useEffect(() => setFocusedIdx(-1), [query]);

  const q = query.trim().toLowerCase();

  // ── Stock results ──────────────────────────────────────────────────────────
  const matchStock = (s: Stock) =>
    s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);

  const holdingStocks = stocks.filter(
    (s) => calcRemainingShares(s.buys, s.sells) > 0 && matchStock(s),
  );
  const closedStocks = stocks.filter(
    (s) => calcRemainingShares(s.buys, s.sells) === 0 && s.buys.length > 0 && matchStock(s),
  );

  // ── Transaction results ────────────────────────────────────────────────────
  const txResults: TxResult[] = q
    ? stocks
        .flatMap((s) => [
          ...s.sells.map((tx) => ({
            key: `sell-${tx.id}`,
            stockId: s.id, symbol: s.symbol, name: s.name,
            type: 'sell' as const,
            date: tx.date, shares: tx.shares, amount: tx.netProceeds, profit: tx.profit,
          })),
          ...s.buys.map((tx) => ({
            key: `buy-${tx.id}`,
            stockId: s.id, symbol: s.symbol, name: s.name,
            type: 'buy' as const,
            date: tx.date, shares: tx.shares,
            amount: tx.price * tx.shares + tx.fee, profit: null,
          })),
        ])
        .filter((tx) =>
          tx.symbol.toLowerCase().includes(q) ||
          tx.name.toLowerCase().includes(q) ||
          tx.date.includes(q),
        )
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 10)
    : [];

  // ── Recent stocks (no query) ───────────────────────────────────────────────
  const recentStocks = recentIds
    .map((id) => stocks.find((s) => s.id === id))
    .filter(Boolean) as Stock[];

  const hasResults = q
    ? holdingStocks.length + closedStocks.length + txResults.length > 0
    : recentStocks.length > 0;

  // ── Flat item list for keyboard navigation ─────────────────────────────────
  const flatItems: { id: string }[] = q
    ? [
        ...holdingStocks.map((s) => ({ id: s.id })),
        ...closedStocks.map((s) => ({ id: s.id })),
        ...txResults.map((tx) => ({ id: tx.stockId })),
      ]
    : recentStocks.map((s) => ({ id: s.id }));

  const holdingOffset = 0;
  const closedOffset  = holdingStocks.length;
  const txOffset      = holdingStocks.length + closedStocks.length;

  function handleStockClick(id: string) {
    pushRecentId(id);
    onStockClick(id);
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIdx((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && focusedIdx >= 0) {
      e.preventDefault();
      const item = flatItems[focusedIdx];
      if (item) handleStockClick(item.id);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  return (
    // Outer: full-screen on mobile / blurred backdrop on desktop
    <div
      className="fixed inset-0 z-[150] flex flex-col bg-gray-50
                 md:bg-black/30 md:backdrop-blur-sm md:items-center md:justify-start md:pt-[12vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKeyDown}
    >
      {/* Card: full height on mobile / floating panel on desktop */}
      <div
        className="flex flex-col w-full h-full
                   md:h-auto md:max-h-[68vh] md:max-w-xl md:rounded-2xl
                   md:shadow-2xl md:overflow-hidden md:bg-white cmd-palette-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Search bar ── */}
        <div className="flex items-center gap-3 px-4 pt-safe-6 pb-3 bg-white border-b border-gray-100
                        md:pt-5 md:pb-4 md:px-5">
          <div className="flex-1 flex items-center gap-2.5 bg-gray-100 rounded-2xl px-3.5 py-2.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
              placeholder="搜尋股票、代號、交易紀錄..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-gray-400 active:text-gray-600">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
              </button>
            )}
          </div>

          {/* Mobile: 取消 / Desktop: esc hint */}
          <button
            onClick={onClose}
            className="text-sm font-semibold text-primary-600 whitespace-nowrap active:opacity-70 md:hidden"
          >
            取消
          </button>
          <kbd className="hidden md:inline-flex items-center text-[11px] text-gray-400 bg-gray-100 rounded-md px-2 py-1 font-mono cursor-pointer hover:bg-gray-200 transition-colors"
               onClick={onClose}>
            esc
          </kbd>
        </div>

        {/* ── Results ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50 md:bg-white">

          {/* No query: recent */}
          {!q && (
            recentStocks.length > 0 ? (
              <Section label="最近瀏覽" count={recentStocks.length}>
                {recentStocks.map((s, i) => (
                  <StockRow key={s.id} stock={s} isFocused={focusedIdx === i} onClick={() => handleStockClick(s.id)} />
                ))}
              </Section>
            ) : (
              <EmptyState message="輸入股票名稱或代號" />
            )
          )}

          {/* Has query but no results */}
          {q && !hasResults && (
            <EmptyState message={`找不到「${query}」`} sub="試試股票代號或中文名稱" />
          )}

          {/* Holding stocks */}
          {q && holdingStocks.length > 0 && (
            <Section label="我的持股" count={holdingStocks.length}>
              {holdingStocks.map((s, i) => (
                <StockRow key={s.id} stock={s} isFocused={focusedIdx === holdingOffset + i} onClick={() => handleStockClick(s.id)} />
              ))}
            </Section>
          )}

          {/* Closed stocks */}
          {q && closedStocks.length > 0 && (
            <Section label="已完成投資" count={closedStocks.length}>
              {closedStocks.map((s, i) => (
                <StockRow key={s.id} stock={s} isFocused={focusedIdx === closedOffset + i} onClick={() => handleStockClick(s.id)} />
              ))}
            </Section>
          )}

          {/* Transactions */}
          {q && txResults.length > 0 && (
            <Section label="最近交易" count={txResults.length}>
              {txResults.map((tx, i) => (
                <TxRow key={tx.key} tx={tx} isFocused={focusedIdx === txOffset + i} onClick={() => handleStockClick(tx.stockId)} />
              ))}
            </Section>
          )}

          {/* Desktop keyboard hint */}
          {flatItems.length > 0 && (
            <p className="hidden md:block text-center text-[11px] text-gray-300 mt-2 pb-1 select-none">
              ↑↓ 選擇　Enter 進入　Esc 關閉
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────
function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center pt-16 pb-8 text-center">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <p className="text-sm font-medium text-gray-500 mb-1">{message}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ label, count, children }: { label: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <p className="text-[13px] font-semibold text-gray-500 tracking-wide">{label}</p>
        {count !== undefined && (
          <span className="text-[12px] font-medium text-gray-400">({count})</span>
        )}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

// ── Stock row ──────────────────────────────────────────────────────────────────
function StockRow({ stock, isFocused, onClick }: { stock: Stock; isFocused: boolean; onClick: () => void }) {
  const remaining      = calcRemainingShares(stock.buys, stock.sells);
  const invested       = calcTotalInvested(stock.buys);
  const netProceeds    = calcTotalNetProceeds(stock.sells);
  const realizedProfit = calcExactRealizedProfit(stock.buys, stock.sells);
  const holdingVal     = remaining * stock.currentPrice;
  const totalPL        = netProceeds + holdingVal - invested;
  const isClosed       = remaining === 0;
  const displayPL      = isClosed ? realizedProfit : totalPL;
  const displayPct     = invested > 0 ? (displayPL / invested) * 100 : 0;
  const isUp           = displayPL > 0;
  const isZero         = displayPL === 0;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-50 last:border-b-0 transition-colors
        ${isFocused ? 'bg-primary-50' : 'active:bg-gray-50 hover:bg-gray-50'}`}
    >
      <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
        <span className="text-[9px] font-bold text-primary-600 text-center leading-tight px-0.5">
          {stock.symbol}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{stock.name}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {isClosed
            ? `${stock.symbol} · 已清倉`
            : `${stock.symbol} · ${remaining} 股 · ${formatPrice(stock.currentPrice)}`}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-bold ${isZero ? 'text-gray-700' : isUp ? 'text-red-500' : 'text-emerald-600'}`}>
          {isUp ? '+' : ''}{formatNTD(displayPL)}
        </p>
        <p className={`text-[10px] font-medium mt-0.5 ${isZero ? 'text-gray-400' : isUp ? 'text-red-400' : 'text-emerald-500'}`}>
          {isZero ? '0.00%' : `${isUp ? '+' : ''}${displayPct.toFixed(2)}%`}
        </p>
      </div>
    </button>
  );
}

// ── Transaction row ────────────────────────────────────────────────────────────
function TxRow({ tx, isFocused, onClick }: { tx: TxResult; isFocused: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-50 last:border-b-0 transition-colors
        ${isFocused ? 'bg-primary-50' : 'active:bg-gray-50 hover:bg-gray-50'}`}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
        tx.type === 'buy' ? 'bg-primary-100' : 'bg-emerald-50'
      }`}>
        <span className={`text-sm font-bold ${tx.type === 'buy' ? 'text-primary-600' : 'text-emerald-600'}`}>
          {tx.type === 'buy' ? '買' : '賣'}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{tx.name}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">{tx.date} · {tx.shares} 股</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-gray-700">
          {tx.type === 'sell' ? '' : '-'}{formatNTD(tx.amount)}
        </p>
        {tx.profit !== null && (
          <p className={`text-[10px] font-medium mt-0.5 ${tx.profit >= 0 ? 'text-red-400' : 'text-emerald-500'}`}>
            損益 {tx.profit >= 0 ? '+' : ''}{formatNTD(tx.profit)}
          </p>
        )}
      </div>
    </button>
  );
}
