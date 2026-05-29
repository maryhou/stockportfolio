import { useState } from 'react';
import type { Stock, BuyTransaction, SellTransaction, AppSettings } from '../types';
import {
  calcAvgCost,
  calcRemainingShares,
  calcTotalInvested,
  calcTotalRealizedProfit,
  calcTotalNetProceeds,
  formatNTD,
  formatNumber,
  formatPrice,
} from '../utils/calculations';
import DonutChart from './DonutChart';
import { TargetIcon, TrendUpIcon, TrendDownIcon, RefreshIcon } from './icons/Icons';
import EditTransactionModal from './EditTransactionModal';

interface ActivityViewProps {
  stocks: Stock[];
  selectedStockId: string | null;
  settings: AppSettings;
  onSelectStock: (id: string) => void;
  onUpdatePrice: (stockId: string, price: number) => void;
  onUpdateTarget: (stockId: string, price: number) => void;
  onSaveTx: (stockId: string, type: 'buy' | 'sell', tx: BuyTransaction | SellTransaction) => void;
  onDeleteTx: (stockId: string, type: 'buy' | 'sell', txId: string) => void;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
  lastUpdated: Date | null;
}

export default function ActivityView({ stocks, selectedStockId, settings, onSelectStock, onUpdatePrice, onUpdateTarget, onSaveTx, onDeleteTx, onRefresh, isRefreshing, lastUpdated }: ActivityViewProps) {
  const stock = selectedStockId ? stocks.find((s) => s.id === selectedStockId) : null;

  if (stock) {
    return (
      <StockDetail
        stock={stock}
        settings={settings}
        onUpdatePrice={onUpdatePrice}
        onUpdateTarget={onUpdateTarget}
        onSaveTx={(type, tx) => onSaveTx(stock.id, type, tx)}
        onDeleteTx={(type, txId) => onDeleteTx(stock.id, type, txId)}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        lastUpdated={lastUpdated}
      />
    );
  }

  return <PortfolioOverview stocks={stocks} onSelectStock={onSelectStock} />;
}

// ─── Portfolio Overview ───────────────────────────────────────────────────────

