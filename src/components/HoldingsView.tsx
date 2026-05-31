import { useState } from 'react';
import type { Stock } from '../types';
import {
  calcAvgCost,
  calcRemainingShares,
  calcTotalNetProceeds,
  formatNTD,
  formatNumber,
  formatPrice,
} from '../utils/calculations';
import { TrendUpIcon, TrendDownIcon } from './icons/Icons';

interface HoldingsViewProps {
  stocks: Stock[];
  onStockClick: (id: string) => void;
}

type HoldingFilter = 'holding' | 'closed';

const TABS: { key: HoldingFilter; label: string }[] = [
  { key: 'holding', label: '持倉中' },
  { key: 'closed',  label: '已清倉' },
];

export default function HoldingsView({ stocks, onStockClick }: HoldingsViewProps) {
  const [filter, setFilter] = useState<HoldingFilter>('holding');

  const filtered = stocks.filter((s) => {
    const remaining = calcRemainingShares(s.buys, s.sells);
    if (filter === 'holding') return remaining > 0;
    if (filter === 'closed')  return remaining === 0;
    return true;
  });

  return (
    <div className="flex flex-col gap-5 px-5 pt-6 pb-32 lg:pb-10">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">持倉列表</h2>
        <span className="text-xs text-gray-400">{filtered.length} 檔股票</span>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
              filter === t.key
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filter === 'closed' && (
        <p className="text-xs text-gray-400 text-center -mt-1">已完成的投資紀錄</p>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center bg-white rounded-2xl shadow-sm border border-gray-50">
          <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mb-3">
            {stocks.length === 0 ? (
              /* No stocks at all: briefcase/portfolio icon */
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                <line x1="12" y1="12" x2="12" y2="16" />
                <line x1="10" y1="14" x2="14" y2="14" />
              </svg>
            ) : (
              /* Filter has no results: list icon */
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <circle cx="3" cy="6" r="1" fill="#d1d5db" stroke="none" />
                <circle cx="3" cy="12" r="1" fill="#d1d5db" stroke="none" />
                <circle cx="3" cy="18" r="1" fill="#d1d5db" stroke="none" />
              </svg>
            )}
          </div>
          <p className="text-sm font-semibold text-gray-700 mb-1">
            {stocks.length === 0 ? '尚無持股' : '此分類目前沒有資料'}
          </p>
          <p className="text-xs text-gray-400">
            {stocks.length === 0 ? (
              <>點擊 ＋ 新增第一筆交易<br />開始建立你的投資組合</>
            ) : '試試切換其他分類'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((stock) => (
            <HoldingCard key={stock.id} stock={stock} onClick={() => onStockClick(stock.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function HoldingCard({ stock, onClick }: { stock: Stock; onClick: () => void }) {
  const avgCost = calcAvgCost(stock.buys);
  const remaining = calcRemainingShares(stock.buys, stock.sells);
  const netProceeds = calcTotalNetProceeds(stock.sells);
  const currentHoldingValue = remaining * stock.currentPrice;
  const totalInvested = stock.buys.reduce((s, b) => s + b.price * b.shares + b.fee, 0);
  const totalPL = netProceeds + currentHoldingValue - totalInvested;
  const plPct = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
  const isProfit = totalPL >= 0;
  const isClosed = remaining === 0;

  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-50 text-left w-full active:scale-[0.98] transition-transform"
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
            <span className="text-[11px] font-bold text-violet-600 leading-tight text-center">
              {stock.symbol}
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">{stock.name}</p>
            <span className={`inline-block text-[9px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 ${
              isClosed ? 'bg-gray-100 text-gray-400' : 'bg-violet-100 text-violet-600'
            }`}>
              {isClosed ? '已清倉' : '持倉中'}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-sm font-bold ${isProfit ? 'text-red-500' : 'text-emerald-600'}`}>
            {isProfit ? '+' : ''}{formatNTD(totalPL)}
          </p>
          <div className={`flex items-center justify-end gap-0.5 text-xs ${isProfit ? 'text-red-400' : 'text-emerald-500'}`}>
            {isProfit ? <TrendUpIcon size={11} /> : <TrendDownIcon size={11} />}
            <span>{isProfit ? '+' : ''}{plPct.toFixed(2)}%</span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-2 pt-2 border-t border-gray-50 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-gray-400">平均成本</p>
          <p className="text-xs font-semibold text-gray-600">{formatPrice(avgCost)}</p>
        </div>

        <div>
          <p className="text-[10px] text-gray-400">剩餘股數</p>
          <p className={`text-base font-bold leading-tight ${isClosed ? 'text-gray-400' : 'text-violet-600'}`}>
            {remaining}
          </p>
        </div>

        {isClosed ? (
          <div>
            <p className="text-[10px] text-gray-400">總回收金額</p>
            <p className="text-xs font-semibold text-gray-600">{formatNTD(netProceeds)}</p>
          </div>
        ) : (
          <div>
            <p className="text-[10px] text-gray-400">目前市值</p>
            <p className="text-xs font-semibold text-gray-600">{formatNTD(currentHoldingValue)}</p>
            <p className="text-[9px] text-gray-400">${formatNumber(stock.currentPrice)}/股</p>
          </div>
        )}
      </div>
    </button>
  );
}
