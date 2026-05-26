import { useState } from 'react';
import type { Stock } from '../types';
import {
  calcAvgCost,
  calcRemainingShares,
  calcTotalInvested,
  calcTotalRealizedProfit,
  calcTotalNetProceeds,
  formatNTD,
  formatNumber,
} from '../utils/calculations';
import DonutChart from './DonutChart';
import { TargetIcon, TrendUpIcon, TrendDownIcon } from './icons/Icons';

interface ActivityViewProps {
  stocks: Stock[];
  onUpdatePrice: (stockId: string, price: number) => void;
  onUpdateTarget: (stockId: string, price: number) => void;
}

export default function ActivityView({ stocks, onUpdatePrice, onUpdateTarget }: ActivityViewProps) {
  const [selectedId, setSelectedId] = useState(stocks[0]?.id ?? '');
  const [editingPrice, setEditingPrice] = useState(false);
  const [editingTarget, setEditingTarget] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [targetInput, setTargetInput] = useState('');

  const stock = stocks.find((s) => s.id === selectedId) ?? stocks[0];
  if (!stock) return <div className="flex items-center justify-center h-64 text-gray-400">尚無股票資料</div>;

  const avgCost = calcAvgCost(stock.buys);
  const remaining = calcRemainingShares(stock.buys, stock.sells);
  const totalInvested = calcTotalInvested(stock.buys);
  const realizedProfit = calcTotalRealizedProfit(stock.sells);
  const netProceeds = calcTotalNetProceeds(stock.sells);
  const unrealizedPL = remaining > 0 ? (stock.currentPrice - avgCost) * remaining : 0;
  const currentHoldingValue = remaining * stock.currentPrice;

  const donutSegments = [
    { label: '買入成本', value: totalInvested - realizedProfit, color: '#6C63FF' },
    { label: '已實現損益', value: Math.abs(realizedProfit), color: realizedProfit >= 0 ? '#10b981' : '#ef4444' },
    ...(remaining > 0 ? [{ label: '未實現損益', value: Math.abs(unrealizedPL), color: unrealizedPL >= 0 ? '#34d399' : '#f87171' }] : []),
  ].filter(s => s.value > 0);

  const totalPL = realizedProfit + unrealizedPL;

  return (
    <div className="flex flex-col gap-5 px-5 pt-6 pb-32 lg:pb-10 max-w-4xl">
      <h2 className="text-xl font-bold text-gray-800">活動分析</h2>

      {/* Stock selector tabs */}
      {stocks.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {stocks.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedId === s.id
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Balance card */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-gray-400">投入成本</p>
          <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
            totalPL >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
          }`}>
            {totalPL >= 0 ? <TrendUpIcon size={11} /> : <TrendDownIcon size={11} />}
            {totalPL >= 0 ? '+' : ''}{formatNTD(totalPL)}
          </div>
        </div>
        <p className="text-2xl font-bold text-gray-800">{formatNTD(totalInvested)}</p>

        {/* Donut chart */}
        <div className="flex items-center justify-center mt-4">
          <DonutChart
            segments={donutSegments}
            centerLabel={formatNTD(netProceeds + currentHoldingValue)}
            centerSub="總回收"
            size={180}
            strokeWidth={26}
          />
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-5 mt-4">
          {donutSegments.map((seg) => (
            <div key={seg.label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: seg.color }} />
              <span className="text-xs text-gray-500">{seg.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="平均成本" value={formatNumber(avgCost)} sub="NT$/股" accent="violet" />
        <StatCard label="剩餘股數" value={`${remaining} 股`} sub={remaining > 0 ? '持有中' : '已清倉'} accent={remaining > 0 ? 'violet' : 'gray'} />
        <StatCard label="已實現損益" value={`${realizedProfit >= 0 ? '+' : ''}${formatNTD(realizedProfit)}`} sub="含手續費及稅" accent={realizedProfit >= 0 ? 'green' : 'red'} />
        <StatCard label="可取得金額" value={formatNTD(netProceeds)} sub="賣出淨額" accent="green" />
        {remaining > 0 && (
          <StatCard label="未實現損益" value={`${unrealizedPL >= 0 ? '+' : ''}${formatNTD(unrealizedPL)}`} sub={`持有 ${remaining} 股`} accent={unrealizedPL >= 0 ? 'green' : 'red'} />
        )}
        <StatCard label="總投入" value={formatNTD(totalInvested)} sub="含手續費" accent="gray" />
      </div>

      {/* Target & current price */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
          <TargetIcon size={15} className="text-violet-500" /> 價格設定
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {/* Current price */}
          <div>
            <p className="text-xs text-gray-400 mb-1">目前股價</p>
            {editingPrice ? (
              <div className="flex gap-1">
                <input
                  autoFocus
                  type="number"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  className="w-full text-sm border border-violet-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-violet-200"
                  placeholder={String(stock.currentPrice)}
                />
                <button
                  onClick={() => {
                    const v = parseFloat(priceInput);
                    if (!isNaN(v) && v > 0) onUpdatePrice(stock.id, v);
                    setEditingPrice(false);
                  }}
                  className="text-xs bg-violet-600 text-white px-2 py-1 rounded-lg"
                >
                  OK
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setPriceInput(String(stock.currentPrice)); setEditingPrice(true); }}
                className="flex items-center gap-1 text-base font-bold text-gray-800 hover:text-violet-600 transition-colors"
              >
                {formatNumber(stock.currentPrice)}
                <span className="text-[10px] text-gray-400 font-normal">點擊更新</span>
              </button>
            )}
          </div>
          {/* Target price */}
          <div>
            <p className="text-xs text-gray-400 mb-1">目標股價</p>
            {editingTarget ? (
              <div className="flex gap-1">
                <input
                  autoFocus
                  type="number"
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  className="w-full text-sm border border-violet-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-violet-200"
                  placeholder={String(stock.targetPrice)}
                />
                <button
                  onClick={() => {
                    const v = parseFloat(targetInput);
                    if (!isNaN(v) && v > 0) onUpdateTarget(stock.id, v);
                    setEditingTarget(false);
                  }}
                  className="text-xs bg-violet-600 text-white px-2 py-1 rounded-lg"
                >
                  OK
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setTargetInput(String(stock.targetPrice)); setEditingTarget(true); }}
                className="flex items-center gap-1 text-base font-bold text-violet-600 hover:text-violet-800 transition-colors"
              >
                {formatNumber(stock.targetPrice)}
                <span className="text-[10px] text-gray-400 font-normal">點擊更新</span>
              </button>
            )}
          </div>
        </div>
        {stock.currentPrice >= stock.targetPrice ? (
          <div className="mt-3 text-xs bg-emerald-50 text-emerald-700 rounded-lg px-3 py-2 flex items-center gap-1.5">
            <TrendUpIcon size={12} /> 目前股價已達目標！
          </div>
        ) : (
          <div className="mt-3 text-xs bg-violet-50 text-violet-700 rounded-lg px-3 py-2">
            距離目標還差 <strong>{formatNumber(stock.targetPrice - stock.currentPrice)}</strong> 元（{(((stock.targetPrice - stock.currentPrice) / stock.currentPrice) * 100).toFixed(1)}%）
          </div>
        )}
      </div>

      {/* Transaction history */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">交易記錄</h3>
        <div className="flex flex-col gap-2">
          {/* Sells */}
          {stock.sells.map((tx) => (
            <div key={tx.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center">
                    <span className="text-xs font-bold text-emerald-600">賣</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{tx.date}</p>
                    <p className="text-xs text-gray-400">{formatNumber(tx.price)} × {tx.shares} 股</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${tx.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {tx.profit >= 0 ? '+' : ''}{formatNTD(tx.profit)}
                  </p>
                  <p className="text-xs text-gray-400">淨額 {formatNTD(tx.netProceeds)}</p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-50 grid grid-cols-3 gap-2 text-center">
                <MiniStat label="手續費" value={`-${formatNTD(tx.fee)}`} />
                <MiniStat label="交易稅" value={`-${formatNTD(tx.tax)}`} />
                <MiniStat label="可取得" value={formatNTD(tx.netProceeds)} highlight />
              </div>
            </div>
          ))}
          {/* Buys */}
          {stock.buys.map((tx) => (
            <div key={tx.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center">
                    <span className="text-xs font-bold text-violet-600">買</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{tx.date}</p>
                    <p className="text-xs text-gray-400">{formatNumber(tx.price)} × {tx.shares} 股</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-700">-{formatNTD(tx.price * tx.shares + tx.fee)}</p>
                  <p className="text-xs text-gray-400">含手續費</p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-50 grid grid-cols-2 gap-2 text-center">
                <MiniStat label="手續費" value={`-${formatNTD(tx.fee)}`} />
                <MiniStat label="買入金額" value={formatNTD(tx.price * tx.shares)} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  const accentClass: Record<string, string> = {
    violet: 'text-violet-600',
    green: 'text-emerald-600',
    red: 'text-red-500',
    gray: 'text-gray-700',
  };
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-base font-bold ${accentClass[accent] ?? 'text-gray-700'}`}>{value}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400">{label}</p>
      <p className={`text-xs font-semibold ${highlight ? 'text-emerald-600' : 'text-gray-600'}`}>{value}</p>
    </div>
  );
}
