import { useState, useEffect, useRef } from 'react';
import type { Stock, AppSettings } from '../types';
import {
  calcAvgCost,
  calcRemainingShares,
  calcExactRealizedProfit,
  calcTotalNetProceeds,
  calcTotalInvested,
  formatNTD,
  formatPrice,
} from '../utils/calculations';
import { BellIcon, SearchIcon, RefreshIcon } from './icons/Icons';

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
  priceHistory: Record<string, number[]>;
}

export default function HomeView({ stocks, settings, onStockClick, onViewAllHoldings, onViewAllActivity, onBellClick, onVisibleStocksChange, hasUnread, onAddClick, onRefresh, isRefreshing, priceHistory }: HomeViewProps) {
  const [showPortfolioInfo,  setShowPortfolioInfo]  = useState(false);
  const [showRealizedInfo,   setShowRealizedInfo]   = useState(false);
  const [showCumulativeInfo, setShowCumulativeInfo] = useState(false);
  const [showProceedsInfo,   setShowProceedsInfo]   = useState(false);
  const [isAmountHidden,     setIsAmountHidden]     = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');

  // ── Portfolio calculations ──────────────────────────────────────────────────
  const totalInvested    = stocks.reduce((s, st) => s + calcTotalInvested(st.buys), 0);
  const realizedProfit   = stocks.reduce((s, st) => s + calcExactRealizedProfit(st.buys, st.sells), 0);
  const totalProceeds    = stocks.reduce((s, st) => s + calcTotalNetProceeds(st.sells), 0);
  const totalCurrentValue = stocks.reduce((acc, st) => {
    const rem = calcRemainingShares(st.buys, st.sells);
    return acc + rem * st.currentPrice;
  }, 0);
  // Ground-truth P&L (same formula as ActivityView / ProfileView)
  const cumulativePL     = totalProceeds + totalCurrentValue - totalInvested;
  const realizedReturn   = totalInvested > 0 ? (realizedProfit / totalInvested) * 100 : 0;
  const cumulativeReturn = totalInvested > 0 ? (cumulativePL  / totalInvested) * 100 : 0;

  // Date range across all sell transactions
  const allSellDates = stocks.flatMap((s) => s.sells.map((tx) => tx.date)).sort();
  const firstSell    = allSellDates[0] ?? null;
  const lastSell     = allSellDates[allSellDates.length - 1] ?? null;

  // Portfolio aggregate sparkline (holding stocks only)
  const portfolioSparkline = (() => {
    const hs = stocks.filter((s) => calcRemainingShares(s.buys, s.sells) > 0);
    if (!hs.length) return [] as number[];
    const lens = hs.map((s) => (priceHistory[s.symbol] ?? []).length).filter((l) => l > 0);
    if (!lens.length) return [] as number[];
    const minLen = Math.min(...lens);
    if (minLen < 2) return [] as number[];
    const pts: number[] = [];
    for (let i = 0; i < minLen; i++) {
      let v = 0;
      for (const s of hs) {
        const h = priceHistory[s.symbol];
        if (h && i < h.length) v += calcRemainingShares(s.buys, s.sells) * h[i];
      }
      pts.push(v);
    }
    pts.push(totalCurrentValue);
    return pts;
  })();

  // ── Stock tab ──────────────────────────────────────────────────────────────
  const [stockTab, setStockTab] = useState<'holding' | 'closed'>('holding');
  const STOCK_TABS = [
    { key: 'holding' as const, label: '我的持股' },
    { key: 'closed'  as const, label: '已完成投資' },
  ];
  const stockTabIdx     = STOCK_TABS.findIndex((t) => t.key === stockTab);
  const holdingStocks   = stocks.filter((s) => calcRemainingShares(s.buys, s.sells) > 0);
  const closedStocks    = stocks.filter((s) => calcRemainingShares(s.buys, s.sells) === 0 && s.buys.length > 0);
  const displayedStocks = stockTab === 'holding' ? holdingStocks : closedStocks;

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
  }, [stocks, onVisibleStocksChange, stockTab]);

  const allTrades = stocks.flatMap((stock) => [
    ...stock.sells.map((tx) => ({
      key: `sell-${tx.id}`,
      stockId: stock.id, symbol: stock.symbol, name: stock.name, type: 'sell' as const,
      date: tx.date, shares: tx.shares, amount: tx.netProceeds, profit: tx.profit,
    })),
    ...stock.buys.map((tx) => ({
      key: `buy-${tx.id}`,
      stockId: stock.id, symbol: stock.symbol, name: stock.name, type: 'buy' as const,
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

      {/* Portfolio Hero Card */}
      <div
        className="rounded-3xl overflow-hidden shadow-lg"
        style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}
      >
        {/* Top: label + value + sparkline */}
        <div className="p-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setShowPortfolioInfo(true)}
              className="flex items-center gap-1.5 active:opacity-70 transition-opacity"
            >
              <p className="text-sm text-white/70 font-medium">投資組合價值</p>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/>
                <circle cx="12" cy="8" r="1" fill="rgba(255,255,255,0.45)" stroke="none"/>
              </svg>
            </button>
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="opacity-60 hover:opacity-100 active:opacity-100 disabled:opacity-30 transition-opacity"
              aria-label="更新股價"
            >
              <RefreshIcon size={15} className={`text-white ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Left 65%: value + eye toggle */}
            <div className="flex items-center gap-2 min-w-0" style={{ flex: '0 0 65%' }}>
              <p
                className="font-bold text-white tracking-tight leading-none"
                style={{ fontSize: 'clamp(1.5rem, 8vw, 2.25rem)' }}
              >
                {isAmountHidden ? '$ • • • • • •' : formatNTD(totalCurrentValue)}
              </p>
              <button
                onClick={() => setIsAmountHidden(!isAmountHidden)}
                className="flex-shrink-0 opacity-50 hover:opacity-90 active:opacity-90 transition-opacity"
                aria-label={isAmountHidden ? '顯示金額' : '隱藏金額'}
              >
                {isAmountHidden ? (
                  // Eye-off
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  // Eye
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
            {/* Right 35%: sparkline */}
            <div style={{ flex: '0 0 35%' }}>
              {portfolioSparkline.length > 1 && (
                <PortfolioSparkline prices={portfolioSparkline} isUp={cumulativePL >= 0} />
              )}
            </div>
          </div>
        </div>

        {/* Bottom: 3-col stats */}
        <div>
          <div className="flex">
            {/* 已實現損益 */}
            <div className="flex-1 pt-3 pb-3.5 px-3">
              <button
                onClick={() => setShowRealizedInfo(true)}
                className="flex items-center gap-1 mb-1.5 active:opacity-70 transition-opacity"
              >
                <p className="text-[10px] text-white/60 leading-none">已實現損益</p>
                <HeroInfoIcon />
              </button>
              <p className={`text-sm font-bold leading-none ${realizedProfit === 0 ? 'text-white/80' : realizedProfit > 0 ? 'text-red-400' : 'text-emerald-300'}`}>
                {realizedProfit > 0 ? '+' : ''}{formatNTD(realizedProfit)}
              </p>
              <p className="text-[10px] text-white/50 mt-1 leading-none">
                ({realizedReturn > 0 ? '+' : ''}{realizedReturn.toFixed(2)}%)
              </p>
            </div>

            <div className="w-px bg-white/15 my-3 flex-shrink-0" />

            {/* 累積總損益 */}
            <div className="flex-1 pt-3 pb-3.5 px-3">
              <button
                onClick={() => setShowCumulativeInfo(true)}
                className="flex items-center gap-1 mb-1.5 active:opacity-70 transition-opacity"
              >
                <p className="text-[10px] text-white/60 leading-none">累積總損益</p>
                <HeroInfoIcon />
              </button>
              <p className={`text-sm font-bold leading-none ${cumulativePL === 0 ? 'text-white/80' : cumulativePL > 0 ? 'text-red-400' : 'text-emerald-300'}`}>
                {cumulativePL > 0 ? '+' : ''}{formatNTD(cumulativePL)}
              </p>
              <p className="text-[10px] text-white/50 mt-1 leading-none">
                ({cumulativeReturn > 0 ? '+' : ''}{cumulativeReturn.toFixed(2)}%)
              </p>
            </div>

            <div className="w-px bg-white/15 my-3 flex-shrink-0" />

            {/* 總回收金額 */}
            <div className="flex-1 pt-3 pb-3.5 px-3">
              <button
                onClick={() => setShowProceedsInfo(true)}
                className="flex items-center gap-1 mb-1.5 active:opacity-70 transition-opacity"
              >
                <p className="text-[10px] text-white/60 leading-none">總回收金額</p>
                <HeroInfoIcon />
              </button>
              <p className="text-sm font-bold text-white leading-none">
                {formatNTD(totalProceeds)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Holdings + Recent: side-by-side on desktop */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
        {/* 我的投資 */}
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800">我的投資</h2>
            <div className="flex items-center gap-2">
              {/* View mode toggle */}
              <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
                <button
                  onClick={() => setViewMode('card')}
                  className={`p-1.5 rounded-md transition-colors ${viewMode === 'card' ? 'bg-white shadow-sm text-violet-600' : 'text-gray-400'}`}
                  aria-label="卡片檢視"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-violet-600' : 'text-gray-400'}`}
                  aria-label="列表檢視"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                    <circle cx="3" cy="6" r="1" fill="currentColor" stroke="none"/>
                    <circle cx="3" cy="12" r="1" fill="currentColor" stroke="none"/>
                    <circle cx="3" cy="18" r="1" fill="currentColor" stroke="none"/>
                  </svg>
                </button>
              </div>
              {displayedStocks.length > 0 && (
                <button
                  onClick={onViewAllHoldings}
                  className="text-xs text-violet-600 font-medium hover:text-violet-800 transition-colors"
                >
                  查看全部
                </button>
              )}
            </div>
          </div>

          {/* Sliding tabs */}
          <div className="relative flex p-1 bg-gray-100 rounded-2xl mb-3">
            <div
              className="absolute top-1 bottom-1 bg-white rounded-xl shadow-sm transition-transform duration-300 ease-in-out"
              style={{
                width: `calc((100% - 8px) / ${STOCK_TABS.length})`,
                transform: `translateX(calc(${stockTabIdx} * 100%))`,
                left: '4px',
              }}
            />
            {STOCK_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setStockTab(t.key)}
                className={`relative z-10 flex-1 py-2 rounded-xl text-sm font-semibold transition-colors duration-200 ${
                  stockTab === t.key ? 'text-gray-800' : 'text-gray-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          {stocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center bg-white rounded-2xl shadow-sm border border-gray-50">
              <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" />
                  <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                  <line x1="12" y1="12" x2="12" y2="16" /><line x1="10" y1="14" x2="14" y2="14" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-700">尚未建立投資組合</p>
            </div>
          ) : displayedStocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center bg-white rounded-2xl shadow-sm border border-gray-50">
              <p className="text-sm font-semibold text-gray-700 mb-1">
                {stockTab === 'holding' ? '目前無持倉中股票' : '尚無已清倉的投資'}
              </p>
              <p className="text-xs text-gray-400">
                {stockTab === 'holding' ? '新增買入交易以開始追蹤' : '完成賣出後將顯示於此'}
              </p>
            </div>
          ) : viewMode === 'list' ? (
            <div ref={containerRef} className="bg-white rounded-2xl shadow-sm border border-gray-50 overflow-hidden">
              {displayedStocks.map((stock) => (
                <StockListRow key={stock.id} stock={stock} onClick={() => onStockClick(stock.id)} />
              ))}
            </div>
          ) : (
            <div
              ref={containerRef}
              className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 lg:grid lg:grid-cols-2 lg:overflow-visible"
            >
              {displayedStocks.map((stock) => (
                <StockCard key={stock.id} stock={stock} onClick={() => onStockClick(stock.id)} carousel={displayedStocks.length > 2} marketHistory={priceHistory[stock.symbol]} />
              ))}
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800">最近交易</h2>
            {allTrades.length > 0 && (
              <button
                onClick={onViewAllActivity}
                className="text-xs text-violet-600 font-medium hover:text-violet-800 transition-colors"
              >
                查看全部
              </button>
            )}
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
              {allTrades.map(({ key, stockId, ...tx }, idx) => (
                <div key={key} className={idx >= 5 ? 'hidden lg:block' : undefined}>
                  <RecentItem {...tx} onClick={() => onStockClick(stockId)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* ── 投資組合價值 modal ──────────────────────────────────────────────── */}
      {showPortfolioInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={() => setShowPortfolioInfo(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                  </svg>
                </div>
                <h3 className="text-base font-bold text-gray-800">投資組合價值 說明</h3>
              </div>
              <ModalCloseBtn onClose={() => setShowPortfolioInfo(false)} />
            </div>
            <div className="bg-violet-50 rounded-2xl px-4 py-3 mb-4">
              <p className="text-xs text-violet-500 font-medium mb-1.5">計算方式</p>
              <p className="text-sm font-semibold text-violet-800 leading-relaxed">
                持有股數 × 目前股價<br />
                （依各持倉股票加總）
              </p>
            </div>
            <div className="flex flex-col gap-3 mb-4">
              <div className="flex gap-3">
                <div className="w-1.5 rounded-full bg-violet-400 flex-shrink-0 self-start mt-1" style={{ height: '14px' }} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">目前持倉市值</p>
                  <p className="text-xs text-gray-400 mt-0.5">每支持倉股票的剩餘股數乘以目前股價，加總得出整體投資組合市值</p>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl px-3 py-2.5">
              <p className="text-xs font-semibold text-gray-600 mb-1.5">不包含</p>
              <div className="flex flex-col gap-1">
                {['已清倉投資', '已實現損益', '總回收金額'].map((item) => (
                  <div key={item} className="flex items-center gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" />
                    <p className="text-xs text-gray-500">{item}</p>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-4 pt-4 border-t border-gray-100">此數值會隨市場即時股價變動</p>
          </div>
        </div>
      )}

      {/* ── 已實現損益 modal ────────────────────────────────────────────────── */}
      {showRealizedInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={() => setShowRealizedInfo(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <h3 className="text-base font-bold text-gray-800">已實現損益 說明</h3>
              </div>
              <ModalCloseBtn onClose={() => setShowRealizedInfo(false)} />
            </div>
            <div className="bg-violet-50 rounded-2xl px-4 py-3 mb-4">
              <p className="text-xs text-violet-500 font-medium mb-1.5">定義</p>
              <p className="text-sm font-semibold text-violet-800 leading-relaxed">
                已完成賣出交易所產生的<br />
                獲利或虧損總和
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <div className="w-1.5 rounded-full bg-violet-400 flex-shrink-0 self-start mt-1" style={{ height: '14px' }} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">計算基準</p>
                  <p className="text-xs text-gray-400 mt-0.5">賣出淨額 − (賣出股數 × 平均成本)</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-1.5 rounded-full bg-gray-300 flex-shrink-0 self-start mt-1" style={{ height: '14px' }} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">已扣除費用</p>
                  <p className="text-xs text-gray-400 mt-0.5">包含手續費與交易稅，為實際入帳後的真實損益</p>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-4 pt-4 border-t border-gray-100">僅統計已完成賣出的交易，持倉中的損益不計入</p>
          </div>
        </div>
      )}

      {/* ── 累積總損益 modal ────────────────────────────────────────────────── */}
      {showCumulativeInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={() => setShowCumulativeInfo(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
                  </svg>
                </div>
                <h3 className="text-base font-bold text-gray-800">累積總損益 說明</h3>
              </div>
              <ModalCloseBtn onClose={() => setShowCumulativeInfo(false)} />
            </div>
            <div className="bg-violet-50 rounded-2xl px-4 py-3 mb-4">
              <p className="text-xs text-violet-500 font-medium mb-1.5">計算公式</p>
              <p className="text-sm font-semibold text-violet-800 leading-relaxed">
                累積總損益 ＝ 已實現損益<br />
                　　　　　＋ 未實現損益
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <div className="w-1.5 rounded-full bg-violet-400 flex-shrink-0 self-start mt-1" style={{ height: '14px' }} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">已實現損益</p>
                  <p className="text-xs text-gray-400 mt-0.5">已完成賣出交易的實際損益，扣除手續費與稅</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-1.5 rounded-full bg-indigo-400 flex-shrink-0 self-start mt-1" style={{ height: '14px' }} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">未實現損益</p>
                  <p className="text-xs text-gray-400 mt-0.5">目前持倉的帳面損益，依即時股價計算</p>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-4 pt-4 border-t border-gray-100">此為整體投資組合的完整損益指標</p>
          </div>
        </div>
      )}

      {/* ── 總回收金額 modal ────────────────────────────────────────────────── */}
      {showProceedsInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={() => setShowProceedsInfo(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                  </svg>
                </div>
                <h3 className="text-base font-bold text-gray-800">總回收金額 說明</h3>
              </div>
              <ModalCloseBtn onClose={() => setShowProceedsInfo(false)} />
            </div>
            <div className="bg-violet-50 rounded-2xl px-4 py-3 mb-4">
              <p className="text-xs text-violet-500 font-medium mb-1.5">定義</p>
              <p className="text-sm font-semibold text-violet-800 leading-relaxed">
                所有賣出交易的賣出淨額總和
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <div className="w-1.5 rounded-full bg-violet-400 flex-shrink-0 self-start mt-1" style={{ height: '14px' }} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">計算方式</p>
                  <p className="text-xs text-gray-400 mt-0.5">賣出金額扣除手續費與交易稅後實際入帳的金額，加總所有賣出交易</p>
                </div>
              </div>
              {firstSell && (
                <div className="flex gap-3">
                  <div className="w-1.5 rounded-full bg-gray-300 flex-shrink-0 self-start mt-1" style={{ height: '14px' }} />
                  <div>
                    <p className="text-xs font-semibold text-gray-700">時間區間</p>
                    <p className="text-xs text-gray-400 mt-0.5">{firstSell} ～ {lastSell}</p>
                  </div>
                </div>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-4 pt-4 border-t border-gray-100">與損益不同，此為實際回到帳戶的現金總額</p>
          </div>
        </div>
      )}

    </div>
  );
}

function StockCard({ stock, onClick, carousel = false, marketHistory }: { stock: Stock; onClick: () => void; carousel?: boolean; marketHistory?: number[] }) {
  const avgCost        = calcAvgCost(stock.buys);
  const remaining      = calcRemainingShares(stock.buys, stock.sells);
  const invested       = calcTotalInvested(stock.buys);
  const netProceeds    = calcTotalNetProceeds(stock.sells);
  const realizedProfit = calcExactRealizedProfit(stock.buys, stock.sells);
  const holdingVal     = remaining * stock.currentPrice;
  const totalPL        = netProceeds + holdingVal - invested;
  const isClosed       = remaining === 0;
  // 已清倉顯示已實現損益，持倉中顯示總損益
  const displayPL      = isClosed ? realizedProfit : totalPL;
  const displayPct     = invested > 0 ? (displayPL / invested) * 100 : 0;
  const isUp           = displayPL > 0;
  const isZero         = displayPL === 0;

  // Sparkline: prefer real market history (+ live price as final point),
  // fall back to transaction prices while history is loading.
  const chartPrices = (() => {
    if (marketHistory && marketHistory.length > 1) {
      // Append current price so chart always ends at today's value
      const last = marketHistory[marketHistory.length - 1];
      return last === stock.currentPrice
        ? marketHistory
        : [...marketHistory, stock.currentPrice];
    }
    // Fallback: transaction prices sorted by date
    return [
      ...stock.buys.map( b => ({ d: b.date, p: b.price })),
      ...stock.sells.map(s => ({ d: s.date, p: s.price })),
    ].sort((a, b) => a.d.localeCompare(b.d)).map(t => t.p);
  })();

  // Chart colour based on market trend (first vs last price), not P&L
  const chartIsUp = chartPrices.length > 1
    ? chartPrices[chartPrices.length - 1] >= chartPrices[0]
    : isUp || isZero;

  return (
    <button
      data-stock-id={stock.id}
      onClick={onClick}
      className={`bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left active:scale-[0.98] transition-transform ${
        carousel ? 'min-w-[44%] flex-shrink-0 lg:min-w-0 lg:w-full' : 'min-w-[210px] flex-shrink-0'
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
            {isUp ? '+' : ''}{formatNTD(displayPL)}
          </p>
          <p className={`text-[11px] font-medium mt-0.5 ${isZero ? 'text-gray-600' : isUp ? 'text-red-400' : 'text-emerald-500'}`}>
            {isZero ? '0%' : `${isUp ? '+' : ''}${displayPct.toFixed(2)}%`}
          </p>
        </div>
        <MiniChart prices={chartPrices} isUp={chartIsUp} />
      </div>

      {/* Info grid */}
      <div className="mt-3 pt-3 border-t border-gray-50 grid grid-cols-2 gap-y-2">
        {remaining === 0 ? (
          <>
            <div>
              <p className="text-[10px] text-gray-400">已實現損益</p>
              <p className={`text-xs font-semibold ${realizedProfit > 0 ? 'text-red-500' : realizedProfit < 0 ? 'text-emerald-600' : 'text-gray-700'}`}>
                {realizedProfit > 0 ? '+' : ''}{formatNTD(realizedProfit)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">總投入</p>
              <p className="text-xs font-semibold text-gray-700">{formatNTD(invested)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">總回收</p>
              <p className="text-xs font-semibold text-gray-700">{formatNTD(netProceeds)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">狀態</p>
              <span className="inline-block text-[10px] font-semibold bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">已清倉</span>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </button>
  );
}

function StockListRow({ stock, onClick }: { stock: Stock; onClick: () => void }) {
  const remaining      = calcRemainingShares(stock.buys, stock.sells);
  const invested       = calcTotalInvested(stock.buys);
  const netProceeds    = calcTotalNetProceeds(stock.sells);
  const realizedProfit = calcExactRealizedProfit(stock.buys, stock.sells);
  const holdingVal     = remaining * stock.currentPrice;
  const totalPL        = netProceeds + holdingVal - invested;
  const isClosed       = remaining === 0;
  // 已清倉顯示已實現損益，持倉中顯示總損益
  const displayPL      = isClosed ? realizedProfit : totalPL;
  const displayPct     = invested > 0 ? (displayPL / invested) * 100 : 0;
  const isUp           = displayPL > 0;
  const isZero         = displayPL === 0;

  return (
    <button
      data-stock-id={stock.id}
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-50 last:border-b-0 active:bg-gray-50 transition-colors"
    >
      <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
        <span className="text-[9px] font-bold text-violet-600 leading-tight text-center px-0.5">{stock.symbol}</span>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{stock.name}</p>
        <p className="text-[10px] text-gray-400 mt-0.5 truncate">
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

      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
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

function RecentItem({ symbol, name, type, date, shares, amount, profit, onClick }: {
  symbol: string; name: string; type: 'buy' | 'sell';
  date: string; shares: number; amount: number; profit: number | null;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-50 text-left active:scale-[0.98] transition-transform">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
        type === 'buy' ? 'bg-violet-100' : 'bg-emerald-50'
      }`}>
        <span className={`text-sm font-bold ${type === 'buy' ? 'text-violet-600' : 'text-emerald-600'}`}>
          {type === 'buy' ? '買' : '賣'}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-gray-400 leading-none mb-0.5">{symbol}</p>
        <p className="text-sm font-semibold text-gray-800">{name}</p>
        <p className="text-xs text-gray-400">{date} · {shares} 股</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-gray-700">
          {type === 'sell' ? '' : '-'}{formatNTD(amount)}
        </p>
        {profit !== null && (
          <p className={`text-xs font-medium ${profit >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
            損益 {profit >= 0 ? '+' : ''}{formatNTD(profit)}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Hero card helpers ────────────────────────────────────────────────────────

function HeroInfoIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/>
      <circle cx="12" cy="8" r="1" fill="rgba(255,255,255,0.4)" stroke="none"/>
    </svg>
  );
}

function ModalCloseBtn({ onClose }: { onClose: () => void }) {
  return (
    <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 active:bg-gray-200">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  );
}

function PortfolioSparkline({ prices, isUp }: { prices: number[]; isUp: boolean }) {
  const color = isUp ? '#fb923c' : '#34d399';
  const w = 120, h = 58, pad = 4;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const pts = prices.map((p, i) => ({
    x: pad + (i / (prices.length - 1)) * (w - pad * 2),
    y: pad + (1 - (p - min) / range) * (h - pad * 2),
  }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const fill = `${line} L${pts[pts.length - 1].x},${h} L${pts[0].x},${h} Z`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="pgGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#pgGrad)"/>
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
