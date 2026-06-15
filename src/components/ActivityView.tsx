import { useState, useRef, useEffect } from 'react';
import SwipeableRow from './SwipeableRow';
import type { Stock, BuyTransaction, SellTransaction, AppSettings, Broker } from '../types';
import {
  calcAvgCost,
  calcRemainingShares,
  calcTotalInvested,
  calcTotalNetProceeds,
  calcExactRealizedProfit,
  formatNTD,
  formatNumber,
  formatPrice,
} from '../utils/calculations';
import DonutChart from './DonutChart';
import { TargetIcon, TrendUpIcon, TrendDownIcon, RefreshIcon, EditIcon, InfoCircleIcon } from './icons/Icons';
import EditTransactionModal from './EditTransactionModal';

interface ActivityViewProps {
  stocks: Stock[];
  selectedStockId: string | null;
  settings: AppSettings;
  priceHistory?: Record<string, number[]>;
  onBack: () => void;
  onSelectStock: (id: string) => void;
  onUpdateTarget: (stockId: string, price: number) => void;
  onSaveTx: (stockId: string, type: 'buy' | 'sell', tx: BuyTransaction | SellTransaction) => void;
  onDeleteTx: (stockId: string, type: 'buy' | 'sell', txId: string) => void;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
  lastUpdated: Date | null;
}

