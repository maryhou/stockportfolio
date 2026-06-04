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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecentIds(loadRecentIds());
    // slight delay so overlay transition finishes before focus
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

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

  function handleStockClick(id: string) {
    pushRecentId(id);
    onStockClick(id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[150] bg-gray-50 flex flex-col">
      {/* Search bar */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-3 bg-white border-b border-gray-100">
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
        <button
          onClick={onClose}
          className="text-sm font-semibold text-primary-600 whitespace-nowrap active:opacity-70"
        >
          取消
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* ── No query: recent ── */}
        {!q && (
          recentStocks.length > 0 ? (
            <Section label="最近瀏覽" count={recentStocks.length}>
              {recentStocks.map((s) => (
                <StockRow key={s.id} stock={s} onClick={() => handleStockClick(s.id)} />
              ))}
            </Section>
          ) : (
            <div className="flex flex-col items-center justify-center pt-20 text-center">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <p className="text-sm text-gray-400">輸入股票名稱或代號</p>
            </div>
          )
        )}

        {/* ── Has query but no results ── */}
        {q && !hasResults && (
          <div className="flex flex-col items-center justify-center pt-20 text-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <p className="text-sm font-semibold text-gray-500 mb-1">找不到「{query}」</p>
            <p className="text-xs text-gray-400">試試股票代號或中文名稱</p>
          </div>
        )}

        {/* ── Holding stocks ── */}
        {q && holdingStocks.length > 0 && (
          <Section label="我的持股" count={holdingStocks.length}>
            {holdingStocks.map((s) => (
              <StockRow key={s.id} stock={s} onClick={() => handleStockClick(s.id)} />
            ))}
          </Section>
        )}

        {/* ── Closed stocks ── */}
        {q && closedStocks.length > 0 && (
          <Section label="已完成投資" count={closedStocks.length}>
            {closedStocks.map((s) => (
              <StockRow key={s.id} stock={s} onClick={() => handleStockClick(s.id)} />
            ))}
          </Section>
        )}

        {/* ── Transactions ── */}
        {q && txResults.length > 0 && (
          <Section label="最近交易" count={txResults.length}>
            {txResults.map((tx) => (
              <TxRow key={tx.key} tx={tx} onClick={() => handleStockClick(tx.stockId)} />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ label, count, children }: { label: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <p className="text-[13px] font-semibold text-gray-500 tracking-wide">
          {label}
        </p>
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
function StockRow({ stock, onClick }: { stock: Stock; onClick: () => void }) {
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
      className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-50 last:border-b-0 active:bg-gray-50 transition-colors"
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
function TxRow({ tx, onClick }: { tx: TxResult; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-50 last:border-b-0 active:bg-gray-50 transition-colors"
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