const PALETTE = ['#6C63FF', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316'];

function PortfolioOverview({ stocks, onSelectStock }: { stocks: Stock[]; onSelectStock: (id: string) => void }) {
  const [txFilter, setTxFilter] = useState<'all' | 'buy' | 'sell'>('all');

  if (stocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 px-5">
        <p className="text-4xl mb-3">📊</p>
        <p className="text-sm">尚無資料，點擊 + 新增交易</p>
      </div>
    );
  }

  // Portfolio-wide totals
  const totalInvested = stocks.reduce((s, st) => s + calcTotalInvested(st.buys), 0);
  const totalRealized = stocks.reduce((s, st) => s + calcTotalRealizedProfit(st.sells), 0);
  const totalNetProceeds = stocks.reduce((s, st) => s + calcTotalNetProceeds(st.sells), 0);
  const totalUnrealized = stocks.reduce((s, st) => {
    const rem = calcRemainingShares(st.buys, st.sells);
    return s + (rem > 0 ? (st.currentPrice - calcAvgCost(st.buys)) * rem : 0);
  }, 0);
  const totalHoldingValue = stocks.reduce((s, st) => {
    const rem = calcRemainingShares(st.buys, st.sells);
    return s + rem * st.currentPrice;
  }, 0);
  const totalPL = totalRealized + totalUnrealized;

  // Donut: allocation by current holding value + net proceeds per stock
  const donutSegments = stocks
    .map((st, i) => {
      const rem = calcRemainingShares(st.buys, st.sells);
      const val = rem * st.currentPrice + calcTotalNetProceeds(st.sells);
      return { label: st.name, value: val, color: PALETTE[i % PALETTE.length] };
    })
    .filter((s) => s.value > 0);

  const centerValue = totalHoldingValue + totalNetProceeds;

  // All transactions sorted newest first
  const allTrades = stocks
    .flatMap((st) => [
      ...st.sells.map((tx) => ({ stockName: st.name, stockSymbol: st.symbol, type: 'sell' as const, date: tx.date, shares: tx.shares, price: tx.price, amount: tx.netProceeds, profit: tx.profit, id: tx.id })),
      ...st.buys.map((tx) => ({ stockName: st.name, stockSymbol: st.symbol, type: 'buy' as const, date: tx.date, shares: tx.shares, price: tx.price, amount: tx.price * tx.shares + tx.fee, profit: null, id: tx.id })),
    ])
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  return (
    <div className="flex flex-col gap-5 px-5 pt-6 pb-32 lg:pb-10 lg:px-8 w-full">
      <h2 className="text-xl font-bold text-gray-800">投資組合分析</h2>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[360px_1fr] lg:gap-6 lg:items-start">
        {/* Left: Summary card with donut */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-400">總投入成本</p>
            <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
              totalPL >= 0 ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'
            }`}>
              {totalPL >= 0 ? <TrendUpIcon size={11} /> : <TrendDownIcon size={11} />}
              總損益 {totalPL >= 0 ? '+' : ''}{formatNTD(totalPL)}
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-800">{formatNTD(totalInvested)}</p>

          {donutSegments.length > 0 && (
            <>
              <div className="flex items-center justify-center mt-4">
                <DonutChart
                  segments={donutSegments}
                  centerLabel={formatNTD(centerValue)}
                  centerSub="持倉 + 回收"
                  size={180}
                  strokeWidth={26}
                />
              </div>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-4">
                {donutSegments.map((seg) => (
                  <div key={seg.label} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: seg.color }} />
                    <span className="text-xs text-gray-500">{seg.label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right: stats + breakdown + history */}
        <div className="flex flex-col gap-5">
          {/* Portfolio stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard label="已實現損益" value={`${totalRealized >= 0 ? '+' : ''}${formatNTD(totalRealized)}`} sub="含手續費及稅" accent={totalRealized === 0 ? 'gray' : totalRealized > 0 ? 'red' : 'green'} />
            <StatCard label="未實現損益" value={`${totalUnrealized >= 0 ? '+' : ''}${formatNTD(totalUnrealized)}`} sub="按目前股價" accent={totalUnrealized === 0 ? 'gray' : totalUnrealized > 0 ? 'red' : 'green'} />
            <StatCard label="可取得金額" value={formatNTD(totalNetProceeds)} sub="賣出淨額合計" accent={totalNetProceeds === 0 ? 'gray' : 'violet'} />
            <StatCard label="持倉市值" value={formatNTD(totalHoldingValue)} sub="按目前股價" accent="gray" />
            <StatCard label="總投入" value={formatNTD(totalInvested)} sub="含所有手續費" accent="gray" />
            <StatCard label="持股檔數" value={`${stocks.length} 檔`} sub={`${stocks.filter(s => calcRemainingShares(s.buys, s.sells) > 0).length} 檔持倉中`} accent="violet" />
          </div>

          {/* Per-stock breakdown */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">個股明細</h3>
            <div className="flex flex-col gap-2">
              {stocks.map((st, i) => (
                <StockSummaryRow key={st.id} stock={st} color={PALETTE[i % PALETTE.length]} onClick={() => onSelectStock(st.id)} />
              ))}
            </div>
          </div>

          {/* Full transaction history */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">所有交易記錄</h3>
              <div className="flex gap-0.5 bg-gray-100 rounded-xl p-1">
                {(['all', 'buy', 'sell'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setTxFilter(tab)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      txFilter === tab ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    {tab === 'all' ? '全部' : tab === 'buy' ? '買入' : '賣出'}
                  </button>
                ))}
              </div>
            </div>
            {allTrades.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">尚無交易記錄</p>
            ) : (
              <div className="flex flex-col gap-2">
                {allTrades
                  .filter((tx) => txFilter === 'all' || tx.type === txFilter)
                  .map((tx) => (
                    <TradeTileRow key={`${tx.type}-${tx.id}`} {...tx} />
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StockSummaryRow({ stock, color, onClick }: { stock: Stock; color: string; onClick: () => void }) {
  const avgCost = calcAvgCost(stock.buys);
  const remaining = calcRemainingShares(stock.buys, stock.sells);
  const realized = calcTotalRealizedProfit(stock.sells);
  const unrealized = remaining > 0 ? (stock.currentPrice - avgCost) * remaining : 0;
  const totalPL = realized + unrealized;
  const invested = calcTotalInvested(stock.buys);
  const plPct = invested > 0 ? (totalPL / invested) * 100 : 0;
  const isClosed = remaining === 0;

  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-50 text-left w-full flex items-center gap-3 active:scale-[0.99] transition-transform"
    >
      <div className="w-2.5 h-10 rounded-full flex-shrink-0" style={{ background: color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-gray-800">{stock.name}</span>
            <span className="text-xs text-gray-400 ml-2">{stock.symbol}</span>
          </div>
          <div className="text-right">
            <p className={`text-sm font-bold ${totalPL >= 0 ? 'text-red-500' : 'text-emerald-600'}`}>
              {totalPL >= 0 ? '+' : ''}{formatNTD(totalPL)}
            </p>
            <p className={`text-xs ${totalPL >= 0 ? 'text-red-400' : 'text-emerald-500'}`}>
              {totalPL >= 0 ? '+' : ''}{plPct.toFixed(2)}%
            </p>
          </div>
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          <div>
            <p className="text-[10px] text-gray-400">平均成本</p>
            <p className="text-xs font-semibold text-gray-600">{formatNumber(avgCost)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400">剩餘股數</p>
            <p className={`text-xs font-semibold ${isClosed ? 'text-gray-400' : 'text-violet-600'}`}>
              {isClosed ? '已清倉' : `${remaining} 股`}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400">目前股價</p>
            <p className="text-xs font-semibold text-gray-600">{formatPrice(stock.currentPrice)}</p>
          </div>
        </div>
      </div>
      <div className="text-gray-300 text-sm flex-shrink-0">›</div>
    </button>
  );
}

function TradeTileRow({ stockName, stockSymbol, type, date, shares, price, amount, profit }: {
  stockName: string; stockSymbol: string; type: 'buy' | 'sell';
  date: string; shares: number; price: number; amount: number; profit: number | null;
}) {
  return (
    <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-50 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${type === 'buy' ? 'bg-violet-100' : 'bg-emerald-50'}`}>
        <span className={`text-xs font-bold ${type === 'buy' ? 'text-violet-600' : 'text-emerald-600'}`}>{type === 'buy' ? '買' : '賣'}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-gray-800">{stockName}</span>
          <span className="text-xs text-gray-400">{stockSymbol}</span>
        </div>
        <p className="text-xs text-gray-400">{date} · {formatNumber(price)} × {shares} 股</p>
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

// ─── Single Stock Detail ──────────────────────────────────────────────────────

function fmtTime(d: Date) {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function StockDetail({ stock, settings, onUpdatePrice, onUpdateTarget, onSaveTx, onDeleteTx, onRefresh, isRefreshing, lastUpdated }: {
  stock: Stock;
  settings: AppSettings;
  onUpdatePrice: (id: string, price: number) => void;
  onUpdateTarget: (id: string, price: number) => void;
  onSaveTx: (type: 'buy' | 'sell', tx: BuyTransaction | SellTransaction) => void;
  onDeleteTx: (type: 'buy' | 'sell', txId: string) => void;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
  lastUpdated: Date | null;
}) {
  const [editingPrice, setEditingPrice] = useState(false);
  const [editingTarget, setEditingTarget] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [targetInput, setTargetInput] = useState('');
  const [editTx, setEditTx] = useState<{ type: 'buy' | 'sell'; tx: BuyTransaction | SellTransaction } | null>(null);
  const [txFilter, setTxFilter] = useState<'all' | 'buy' | 'sell'>('all');

  const avgCost = calcAvgCost(stock.buys);
  const remaining = calcRemainingShares(stock.buys, stock.sells);
  const totalInvested = calcTotalInvested(stock.buys);
  const realizedProfit = calcTotalRealizedProfit(stock.sells);
  const netProceeds = calcTotalNetProceeds(stock.sells);
  const unrealizedPL = remaining > 0 ? (stock.currentPrice - avgCost) * remaining : 0;
  const currentHoldingValue = remaining * stock.currentPrice;
  const totalPL = realizedProfit + unrealizedPL;

  const donutSegments = [
    { label: '買入成本', value: totalInvested - realizedProfit, color: '#6C63FF' },
    { label: '已實現損益', value: Math.abs(realizedProfit), color: realizedProfit >= 0 ? '#ef4444' : '#10b981' },
    ...(remaining > 0 ? [{ label: '未實現損益', value: Math.abs(unrealizedPL), color: unrealizedPL >= 0 ? '#f87171' : '#34d399' }] : []),
  ].filter((s) => s.value > 0);

  return (
    <div className="flex flex-col gap-5 px-5 pt-6 pb-32 lg:pb-10 lg:px-8 w-full">
      {/* Stock header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-violet-600">{stock.symbol}</span>
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-800">{stock.name}</h2>
          <p className="text-xs text-gray-400">{stock.symbol} · 個股分析</p>
        </div>
      </div>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[360px_1fr] lg:gap-6 lg:items-start">
      {/* Left: Balance card */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-gray-400">投入成本</p>
          <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
            totalPL >= 0 ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'
          }`}>
            {totalPL >= 0 ? <TrendUpIcon size={11} /> : <TrendDownIcon size={11} />}
            {totalPL >= 0 ? '+' : ''}{formatNTD(totalPL)}
          </div>
        </div>
        <p className="text-2xl font-bold text-gray-800">{formatNTD(totalInvested)}</p>
        <div className="flex items-center justify-center mt-4">
          <DonutChart
            segments={donutSegments}
            centerLabel={formatNTD(netProceeds + currentHoldingValue)}
            centerSub="總回收"
            size={180}
            strokeWidth={26}
          />
        </div>
        <div className="flex justify-center gap-5 mt-4">
          {donutSegments.map((seg) => (
            <div key={seg.label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: seg.color }} />
              <span className="text-xs text-gray-500">{seg.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right: stats + price + transactions */}
      <div className="flex flex-col gap-5">
      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="平均成本" value={formatNumber(avgCost)} sub="NT$/股" accent="violet" />
        <StatCard label="剩餘股數" value={`${remaining} 股`} sub={remaining > 0 ? '持有中' : '已清倉'} accent={remaining > 0 ? 'violet' : 'gray'} />
        <StatCard label="已實現損益" value={`${realizedProfit >= 0 ? '+' : ''}${formatNTD(realizedProfit)}`} sub="含手續費及稅" accent={realizedProfit === 0 ? 'gray' : realizedProfit > 0 ? 'red' : 'green'} />
        <StatCard label="可取得金額" value={formatNTD(netProceeds)} sub="賣出淨額" accent={netProceeds === 0 ? 'gray' : 'green'} />
        {remaining > 0 && (
          <StatCard label="未實現損益" value={`${unrealizedPL >= 0 ? '+' : ''}${formatNTD(unrealizedPL)}`} sub={`持有 ${remaining} 股`} accent={unrealizedPL === 0 ? 'gray' : unrealizedPL > 0 ? 'red' : 'green'} />
        )}
        <StatCard label="總投入" value={formatNTD(totalInvested)} sub="含手續費" accent="gray" />
      </div>

      {/* Target & current price */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <TargetIcon size={15} className="text-violet-500" /> 價格設定
          </h3>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 active:text-gray-600 disabled:opacity-40 transition-colors"
            aria-label="更新股價"
          >
            {lastUpdated && (
              <span className="text-[10px]">最後更新 {fmtTime(lastUpdated)}</span>
            )}
            <RefreshIcon size={13} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-gray-400 mb-1">目前股價</p>
            {editingPrice ? (
              <div className="flex gap-1">
                <input autoFocus type="number" value={priceInput} onChange={(e) => setPriceInput(e.target.value)}
                  className="w-full text-sm border border-violet-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-violet-200"
                  placeholder={String(stock.currentPrice)} />
                <button onClick={() => { const v = parseFloat(priceInput); if (!isNaN(v) && v > 0) onUpdatePrice(stock.id, v); setEditingPrice(false); }}
                  className="text-xs bg-violet-600 text-white px-2 py-1 rounded-lg">OK</button>
              </div>
            ) : (
              <button onClick={() => { setPriceInput(String(stock.currentPrice)); setEditingPrice(true); }}
                className="flex items-center gap-1 text-base font-bold text-gray-800 hover:text-violet-600 transition-colors">
                {formatPrice(stock.currentPrice)}
                <span className="text-[10px] text-gray-400 font-normal">點擊更新</span>
              </button>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">目標股價</p>
            {editingTarget ? (
              <div className="flex gap-1">
                <input autoFocus type="number" value={targetInput} onChange={(e) => setTargetInput(e.target.value)}
                  className="w-full text-sm border border-violet-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-violet-200"
                  placeholder={String(stock.targetPrice)} />
                <button onClick={() => { const v = parseFloat(targetInput); if (!isNaN(v) && v > 0) onUpdateTarget(stock.id, v); setEditingTarget(false); }}
                  className="text-xs bg-violet-600 text-white px-2 py-1 rounded-lg">OK</button>
              </div>
            ) : (
              <button onClick={() => { setTargetInput(String(stock.targetPrice)); setEditingTarget(true); }}
                className="flex items-center gap-1 text-base font-bold text-violet-600 hover:text-violet-800 transition-colors">
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
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">
            交易記錄 <span className="text-gray-400 font-normal text-xs">點擊可編輯</span>
          </h3>
          <div className="flex gap-0.5 bg-gray-100 rounded-xl p-1">
            {(['all', 'buy', 'sell'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setTxFilter(tab)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  txFilter === tab ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
                }`}
              >
                {tab === 'all' ? '全部' : tab === 'buy' ? '買入' : '賣出'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {[
            ...stock.sells.map((tx) => ({ type: 'sell' as const, date: tx.date, id: tx.id, tx })),
            ...stock.buys.map((tx)  => ({ type: 'buy'  as const, date: tx.date, id: tx.id, tx })),
          ]
            .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
            .filter((item) => txFilter === 'all' || item.type === txFilter)
            .map(({ type, tx }) =>
              type === 'sell' ? (
                <button
                  key={tx.id}
                  onClick={() => setEditTx({ type: 'sell', tx })}
                  className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-50 text-left w-full active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center">
                        <span className="text-xs font-bold text-emerald-600">賣</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{(tx as SellTransaction).date}</p>
                        <p className="text-xs text-gray-400">{formatNumber((tx as SellTransaction).price)} × {(tx as SellTransaction).shares} 股</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${(tx as SellTransaction).profit >= 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                        {(tx as SellTransaction).profit >= 0 ? '+' : ''}{formatNTD((tx as SellTransaction).profit)}
                      </p>
                      <p className="text-xs text-gray-400">淨額 {formatNTD((tx as SellTransaction).netProceeds)}</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-50 grid grid-cols-3 gap-2 text-center">
                    <MiniStat label="手續費" value={`-${formatNTD((tx as SellTransaction).fee)}`} />
                    <MiniStat label="交易稅" value={`-${formatNTD((tx as SellTransaction).tax)}`} />
                    <MiniStat label="可取得" value={formatNTD((tx as SellTransaction).netProceeds)} highlight />
                  </div>
                </button>
              ) : (
                <button
                  key={tx.id}
                  onClick={() => setEditTx({ type: 'buy', tx })}
                  className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-50 text-left w-full active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center">
                        <span className="text-xs font-bold text-violet-600">買</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{(tx as BuyTransaction).date}</p>
                        <p className="text-xs text-gray-400">{formatNumber((tx as BuyTransaction).price)} × {(tx as BuyTransaction).shares} 股</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-700">-{formatNTD((tx as BuyTransaction).price * (tx as BuyTransaction).shares + (tx as BuyTransaction).fee)}</p>
                      <p className="text-xs text-gray-400">含手續費</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-50 grid grid-cols-2 gap-2 text-center">
                    <MiniStat label="手續費" value={`-${formatNTD((tx as BuyTransaction).fee)}`} />
                    <MiniStat label="買入金額" value={formatNTD((tx as BuyTransaction).price * (tx as BuyTransaction).shares)} />
                  </div>
                </button>
              )
            )}
        </div>
      </div>

      </div>{/* end right column */}
      </div>{/* end lg grid */}

      {/* Edit transaction modal */}
      {editTx && (
        <EditTransactionModal
          stock={stock}
          txType={editTx.type}
          transaction={editTx.tx}
          avgCost={avgCost}
          settings={settings}
          onSave={(tx) => { onSaveTx(editTx.type, tx); }}
          onDelete={() => { onDeleteTx(editTx.type, editTx.tx.id); }}
          onClose={() => setEditTx(null)}
        />
      )}
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  const accentClass: Record<string, string> = {
    violet: 'text-violet-600', green: 'text-emerald-600', red: 'text-red-500', gray: 'text-gray-700',
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