export default function ActivityView({ stocks, selectedStockId, settings, priceHistory, onBack, onSelectStock, onUpdateTarget, onSaveTx, onDeleteTx, onRefresh, isRefreshing, lastUpdated }: ActivityViewProps) {
  const stock = selectedStockId ? stocks.find((s) => s.id === selectedStockId) : null;

  if (stock) {
    return (
      <StockDetail
        stock={stock}
        settings={settings}
        marketHistory={priceHistory?.[stock.symbol]}
        onBack={onBack}
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

const PALETTE = ['#0EA5E9', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#0891b2', '#14b8a6', '#f97316'];

function PortfolioOverview({ stocks, onSelectStock }: { stocks: Stock[]; onSelectStock: (id: string) => void }) {
  const [txFilter, setTxFilter] = useState<'all' | 'buy' | 'sell'>('all');
  const [portfolioView, setPortfolioView] = useState<'holding' | 'cumulative'>('holding');
  const [hideAmounts, setHideAmounts] = useState(false);

  const PORTFOLIO_TABS = [
    { key: 'holding'    as const, label: '目前持倉' },
    { key: 'cumulative' as const, label: '累積績效' },
  ];
  const portfolioActiveIdx = PORTFOLIO_TABS.findIndex((t) => t.key === portfolioView);

  const displayStocks = portfolioView === 'holding'
    ? stocks.filter((s) => calcRemainingShares(s.buys, s.sells) > 0)
    : stocks;

  if (stocks.length === 0) {
    return (
      <div className="flex flex-col gap-5 px-5 pt-6 pb-32 lg:pb-10 lg:px-8 w-full">
        <h2 className="text-xl font-bold text-gray-800">投資分析</h2>
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
          <p className="text-sm font-semibold text-gray-700 mb-1">新增第一筆交易</p>
          <p className="text-xs text-gray-400">開始你的投資旅程</p>
        </div>
      </div>
    );
  }

  // Portfolio-wide totals — scoped to displayStocks
  const totalInvested = displayStocks.reduce((s, st) => s + calcTotalInvested(st.buys), 0);
  const totalRealized = displayStocks.reduce((s, st) => s + calcExactRealizedProfit(st.buys, st.sells), 0);
  const totalNetProceeds = displayStocks.reduce((s, st) => s + calcTotalNetProceeds(st.sells), 0);
  const totalUnrealized = displayStocks.reduce((s, st) => {
    const rem = calcRemainingShares(st.buys, st.sells);
    return s + (rem > 0 ? (st.currentPrice - calcAvgCost(st.buys)) * rem : 0);
  }, 0);
  const totalHoldingValue = displayStocks.reduce((s, st) => {
    const rem = calcRemainingShares(st.buys, st.sells);
    return s + rem * st.currentPrice;
  }, 0);
  // Ground-truth P&L: always correct regardless of when sells were recorded.
  // (totalRealized + totalUnrealized can drift when avgCost changed between sell events)
  const totalPL = totalNetProceeds + totalHoldingValue - totalInvested;

  // Donut: allocation by current holding value + net proceeds per stock
  const donutSegments = displayStocks
    .map((st, i) => {
      const rem = calcRemainingShares(st.buys, st.sells);
      const val = rem * st.currentPrice + calcTotalNetProceeds(st.sells);
      return { label: st.name, value: val, color: PALETTE[i % PALETTE.length] };
    })
    .filter((s) => s.value > 0);

  const centerValue = totalHoldingValue + totalNetProceeds;

  // All transactions sorted newest first — scoped to displayStocks
  const allTrades = displayStocks
    .flatMap((st) => [
      ...st.sells.map((tx) => ({ stockId: st.id, stockName: st.name, stockSymbol: st.symbol, type: 'sell' as const, date: tx.date, shares: tx.shares, price: tx.price, amount: tx.netProceeds, profit: tx.profit, id: tx.id })),
      ...st.buys.map((tx) => ({ stockId: st.id, stockName: st.name, stockSymbol: st.symbol, type: 'buy' as const, date: tx.date, shares: tx.shares, price: tx.price, amount: tx.price * tx.shares + tx.fee, profit: null, id: tx.id })),
    ])
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  return (
    <div className="flex flex-col gap-5 px-5 pt-6 pb-32 lg:pb-10 lg:px-8 w-full">
      <h2 className="text-xl font-bold text-gray-800">投資分析</h2>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[360px_1fr] lg:gap-6 lg:items-start">
        {/* Left: Tab + description + Summary card with donut */}
        <div className="flex flex-col gap-3">

        {/* Portfolio view tabs — sliding pill */}
        <div className="relative flex p-1 bg-gray-100 rounded-2xl">
          <div
            className="absolute top-1 bottom-1 bg-white rounded-xl shadow-sm transition-transform duration-300 ease-in-out"
            style={{
              width: `calc((100% - 8px) / ${PORTFOLIO_TABS.length})`,
              transform: `translateX(calc(${portfolioActiveIdx} * 100%))`,
              left: '4px',
            }}
          />
          {PORTFOLIO_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setPortfolioView(t.key)}
              className={`relative z-10 flex-1 py-2 rounded-xl text-sm font-semibold transition-colors duration-200 ${
                portfolioView === t.key ? 'text-gray-800' : 'text-gray-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Description */}
        <p className="text-[11px] text-gray-400 text-center -mt-1 px-1">
          {portfolioView === 'holding'
            ? '僅包含目前持有中的投資部分'
            : '僅包含持倉中與已清倉的所有投資'}
        </p>

        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-gray-400">總投入成本</p>
              <button
                onClick={() => setHideAmounts(v => !v)}
                className="text-gray-300 hover:text-gray-400 active:text-gray-500 transition-colors"
                aria-label={hideAmounts ? '顯示金額' : '隱藏金額'}
              >
                {hideAmounts ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
            <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
              totalPL >= 0 ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'
            }`}>
              {totalPL >= 0 ? <TrendUpIcon size={11} /> : <TrendDownIcon size={11} />}
              總損益 {hideAmounts ? '• • •' : `${totalPL > 0 ? '+' : ''}${formatNTD(totalPL)}`}
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {hideAmounts ? '$ • • • • • •' : formatNTD(totalInvested)}
          </p>

          {donutSegments.length > 0 && (
            <>
              <div className="flex items-center justify-center mt-4">
                <DonutChart
                  segments={donutSegments}
                  centerLabel={hideAmounts ? '• • • • • •' : formatNTD(centerValue)}
                  centerSub="總收付"
                  centerSub2="持倉 + 收付"
                  centerOffsetY={24}
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
        </div>{/* end left column */}

        {/* Right: stats + breakdown + history */}
        <div className="flex flex-col gap-5">
          {/* Portfolio stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard label="已實現損益" value={`${totalRealized > 0 ? '+' : ''}${formatNTD(totalRealized)}`} sub="含手續費及稅" accent={totalRealized === 0 ? 'gray' : totalRealized > 0 ? 'red' : 'green'} />
            <StatCard label="未實現損益" value={`${totalUnrealized > 0 ? '+' : ''}${formatNTD(totalUnrealized)}`} sub="按目前股價（未含賣出費用）" accent={totalUnrealized === 0 ? 'gray' : totalUnrealized > 0 ? 'red' : 'green'} tooltip="未含賣出時的手續費及交易稅，實際出售所得會略低於此數字" />
            <StatCard label="總回收金額" value={formatNTD(totalNetProceeds)} sub="實際入帳(賣出淨額合計)" accent={totalNetProceeds === 0 ? 'gray' : 'violet'} />
            <StatCard label="持倉市值" value={formatNTD(totalHoldingValue)} sub="按目前股價" accent="gray" />
            <StatCard label="總投入" value={formatNTD(totalInvested)} sub="含所有手續費" accent="gray" />
            <StatCard label="持股檔數" value={`${displayStocks.length} 檔`} sub={portfolioView === 'holding' ? '持倉中' : `${stocks.filter(s => calcRemainingShares(s.buys, s.sells) > 0).length} 檔持倉中`} accent="violet" />
          </div>

          {/* Per-stock breakdown */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">個股明細</h3>
            <div className="flex flex-col gap-2">
              {displayStocks.map((st, i) => (
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
                    <TradeTileRow key={`${tx.type}-${tx.id}`} {...tx} onClick={() => onSelectStock(tx.stockId)} />
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
  const invested = calcTotalInvested(stock.buys);
  const totalPL = calcTotalNetProceeds(stock.sells) + remaining * stock.currentPrice - invested;
  const isClosed = remaining === 0;
  const realizedProfit = calcExactRealizedProfit(stock.buys, stock.sells);
  // 已清倉顯示已實現損益＋已實現報酬率，持倉中顯示總損益
  const displayPL  = isClosed ? realizedProfit : totalPL;
  const plPct = invested > 0 ? (displayPL / invested) * 100 : 0;

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
            <p className={`text-sm font-bold ${displayPL >= 0 ? 'text-red-500' : 'text-emerald-600'}`}>
              {displayPL > 0 ? '+' : ''}{formatNTD(displayPL)}
            </p>
            <p className={`text-xs ${displayPL >= 0 ? 'text-red-400' : 'text-emerald-500'}`}>
              {displayPL > 0 ? '+' : ''}{plPct.toFixed(2)}%
            </p>
          </div>
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          <div>
            <p className="text-[10px] text-gray-400">平均成本</p>
            <p className="text-xs font-semibold text-gray-600">{formatPrice(avgCost)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400">剩餘股數</p>
            <p className={`text-xs font-semibold ${isClosed ? 'text-gray-400' : 'text-primary-600'}`}>
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

function TradeTileRow({ stockName, stockSymbol, type, date, shares, price, amount, profit, onClick }: {
  stockName: string; stockSymbol: string; type: 'buy' | 'sell';
  date: string; shares: number; price: number; amount: number; profit: number | null;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="w-full bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-50 flex items-center gap-3 text-left active:scale-[0.98] transition-transform">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${type === 'buy' ? 'bg-primary-100' : 'bg-emerald-50'}`}>
        <span className={`text-xs font-bold ${type === 'buy' ? 'text-primary-600' : 'text-emerald-600'}`}>{type === 'buy' ? '買' : '賣'}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-gray-800">{stockName}</span>
          <span className="text-xs text-gray-400">{stockSymbol}</span>
        </div>
        <p className="text-xs text-gray-400">{date} · {formatNumber(price)} × {shares} 股</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-gray-700">
          {type === 'sell' ? '' : '-'}{formatNTD(amount)}
        </p>
        {profit !== null && (
          <p className={`text-xs font-medium ${profit >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
            損益 {profit > 0 ? '+' : ''}{formatNTD(profit)}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Single Stock Detail ──────────────────────────────────────────────────────

function fmtTime(d: Date) {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function StockDetail({ stock, settings, marketHistory, onBack, onUpdateTarget, onSaveTx, onDeleteTx, onRefresh, isRefreshing, lastUpdated }: {
  stock: Stock;
  settings: AppSettings;
  marketHistory?: number[];
  onBack: () => void;
  onUpdateTarget: (id: string, price: number) => void;
  onSaveTx: (type: 'buy' | 'sell', tx: BuyTransaction | SellTransaction) => void;
  onDeleteTx: (type: 'buy' | 'sell', txId: string) => void;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
  lastUpdated: Date | null;
}) {

  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState('');
  const [editTx, setEditTx] = useState<{ type: 'buy' | 'sell'; tx: BuyTransaction | SellTransaction } | null>(null);
  const [txFilter,     setTxFilter]     = useState<'all' | 'buy' | 'sell'>('all');
  const [showPLInfo,        setShowPLInfo]        = useState(false);
  const [showRealizedInfo,  setShowRealizedInfo]  = useState(false);
  const [showUnrealizedInfo,setShowUnrealizedInfo]= useState(false);
  const [showInvestedInfo,  setShowInvestedInfo]  = useState(false);
  const [showMarketValInfo, setShowMarketValInfo] = useState(false);
  const [brokerFilter, setBrokerFilter] = useState<string>('all'); // 'all' or brokerId

  // Broker chips — only show when this stock has txs from >1 broker
  const usedBrokerIds = new Set([
    ...stock.buys.map((b) => b.brokerId).filter(Boolean),
    ...stock.sells.map((s) => s.brokerId).filter(Boolean),
  ]) as Set<string>;
  const brokerOptions = settings.brokers.filter((b) => usedBrokerIds.has(b.id));
  const showBrokerFilter = brokerOptions.length > 1;

  const avgCost = calcAvgCost(stock.buys);
  const remaining = calcRemainingShares(stock.buys, stock.sells);
  const isClosed = remaining === 0 && stock.buys.length > 0;
  const totalInvested = calcTotalInvested(stock.buys);
  const realizedProfit = calcExactRealizedProfit(stock.buys, stock.sells);
  const netProceeds = calcTotalNetProceeds(stock.sells);
  const currentHoldingValue = remaining * stock.currentPrice;

  // 持有天數 (first buy → last sell), only meaningful when closed
  const firstBuyDate = isClosed && stock.buys.length > 0  ? stock.buys.map((b) => b.date).sort()[0]                : null;
  const lastSellDate = isClosed && stock.sells.length > 0 ? stock.sells.map((s) => s.date).sort().reverse()[0]    : null;
  const holdingDays  = firstBuyDate && lastSellDate
    ? Math.max(0, Math.round((new Date(lastSellDate).getTime() - new Date(firstBuyDate).getTime()) / 86400000))
    : 0;
  // 格式化日期為 YYYY/MM/DD
  const fmtShort = (d: string) => d.replace(/-/g, '/'); // "2025-04-17" → "2025/04/17"
  // Ground-truth P&L: total receipts + current holding value − total paid
  // This is always accurate regardless of when buys/sells were recorded.
  const totalPL = netProceeds + currentHoldingValue - totalInvested;
  // Derive unrealized from the ground truth so the three values always sum correctly.
  const unrealizedPL = remaining > 0 ? totalPL - realizedProfit : 0;
  const plPct = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
  // 已清倉：Hero 改顯示「已實現損益」與「已實現報酬率」
  const realizedPct    = totalInvested > 0 ? (realizedProfit / totalInvested) * 100 : 0;
  const heroDisplayPL  = isClosed ? realizedProfit : totalPL;
  const heroDisplayPct = isClosed ? realizedPct : plPct;
  const isProfit = heroDisplayPL > 0;

  // Today's change — based on last historical close vs current price
  const sparklinePrices = marketHistory?.length ? [...marketHistory, stock.currentPrice] : undefined;
  const prevClose = marketHistory?.length ? marketHistory[marketHistory.length - 1] : null;
  const todayChangePerShare = prevClose !== null ? stock.currentPrice - prevClose : null;
  const todayChangeTotal = todayChangePerShare !== null && remaining > 0 ? todayChangePerShare * remaining : null;
  const todayChangePct = todayChangePerShare !== null && prevClose ? (todayChangePerShare / prevClose) * 100 : null;

  return (
    <div className="flex flex-col gap-5 px-5 pt-6 pb-32 lg:pb-10 lg:px-8 w-full">
      {/* Stock header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
          aria-label="返回"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-800">{stock.name}</h2>
          <span className="inline-flex items-center bg-primary-100 text-primary-600 text-[11px] font-bold rounded-full px-2.5 py-0.5 mt-1">
            {stock.symbol}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[360px_1fr] lg:gap-6 lg:items-start">
      {/* Hero card — gradient */}
      <div className="rounded-3xl overflow-hidden shadow-lg" style={{ background: 'linear-gradient(135deg, var(--hero-from) 0%, var(--hero-to) 100%)' }}>
        {/* Top: P&L */}
        <div className="p-5">
          {/* Row 1: label + today badge */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <button
              onClick={() => setShowPLInfo(true)}
              className="flex items-center gap-1.5 active:opacity-70 transition-opacity"
            >
              <p className="text-sm text-white/70 font-medium">{isClosed ? '已實現損益' : '總損益'}</p>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="rgba(255,255,255,0.45)">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <circle cx="12" cy="8" r="1" fill="rgba(255,255,255,0.45)" stroke="none" />
              </svg>
            </button>
            {todayChangeTotal !== null && todayChangePct !== null && (
              <div className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white/20 text-white whitespace-nowrap">
                今日 {todayChangeTotal >= 0 ? '+' : ''}{formatNTD(todayChangeTotal)} ({todayChangePct >= 0 ? '+' : ''}{todayChangePct.toFixed(2)}%)
              </div>
            )}
          </div>

          {/* Row 2: P&L number — full width, responsive font size */}
          <p className={`font-bold tracking-tight leading-none ${heroDisplayPL === 0 ? 'text-white' : isProfit ? 'text-red-400' : 'text-emerald-300'}`}
            style={{ fontSize: 'clamp(1.75rem, 9vw, 2.25rem)' }}>
            {heroDisplayPL > 0 ? '+' : ''}{formatNTD(heroDisplayPL)}
          </p>

          {/* Row 3: [percentage + pill] left, sparkline right */}
          <div className="flex items-start justify-between mt-1">
            <div>
              <p className={`text-xl font-semibold ${heroDisplayPL === 0 ? 'text-white/60' : isProfit ? 'text-red-400' : 'text-emerald-300'}`}>
                {heroDisplayPct > 0 ? '+' : ''}{heroDisplayPct.toFixed(2)}%
              </p>
              <div className="mt-2 inline-flex items-center gap-1.5 bg-white rounded-full px-3 py-1.5">
                {isClosed ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span className="text-sm font-semibold text-gray-500">已清倉</span>
                  </>
                ) : totalPL === 0 ? (
                  <span className="text-sm font-semibold text-gray-500">持平</span>
                ) : isProfit ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                    </svg>
                    <span className="text-sm font-semibold text-red-500">獲利中</span>
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" />
                    </svg>
                    <span className="text-sm font-semibold text-emerald-600">虧損中</span>
                  </>
                )}
              </div>
            </div>
            {sparklinePrices && sparklinePrices.length > 1 && (
              <HeroSparkline prices={sparklinePrices} />
            )}
          </div>
        </div>

        {/* Bottom: 2×2 stats grid */}
        <div className="border-t border-white/20">
          <div className="grid grid-cols-2">
            {/* Top-left: 已清倉→總回收金額 / 持倉→已實現損益 */}
            {isClosed ? (
              <div className="pt-[9px] pb-1.5 px-4">
                <p className="text-[11px] text-white/60 mb-0.5">總回收金額</p>
                <p className="text-lg font-bold text-white">{formatNTD(netProceeds)}</p>
              </div>
            ) : (
              <div className="pt-[9px] pb-1.5 px-4">
                <button onClick={() => setShowRealizedInfo(true)} className="flex items-center gap-1 active:opacity-70 transition-opacity mb-0.5">
                  <span className="text-[11px] text-white/60">已實現損益</span>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="rgba(255,255,255,0.35)"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><circle cx="12" cy="8" r="1" fill="rgba(255,255,255,0.35)" stroke="none" /></svg>
                </button>
                <p className={`text-lg font-bold ${realizedProfit === 0 ? 'text-white/80' : realizedProfit > 0 ? 'text-red-400' : 'text-emerald-300'}`}>
                  {realizedProfit > 0 ? '+' : ''}{formatNTD(realizedProfit)}
                </p>
              </div>
            )}
            {/* Top-right: 已清倉→持有天數 / 持倉→未實現損益 */}
            {isClosed ? (
              <div className="pt-[9px] pb-1.5 px-4">
                <p className="text-[11px] text-white/60 mb-0.5">持有天數</p>
                <p className="text-lg font-bold text-white">{holdingDays} 天</p>
              </div>
            ) : (
              <div className="pt-[9px] pb-1.5 px-4">
                <button onClick={() => setShowUnrealizedInfo(true)} className="flex items-center gap-1 active:opacity-70 transition-opacity mb-0.5">
                  <span className="text-[11px] text-white/60">未實現損益</span>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="rgba(255,255,255,0.35)"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><circle cx="12" cy="8" r="1" fill="rgba(255,255,255,0.35)" stroke="none" /></svg>
                </button>
                <p className={`text-lg font-bold ${unrealizedPL === 0 ? 'text-white/80' : unrealizedPL > 0 ? 'text-red-400' : 'text-emerald-300'}`}>
                  {unrealizedPL > 0 ? '+' : ''}{formatNTD(unrealizedPL)}
                </p>
              </div>
            )}
            {/* Bottom-left: 總投入成本（所有情況相同） */}
            <div className="pt-1.5 pb-[9px] px-4">
              <button onClick={() => setShowInvestedInfo(true)} className="flex items-center gap-1 active:opacity-70 transition-opacity mb-0.5">
                <span className="text-[11px] text-white/60">總投入成本(含手續費)</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="rgba(255,255,255,0.35)"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><circle cx="12" cy="8" r="1" fill="rgba(255,255,255,0.35)" stroke="none" /></svg>
              </button>
              <p className="text-base font-bold text-white">{formatNTD(totalInvested)}</p>
            </div>
            {/* Bottom-right: 已清倉→時間區間 / 持倉→目前市值 */}
            {isClosed ? (
              <div className="pt-1.5 pb-[9px] px-4">
                <p className="text-[11px] text-white/60 mb-0.5">時間區間</p>
                <p className="text-xs font-bold text-white whitespace-nowrap">
                  {firstBuyDate ? fmtShort(firstBuyDate) : '—'}<span className="text-white/60">-</span>{lastSellDate ? fmtShort(lastSellDate) : '—'}
                </p>
              </div>
            ) : (
              <div className="pt-1.5 pb-[9px] px-4">
                <button onClick={() => setShowMarketValInfo(true)} className="flex items-center gap-1 active:opacity-70 transition-opacity mb-0.5">
                  <span className="text-[11px] text-white/60">目前市值</span>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="rgba(255,255,255,0.35)"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><circle cx="12" cy="8" r="1" fill="rgba(255,255,255,0.35)" stroke="none" /></svg>
                </button>
                <p className="text-base font-bold text-white">{formatNTD(currentHoldingValue)}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: stats + price + transactions */}
      <div className="flex flex-col gap-5">
      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="平均成本" value={formatPrice(avgCost)} sub="NT$/股" accent="violet" />
        <StatCard label="剩餘股數" value={`${remaining} 股`} sub={remaining > 0 ? '持有中' : '已清倉'} accent={remaining > 0 ? 'violet' : 'gray'} />
        <StatCard label="已實現損益" value={`${realizedProfit > 0 ? '+' : ''}${formatNTD(realizedProfit)}`} sub="含手續費及稅" accent={realizedProfit === 0 ? 'gray' : realizedProfit > 0 ? 'red' : 'green'} />
        <StatCard label="總回收金額" value={formatNTD(netProceeds)} sub="實際入帳(賣出淨額)" accent={netProceeds === 0 ? 'gray' : 'violet'} />
        {remaining > 0 && (
          <StatCard label="未實現損益" value={`${unrealizedPL > 0 ? '+' : ''}${formatNTD(unrealizedPL)}`} sub={`持有 ${remaining} 股`} accent={unrealizedPL === 0 ? 'gray' : unrealizedPL > 0 ? 'red' : 'green'} tooltip="未含賣出時的手續費及交易稅，實際出售所得會略低於此數字" />
        )}
        <StatCard label="總投入" value={formatNTD(totalInvested)} sub="含手續費" accent="gray" />
      </div>

      {/* Target & current price */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <TargetIcon size={15} className="text-primary-500" /> 價格設定
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
            <p className="text-base font-bold text-gray-800">{formatPrice(stock.currentPrice)}</p>
            {lastUpdated && (
              <p className="text-[10px] text-gray-400 mt-0.5">已更新 {fmtTime(lastUpdated)}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">目標股價</p>
            {editingTarget ? (
              <div className="flex gap-1">
                <input autoFocus type="number" value={targetInput} onChange={(e) => setTargetInput(e.target.value)}
                  className="w-full text-sm border border-primary-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-primary-200"
                  placeholder="輸入目標價" />
                <button onClick={() => { const v = parseFloat(targetInput); if (!isNaN(v) && v > 0) onUpdateTarget(stock.id, v); setEditingTarget(false); }}
                  className="text-xs bg-primary-600 text-white px-2 py-1 rounded-lg">OK</button>
              </div>
            ) : (
              <button onClick={() => { setTargetInput(stock.targetPrice > 0 ? String(stock.targetPrice) : ''); setEditingTarget(true); }}
                className="flex items-center gap-1.5 text-base font-bold text-primary-600 hover:text-primary-700 transition-colors">
                {stock.targetPrice > 0 ? formatNumber(stock.targetPrice) : <span className="text-base font-bold text-primary-600">0</span>}
                <EditIcon size={13} className="text-primary-500" />
              </button>
            )}
          </div>
        </div>
        {stock.targetPrice > 0 && (
          stock.currentPrice >= stock.targetPrice ? (
            <div className="mt-3 text-xs bg-emerald-50 text-emerald-700 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <TrendUpIcon size={12} /> 目前股價已達目標！
            </div>
          ) : (
            <div className="mt-3 text-xs bg-primary-50 text-primary-700 rounded-lg px-3 py-2">
              距離目標還差 <strong>{formatNumber(stock.targetPrice - stock.currentPrice)}</strong> 元（{(((stock.targetPrice - stock.currentPrice) / stock.currentPrice) * 100).toFixed(1)}%）
            </div>
          )
        )}
      </div>

      {/* Transaction history */}
      <div>
        <div className="flex items-center justify-between mb-2">
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

        {/* Broker filter chips — only shown when stock has txs from multiple brokers */}
        {showBrokerFilter && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 mb-3">
            <button
              onClick={() => setBrokerFilter('all')}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                brokerFilter === 'all'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              全部券商
            </button>
            {brokerOptions.map((b) => (
              <button
                key={b.id}
                onClick={() => setBrokerFilter(b.id)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  brokerFilter === b.id
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {[
            ...stock.sells.map((tx) => ({ type: 'sell' as const, date: tx.date, id: tx.id, tx })),
            ...stock.buys.map((tx)  => ({ type: 'buy'  as const, date: tx.date, id: tx.id, tx })),
          ]
            .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
            .filter((item) => txFilter === 'all' || item.type === txFilter)
            .filter((item) => brokerFilter === 'all' || item.tx.brokerId === brokerFilter)
            .map(({ type, tx }) =>
              type === 'sell' ? (
                <SwipeableRow
                  key={tx.id}
                  onDelete={() => onDeleteTx('sell', tx.id)}
                  onEdit={() => setEditTx({ type: 'sell', tx })}
                  confirmMessage="確定要刪除這筆賣出紀錄嗎？刪除後損益將重新計算。"
                >
                <button
                  onClick={() => setEditTx({ type: 'sell', tx })}
                  className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-50 text-left w-full active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center">
                        <span className="text-xs font-bold text-emerald-600">賣</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">成交價 ${formatNumber((tx as SellTransaction).price)} × {(tx as SellTransaction).shares} 股</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-[11px] text-gray-400">{(tx as SellTransaction).date}</p>
                          <BrokerTag brokerId={(tx as SellTransaction).brokerId} brokers={settings.brokers} />
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${(tx as SellTransaction).profit >= 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                        {(tx as SellTransaction).profit > 0 ? '+' : ''}{formatNTD((tx as SellTransaction).profit)}
                      </p>
                      <p className="text-xs text-gray-400">淨額 {formatNTD((tx as SellTransaction).netProceeds)}</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-50 grid grid-cols-3 gap-2 text-center">
                    <MiniStat label="手續費" value={`-${formatNTD((tx as SellTransaction).fee)}`} />
                    <MiniStat label="交易稅" value={`-${formatNTD((tx as SellTransaction).tax)}`} />
                    <MiniStat label="可取得" value={formatNTD((tx as SellTransaction).netProceeds)} />
                  </div>
                </button>
                </SwipeableRow>
              ) : (() => {
                const buyTx = tx as BuyTransaction;
                const isImported = !!buyTx.imported;
                const totalCost = isImported
                  ? Math.round(buyTx.price * buyTx.shares)
                  : buyTx.price * buyTx.shares + buyTx.fee;
                return (
                  <SwipeableRow
                    key={tx.id}
                    onDelete={() => onDeleteTx('buy', tx.id)}
                    onEdit={() => setEditTx({ type: 'buy', tx })}
                    confirmMessage="確定要刪除這筆買入紀錄嗎？刪除後損益將重新計算。"
                  >
                  <button
                    onClick={() => setEditTx({ type: 'buy', tx })}
                    className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-50 text-left w-full active:scale-[0.99] transition-transform"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isImported ? 'bg-blue-100' : 'bg-primary-100'}`}>
                          <span className={`text-xs font-bold ${isImported ? 'text-blue-600' : 'text-primary-600'}`}>{isImported ? '匯' : '買'}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">
                            {isImported ? `均價 $${formatNumber(buyTx.price)} × ${buyTx.shares} 股` : `成交價 $${formatNumber(buyTx.price)} × ${buyTx.shares} 股`}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-[11px] text-gray-400">{buyTx.date}</p>
                            <BrokerTag brokerId={buyTx.brokerId} brokers={settings.brokers} />
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-700">-{formatNTD(totalCost)}</p>
                        <p className="text-xs text-gray-400">{isImported ? '已含費用' : '含手續費'}</p>
                      </div>
                    </div>
                    {isImported ? (
                      <div className="mt-2 pt-2 border-t border-gray-50 grid grid-cols-3 gap-2 text-center">
                        <MiniStat label="買入均價/股" value={formatNumber(buyTx.price)} />
                        <MiniStat label="持有股數" value={`${buyTx.shares} 股`} />
                        <MiniStat label="買入成本金額" value={formatNTD(totalCost)} />
                      </div>
                    ) : (
                      <div className="mt-2 pt-2 border-t border-gray-50 grid grid-cols-2 gap-2 text-center">
                        <MiniStat label="手續費" value={`-${formatNTD(buyTx.fee)}`} />
                        <MiniStat label="買入金額" value={formatNTD(buyTx.price * buyTx.shares)} />
                      </div>
                    )}
                  </button>
                  </SwipeableRow>
                );
              })()
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

      {/* 已實現損益 info modal */}
      {showRealizedInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={() => setShowRealizedInfo(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--hero-from), var(--hero-to))' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-gray-800">已實現損益 說明</h3>
              </div>
              <button onClick={() => setShowRealizedInfo(false)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="bg-primary-50 rounded-2xl px-4 py-3 mb-4">
              <p className="text-xs text-primary-500 font-medium mb-1.5">計算公式</p>
              <p className="text-sm font-semibold text-primary-800 leading-relaxed">
                已實現損益 ＝ 賣出淨額<br />
                　　　　　－ 賣出部位的買入成本
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <div className="w-1.5 rounded-full bg-primary-400 flex-shrink-0 mt-1 self-start" style={{ height: '14px' }} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">賣出淨額</p>
                  <p className="text-xs text-gray-400 mt-0.5">賣出金額扣除手續費與交易稅後的實際入帳金額</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-1.5 rounded-full bg-gray-300 flex-shrink-0 mt-1 self-start" style={{ height: '14px' }} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">賣出部位的買入成本</p>
                  <p className="text-xs text-gray-400 mt-0.5">每次賣出時，依當下平均買入成本計算該筆賣出部位的持倉成本</p>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-4 pt-4 border-t border-gray-100">
              僅統計已完成賣出的交易，反映實際已鎖定的獲利或虧損，不含目前持倉的未實現部分
            </p>
          </div>
        </div>
      )}

      {/* 未實現損益 info modal */}
      {showUnrealizedInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={() => setShowUnrealizedInfo(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--hero-from), var(--hero-to))' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-gray-800">未實現損益 說明</h3>
              </div>
              <button onClick={() => setShowUnrealizedInfo(false)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="bg-primary-50 rounded-2xl px-4 py-3 mb-4">
              <p className="text-xs text-primary-500 font-medium mb-1.5">計算公式</p>
              <p className="text-sm font-semibold text-primary-800 leading-relaxed">
                未實現損益 ＝ 總損益 － 已實現損益
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <div className="w-1.5 rounded-full bg-primary-400 flex-shrink-0 mt-1 self-start" style={{ height: '14px' }} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">目前持倉的浮動損益</p>
                  <p className="text-xs text-gray-400 mt-0.5">以目前市值推算，尚未賣出即尚未鎖定的損益金額</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-1.5 rounded-full bg-amber-300 flex-shrink-0 mt-1 self-start" style={{ height: '14px' }} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">注意：未含賣出成本</p>
                  <p className="text-xs text-gray-400 mt-0.5">實際賣出時須扣除手續費與交易稅，實際入帳會略低於此數字</p>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-4 pt-4 border-t border-gray-100">
              確保「已實現損益 ＋ 未實現損益 ＝ 總損益」恆成立
            </p>
          </div>
        </div>
      )}

      {/* 總投入成本 info modal */}
      {showInvestedInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={() => setShowInvestedInfo(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--hero-from), var(--hero-to))' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-gray-800">總投入成本 說明</h3>
              </div>
              <button onClick={() => setShowInvestedInfo(false)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="bg-primary-50 rounded-2xl px-4 py-3 mb-4">
              <p className="text-xs text-primary-500 font-medium mb-1.5">計算公式</p>
              <p className="text-sm font-semibold text-primary-800 leading-relaxed">
                總投入成本 ＝ Σ（每筆買入金額<br />
                　　　　　＋ 買入手續費）
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <div className="w-1.5 rounded-full bg-primary-400 flex-shrink-0 mt-1 self-start" style={{ height: '14px' }} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">包含所有買入交易</p>
                  <p className="text-xs text-gray-400 mt-0.5">不論已賣出或仍持有，所有買入紀錄的金額與手續費均計入</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-1.5 rounded-full bg-gray-300 flex-shrink-0 mt-1 self-start" style={{ height: '14px' }} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">損益計算基準</p>
                  <p className="text-xs text-gray-400 mt-0.5">總損益以此為基準計算，反映你實際付出的總成本</p>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-4 pt-4 border-t border-gray-100">
              含手續費確保損益計算準確，避免低估實際成本
            </p>
          </div>
        </div>
      )}

      {/* 目前市值 info modal */}
      {showMarketValInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={() => setShowMarketValInfo(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--hero-from), var(--hero-to))' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-gray-800">目前市值 說明</h3>
              </div>
              <button onClick={() => setShowMarketValInfo(false)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="bg-primary-50 rounded-2xl px-4 py-3 mb-4">
              <p className="text-xs text-primary-500 font-medium mb-1.5">計算公式</p>
              <p className="text-sm font-semibold text-primary-800 leading-relaxed">
                目前市值 ＝ 剩餘股數 × 目前股價
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <div className="w-1.5 rounded-full bg-primary-400 flex-shrink-0 mt-1 self-start" style={{ height: '14px' }} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">剩餘股數</p>
                  <p className="text-xs text-gray-400 mt-0.5">所有買入股數扣除已賣出股數後的目前持倉量</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-1.5 rounded-full bg-primary-400 flex-shrink-0 mt-1 self-start" style={{ height: '14px' }} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">目前股價</p>
                  <p className="text-xs text-gray-400 mt-0.5">系統最後取得的股價，可手動更新或待自動刷新</p>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-4 pt-4 border-t border-gray-100">
              反映目前持倉的即時估值，用於計算未實現損益與總損益
            </p>
          </div>
        </div>
      )}

      {/* P&L info modal */}
      {showPLInfo && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={() => setShowPLInfo(false)}
        >
          <div
            className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--hero-from), var(--hero-to))' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                    <polyline points="17 6 23 6 23 12" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-gray-800">{isClosed ? '已實現損益' : '總損益'} 說明</h3>
              </div>
              <button
                onClick={() => setShowPLInfo(false)}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {isClosed ? (
              <>
                <div className="bg-primary-50 rounded-2xl px-4 py-3 mb-4">
                  <p className="text-xs text-primary-500 font-medium mb-1.5">計算公式</p>
                  <p className="text-sm font-semibold text-primary-800 leading-relaxed">
                    已實現損益 ＝ 賣出淨額合計<br />
                    　　　　　－ 已賣出持股成本
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <div className="w-1.5 rounded-full bg-primary-400 flex-shrink-0 mt-1 self-start" style={{ height: '14px' }} />
                    <div>
                      <p className="text-xs font-semibold text-gray-700">賣出淨額合計</p>
                      <p className="text-xs text-gray-400 mt-0.5">賣出金額扣除手續費與交易稅後實際入帳金額</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-1.5 rounded-full bg-gray-300 flex-shrink-0 mt-1 self-start" style={{ height: '14px' }} />
                    <div>
                      <p className="text-xs font-semibold text-gray-700">已賣出持股成本</p>
                      <p className="text-xs text-gray-400 mt-0.5">每次賣出時，依當下平均買入成本計算該筆賣出部位的成本</p>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 mt-4 pt-4 border-t border-gray-100">
                  僅統計已完成賣出的交易，反映實際已鎖定的獲利或虧損
                </p>
              </>
            ) : (
              <>
                <div className="bg-primary-50 rounded-2xl px-4 py-3 mb-4">
                  <p className="text-xs text-primary-500 font-medium mb-1.5">計算公式</p>
                  <p className="text-sm font-semibold text-primary-800 leading-relaxed">
                    總損益 ＝ 實際入帳(賣出淨額合計)<br />
                    　　　＋ 目前持倉市值<br />
                    　　　－ 總投入成本
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <div className="w-1.5 rounded-full bg-primary-400 flex-shrink-0 mt-1 self-start" style={{ height: '14px' }} />
                    <div>
                      <p className="text-xs font-semibold text-gray-700">實際入帳(賣出淨額合計)</p>
                      <p className="text-xs text-gray-400 mt-0.5">所有已賣出股票扣除手續費與交易稅後的實際入帳金額</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-1.5 rounded-full bg-primary-400 flex-shrink-0 mt-1 self-start" style={{ height: '14px' }} />
                    <div>
                      <p className="text-xs font-semibold text-gray-700">目前持倉市值</p>
                      <p className="text-xs text-gray-400 mt-0.5">剩餘股數 × 目前股價，反映尚未賣出的部位當前價值</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-1.5 rounded-full bg-gray-300 flex-shrink-0 mt-1 self-start" style={{ height: '14px' }} />
                    <div>
                      <p className="text-xs font-semibold text-gray-700">總投入成本</p>
                      <p className="text-xs text-gray-400 mt-0.5">所有買入金額含手續費，為計算損益的基準</p>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 mt-4 pt-4 border-t border-gray-100">
                  此公式確保「已實現損益 ＋ 未實現損益 ＝ 總損益」恆成立
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Hero sparkline ──────────────────────────────────────────────────────────

function HeroSparkline({ prices }: { prices: number[] }) {
  const w = 136;
  const h = 68;
  const pad = 5;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const pts = prices.map((p, i) => ({
    x: pad + (i / (prices.length - 1)) * (w - pad * 2),
    y: pad + (1 - (p - min) / range) * (h - pad * 2),
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const fillPath = `${linePath} L${pts[pts.length - 1].x},${h} L${pts[0].x},${h} Z`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.25" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill="url(#heroGrad)" />
      <path d={linePath} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((pt, i) => (
        <circle
          key={i}
          cx={pt.x}
          cy={pt.y}
          r={i === pts.length - 1 ? 4 : 2}
          fill="white"
          opacity={i === pts.length - 1 ? 1 : 0.55}
        />
      ))}
    </svg>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent, tooltip }: { label: string; value: string; sub: string; accent: string; tooltip?: string }) {
  const [showTip, setShowTip] = useState(false);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showTip) return;
    function handleOutside(e: MouseEvent) {
      if (tipRef.current && !tipRef.current.contains(e.target as Node)) setShowTip(false);
    }
    document.addEventListener('click', handleOutside);
    return () => document.removeEventListener('click', handleOutside);
  }, [showTip]);

  const accentClass: Record<string, string> = {
    violet: 'text-primary-600', green: 'text-emerald-600', red: 'text-red-500', gray: 'text-gray-700',
  };
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center gap-1 mb-1">
        <p className="text-xs text-gray-400">{label}</p>
        {tooltip && (
          <div className="relative" ref={tipRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowTip(v => !v); }}
              className="flex items-center text-gray-300 hover:text-gray-400 active:text-gray-500"
            >
              <InfoCircleIcon size={12} />
            </button>
            {showTip && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 bg-gray-800 text-white text-xs leading-relaxed rounded-xl px-3 py-2.5 z-50 shadow-lg pointer-events-none">
                {tooltip}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
              </div>
            )}
          </div>
        )}
      </div>
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

function BrokerTag({ brokerId, brokers }: { brokerId?: string; brokers: Broker[] }) {
  if (!brokerId || brokers.length <= 1) return null;
  const name = brokers.find((b) => b.id === brokerId)?.name;
  if (!name) return null;
  return (
    <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full leading-none">
      {name}
    </span>
  );
}
