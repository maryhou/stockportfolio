import type { Stock } from '../types';
import { calcAvgCost, calcRemainingShares, calcTotalRealizedProfit, formatNTD, formatNumber } from '../utils/calculations';

interface ProfileViewProps {
  stocks: Stock[];
}

export default function ProfileView({ stocks }: ProfileViewProps) {
  const totalProfit = stocks.reduce((s, st) => s + calcTotalRealizedProfit(st.sells), 0);
  const totalTrades = stocks.reduce((s, st) => s + st.buys.length + st.sells.length, 0);

  return (
    <div className="flex flex-col gap-5 px-5 pt-6 pb-32">
      {/* Avatar */}
      <div className="flex flex-col items-center gap-3 py-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center text-3xl font-bold text-white shadow-lg">
          M
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-800">Mary</h2>
          <p className="text-sm text-gray-400">股票投資追蹤</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
          <p className="text-lg font-bold text-violet-600">{stocks.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">追蹤股票</p>
        </div>
        <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
          <p className="text-lg font-bold text-gray-800">{totalTrades}</p>
          <p className="text-xs text-gray-400 mt-0.5">交易次數</p>
        </div>
        <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
          <p className={`text-lg font-bold ${totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {totalProfit >= 0 ? '+' : ''}{formatNTD(totalProfit)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">總損益</p>
        </div>
      </div>

      {/* Stocks summary */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">持股摘要</h3>
        <div className="flex flex-col gap-2">
          {stocks.map((stock) => {
            const avgCost = calcAvgCost(stock.buys);
            const remaining = calcRemainingShares(stock.buys, stock.sells);
            const profit = calcTotalRealizedProfit(stock.sells);
            return (
              <div key={stock.id} className="bg-white rounded-2xl px-4 py-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
                      <span className="text-xs font-bold text-violet-600">{stock.symbol.slice(0, 2)}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{stock.name}</p>
                      <p className="text-xs text-gray-400">{stock.symbol} · 平均 {formatNumber(avgCost)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {profit >= 0 ? '+' : ''}{formatNTD(profit)}
                    </p>
                    <p className="text-xs text-gray-400">{remaining > 0 ? `持有 ${remaining} 股` : '已清倉'}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fee info */}
      <div className="bg-violet-50 rounded-2xl p-4">
        <p className="text-xs font-semibold text-violet-700 mb-2">費用計算說明</p>
        <div className="flex flex-col gap-1 text-xs text-violet-600">
          <p>· 手續費：成交金額 × 0.1425% × 60折</p>
          <p>· 交易稅：賣出金額 × 0.3%</p>
          <p>· 損益 = 可取得金額 − 平均成本 × 股數</p>
        </div>
      </div>
    </div>
  );
}
