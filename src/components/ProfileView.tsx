import type { Stock, AppSettings } from '../types';
import { calcAvgCost, calcRemainingShares, calcTotalRealizedProfit, formatNTD, formatNumber } from '../utils/calculations';
import { SettingsIcon } from './icons/Icons';

interface ProfileViewProps {
  stocks: Stock[];
  settings: AppSettings;
  onSettingsClick: () => void;
}

export default function ProfileView({ stocks, settings, onSettingsClick }: ProfileViewProps) {
  const totalProfit = stocks.reduce((s, st) => s + calcTotalRealizedProfit(st.sells), 0);
  const totalTrades = stocks.reduce((s, st) => s + st.buys.length + st.sells.length, 0);

  const effectiveFee = ((settings.feeRate * settings.feeDiscount) * 100).toFixed(4);
  const discountPct = (settings.feeDiscount * 100).toFixed(0);
  const taxPct = (settings.taxRate * 100).toFixed(2).replace(/\.?0+$/, '');
  const feeRatePct = (settings.feeRate * 100).toFixed(4).replace(/\.?0+$/, '');
  const avatarLetter = settings.userName.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col gap-5 px-5 pt-6 pb-32 lg:pb-10 lg:px-8 w-full max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">我的</h2>
        <button
          onClick={onSettingsClick}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 active:bg-gray-200 transition-colors"
        >
          <SettingsIcon size={18} />
        </button>
      </div>

      {/* Avatar */}
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center text-3xl font-bold text-white shadow-lg">
          {avatarLetter}
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-800">{settings.userName}</h2>
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

      {/* Fee info — dynamic based on settings */}
      <div className="bg-violet-50 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-violet-700">費用計算說明</p>
          <span className="text-[11px] text-violet-500 bg-violet-100 px-2 py-0.5 rounded-full">{settings.brokerName}</span>
        </div>
        <div className="flex flex-col gap-1 text-xs text-violet-600">
          <p>· 手續費：成交金額 × {feeRatePct}% × {discountPct}折 = {effectiveFee}%</p>
          <p>· 交易稅：賣出金額 × {taxPct}%</p>
          <p>· 損益 = 可取得金額 − 平均成本 × 股數</p>
        </div>
      </div>
    </div>
  );
}
