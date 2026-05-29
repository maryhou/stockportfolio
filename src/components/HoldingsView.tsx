import type { Stock } from '../types';
import {
  calcAvgCost,
  calcRemainingShares,
  calcTotalRealizedProfit,
  formatNTD,
  formatNumber,
  formatPrice,
} from '../utils/calculations';
import { TrendUpIcon, TrendDownIcon } from './icons/Icons';

interface HoldingsViewProps {
  stocks: Stock[];
  onStockClick: (id: string) => void;
}

export default function HoldingsView({ stocks, onStockClick }: HoldingsViewProps) {
  return (
    <div className="flex flex-col gap-5 px-5 pt-6 pb-32 lg:pb-10">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">持倉列表</h2>
        <span className="text-xs text-gray-400">{stocks.length} 檔股票</span>
      </div>

      {stocks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-sm">尚無持股，點擊 + 新增交易</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {stocks.map((stock) => (
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
  const realizedProfit = calcTotalRealizedProfit(stock.sells);
  const unrealizedPL = remaining > 0 ? (stock.currentPrice - avgCost) * remaining : 0;
  const totalPL = realizedProfit + unrealizedPL;
  const totalInvested = stock.buys.reduce((s, b) => s + b.price * b.shares + b.fee, 0);
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
            <p className="text-xs text-gray-400">{stock.symbol}</p>
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

      {/* Stats row — styled like transaction card detail rows */}
      <div className="mt-2 pt-2 border-t border-gray-50 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-gray-400">平均成本</p>
          <p className="text-xs font-semibold text-gray-600">{formatPrice(avgCost)}</p>
        </div>

        {/* Remaining shares — most prominent */}
        <div className="flex flex-col items-center">
          <p className="text-[10px] text-gray-400">剩餘股數</p>
          <p className={`text-base font-bold leading-tight ${isClosed ? 'text-gray-400' : 'text-violet-600'}`}>
            {remaining}
          </p>
          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 ${
            isClosed ? 'bg-gray-100 text-gray-400' : 'bg-violet-100 text-violet-600'
          }`}>
            {isClosed ? '已清倉' : '股'}
          </span>
        </div>

        <div>
          <p className="text-[10px] text-gray-400">目前股價</p>
          <p className="text-xs font-semibold text-gray-600">{formatNumber(stock.currentPrice)}</p>
        </div>
      </div>
    </button>
  );
}
