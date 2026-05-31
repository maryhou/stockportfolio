import { useState, useRef } from 'react';
import type { Stock, AppSettings } from '../types';
import {
  calcRemainingShares,
  calcTotalRealizedProfit,
  calcTotalNetProceeds,
  calcTotalInvested,
  formatNTD,
} from '../utils/calculations';
import { SettingsIcon } from './icons/Icons';

interface ProfileViewProps {
  stocks: Stock[];
  settings: AppSettings;
  onSettingsClick: () => void;
  onImport: (stocks: Stock[]) => void;
  onClearAll: () => void;
}

export default function ProfileView({ stocks, settings, onSettingsClick, onImport, onClearAll }: ProfileViewProps) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showPLInfo,       setShowPLInfo]       = useState(false);
  const [showReturnInfo,   setShowReturnInfo]   = useState(false);
  const [importError, setImportError]   = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalInvested = stocks.reduce((s, st) => s + calcTotalInvested(st.buys), 0);
  const totalCurrentValue = stocks.reduce((s, st) => {
    const rem = calcRemainingShares(st.buys, st.sells);
    return s + rem * st.currentPrice;
  }, 0);
  const totalNetProceeds = stocks.reduce((s, st) => s + calcTotalNetProceeds(st.sells), 0);
  // Ground-truth P&L: receipts + current holdings − total paid
  const totalPL = totalNetProceeds + totalCurrentValue - totalInvested;
  const cumulativeReturn = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  // Best trade by highest realized profit amount
  const bestTrade = stocks
    .filter((s) => s.sells.length > 0)
    .map((s) => ({
      name:     s.name,
      symbol:   s.symbol,
      profit:   calcTotalRealizedProfit(s.sells),
      isClosed: calcRemainingShares(s.buys, s.sells) === 0,
    }))
    .sort((a, b) => b.profit - a.profit)[0] ?? null;

  // Investment stats
  const totalTrades  = stocks.reduce((s, st) => s + st.buys.length + st.sells.length, 0);
  const holdingCount = stocks.filter((s) => calcRemainingShares(s.buys, s.sells) > 0).length;
  const closedCount  = stocks.filter((s) => calcRemainingShares(s.buys, s.sells) === 0 && s.buys.length > 0).length;

  // ── Settings display ───────────────────────────────────────────────────────
  const taxPct       = (settings.taxRate * 100).toFixed(2).replace(/\.?0+$/, '');
  const avatarLetter = settings.userName.charAt(0).toUpperCase();

  // ── Export ─────────────────────────────────────────────────────────────────
  function handleExport() {
    const blob = new Blob([JSON.stringify(stocks, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `stock-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Import ─────────────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as Stock[];
        if (!Array.isArray(data)) throw new Error('格式錯誤');
        onImport(data);
      } catch {
        setImportError('匯入失敗：檔案格式不正確');
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported
    e.target.value = '';
  }

  return (
    <div className="flex flex-col gap-5 px-5 pt-6 pb-32 lg:pb-10 lg:px-8 w-full">
      {/* Header */}
      <div className="flex items-center justify-end">
        <button
          onClick={onSettingsClick}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 active:bg-gray-200 transition-colors"
        >
          <SettingsIcon size={18} />
        </button>
      </div>

      {/* Avatar */}
      <div className="flex flex-col items-center gap-3 py-2">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center text-3xl font-bold text-white shadow-lg">
          {avatarLetter}
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-800">{settings.userName}</h2>
          <p className="text-sm text-gray-400">股票投資追蹤</p>
        </div>
      </div>

      {/* ── 我的投資成績 ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <p className="text-sm font-bold text-gray-800 mb-4">我的投資成績</p>
        <div className="grid grid-cols-3">
          {/* 總損益 */}
          <div className="pr-4">
            <button onClick={() => setShowPLInfo(true)} className="flex items-center gap-1 mb-2 active:opacity-60 transition-opacity">
              <p className="text-xs text-gray-400">總損益</p>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/>
                <circle cx="12" cy="8" r="1" fill="#d1d5db" stroke="none"/>
              </svg>
            </button>
            <p className={`text-lg font-bold leading-tight tabular-nums ${
              totalPL === 0 ? 'text-gray-700' : totalPL > 0 ? 'text-red-500' : 'text-emerald-600'
            }`}>
              {totalPL > 0 ? '+' : ''}{formatNTD(totalPL)}
            </p>
          </div>

          {/* 累積報酬率 */}
          <div className="px-4 border-l border-gray-100">
            <button onClick={() => setShowReturnInfo(true)} className="flex items-center gap-1 mb-2 active:opacity-60 transition-opacity">
              <p className="text-xs text-gray-400">累積報酬率</p>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/>
                <circle cx="12" cy="8" r="1" fill="#d1d5db" stroke="none"/>
              </svg>
            </button>
            <p className={`text-lg font-bold leading-tight ${
              cumulativeReturn === 0 ? 'text-gray-700' : cumulativeReturn > 0 ? 'text-red-500' : 'text-emerald-600'
            }`}>
              {cumulativeReturn > 0 ? '+' : ''}{cumulativeReturn.toFixed(2)}%
            </p>
            <p className="text-[10px] text-gray-400 mt-1">基於總投入計算</p>
          </div>

          {/* 最佳交易 */}
          <div className="pl-4 border-l border-gray-100">
            <div className="flex items-center gap-1.5 mb-2">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke={bestTrade && bestTrade.profit > 0 ? '#f59e0b' : '#d1d5db'}
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1h3"/>
                <path d="M18 9h2a2 2 0 0 0 2-2V5a1 1 0 0 0-1-1h-3"/>
                <path d="M6 4h12v6a6 6 0 0 1-12 0V4z"/>
                <path d="M12 16v4"/><path d="M9 20h6"/>
              </svg>
              <p className="text-xs text-gray-400">最佳交易</p>
            </div>
            {bestTrade ? (
              <>
                <p className="text-xs font-semibold text-gray-700 leading-tight truncate">{bestTrade.name}</p>
                <p className={`text-lg font-bold leading-tight ${bestTrade.profit >= 0 ? 'text-amber-500' : 'text-emerald-600'}`}>
                  {bestTrade.profit > 0 ? '+' : ''}{formatNTD(bestTrade.profit)}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">{bestTrade.symbol} · {bestTrade.isClosed ? '已清倉' : '持倉中'}</p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-gray-300 leading-tight">—</p>
                <p className="text-[10px] text-gray-400 mt-0.5">尚無賣出記錄</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── 投資統計 ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <p className="text-sm font-bold text-gray-800 mb-4">投資統計</p>
        <div className="grid grid-cols-3 gap-2">
          {/* 投資紀錄 */}
          <div className="flex flex-col items-center gap-1.5 text-center">
            <div className="w-10 h-10 rounded-full bg-violet-50 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
                <rect x="9" y="3" width="6" height="4" rx="1"/>
                <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="12" y2="16"/>
              </svg>
            </div>
            <p className="text-xl font-bold text-gray-800">{totalTrades}</p>
            <div>
              <p className="text-xs font-semibold text-gray-600">投資紀錄</p>
              <p className="text-[10px] text-gray-400">總交易筆數</p>
            </div>
          </div>

          {/* 持有中 */}
          <div className="flex flex-col items-center gap-1.5 text-center">
            <div className="w-10 h-10 rounded-full bg-violet-50 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>
                <path d="M22 12A10 10 0 0 0 12 2v10z"/>
              </svg>
            </div>
            <p className="text-xl font-bold text-gray-800">{holdingCount}</p>
            <div>
              <p className="text-xs font-semibold text-gray-600">持有中</p>
              <p className="text-[10px] text-gray-400">目前持有檔數</p>
            </div>
          </div>

          {/* 已清倉 */}
          <div className="flex flex-col items-center gap-1.5 text-center">
            <div className="w-10 h-10 rounded-full bg-violet-50 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="12 8 12 12 14 14"/>
                <path d="M3.05 11a9 9 0 1 0 .5-4.5"/>
                <polyline points="3 3 3 7 7 7"/>
              </svg>
            </div>
            <p className="text-xl font-bold text-gray-800">{closedCount}</p>
            <div>
              <p className="text-xs font-semibold text-gray-600">已清倉</p>
              <p className="text-[10px] text-gray-400">歷史投資檔數</p>
            </div>
          </div>

        </div>
      </div>

      {/* 費用計算說明 */}
      <div className="bg-violet-50 rounded-2xl p-4">
        <p className="text-xs font-semibold text-violet-700 mb-3">費用計算說明</p>
        <div className="flex flex-col gap-2">
          {settings.brokers.map((broker) => {
            const eff  = (broker.feeRate * broker.feeDiscount * 100).toFixed(4);
            const rate = (broker.feeRate * 100).toFixed(4).replace(/\.?0+$/, '');
            const zhe  = (broker.feeDiscount * 10).toFixed(1);
            return (
              <div key={broker.id} className="bg-violet-100/60 rounded-xl px-3 py-2">
                <p className="text-xs font-semibold text-violet-700 mb-0.5">{broker.name}</p>
                <p className="text-xs text-violet-600">手續費：{rate}% × {zhe}折 = 有效 {eff}%</p>
              </div>
            );
          })}
          <div className="text-xs text-violet-600 mt-1 flex flex-col gap-0.5">
            <p>· 交易稅：賣出金額 × {taxPct}%</p>
            <p>· 損益 = 總回收金額 − 平均成本 × 股數</p>
          </div>
        </div>
      </div>

      {/* 資料管理 */}
      <Section title="資料管理">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* 匯出 */}
          <button
            onClick={handleExport}
            className="w-full flex items-center justify-between px-4 py-4 active:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-800">匯出資料</p>
                <p className="text-xs text-gray-400">下載 JSON 備份檔</p>
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>

          <div className="h-px bg-gray-50 mx-4" />

          {/* 匯入 */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-between px-4 py-4 active:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-800">匯入資料</p>
                <p className="text-xs text-gray-400">從 JSON 備份檔還原</p>
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
          {importError && <p className="text-xs text-red-500 px-4 pb-3">{importError}</p>}

          <div className="h-px bg-gray-50 mx-4" />

          {/* 清空資料 */}
          <button
            onClick={() => setShowClearConfirm(true)}
            className="w-full flex items-center justify-between px-4 py-4 active:bg-red-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-red-600">清空所有交易資料</p>
                <p className="text-xs text-gray-400">無法復原，請謹慎操作</p>
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      </Section>

      {/* ── 總損益 info modal ─────────────────────────────────────────────── */}
      {showPLInfo && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={() => setShowPLInfo(false)}
        >
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
                  </svg>
                </div>
                <h3 className="text-base font-bold text-gray-800">總損益 說明</h3>
              </div>
              <button onClick={() => setShowPLInfo(false)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 active:bg-gray-200">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="bg-violet-50 rounded-2xl px-4 py-3 mb-4">
              <p className="text-xs text-violet-500 font-medium mb-1.5">計算公式</p>
              <p className="text-sm font-semibold text-violet-800 leading-relaxed">
                總損益 ＝ 實際入帳(賣出淨額合計)<br />
                　　　＋ 目前持倉市值<br />
                　　　－ 總投入成本
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <div className="w-1.5 rounded-full bg-violet-400 flex-shrink-0 self-start mt-1" style={{ height: '14px' }} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">實際入帳(賣出淨額合計)</p>
                  <p className="text-xs text-gray-400 mt-0.5">所有已賣出股票扣除手續費與交易稅後的實際入帳金額</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-1.5 rounded-full bg-indigo-400 flex-shrink-0 self-start mt-1" style={{ height: '14px' }} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">目前持倉市值</p>
                  <p className="text-xs text-gray-400 mt-0.5">剩餘股數 × 目前股價，反映尚未賣出的部位當前價值</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-1.5 rounded-full bg-gray-300 flex-shrink-0 self-start mt-1" style={{ height: '14px' }} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">總投入成本</p>
                  <p className="text-xs text-gray-400 mt-0.5">所有買入金額含手續費，為計算損益的基準</p>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-4 pt-4 border-t border-gray-100">
              此公式確保「已實現損益 ＋ 未實現損益 ＝ 總損益」恆成立
            </p>
          </div>
        </div>
      )}

      {/* ── 累積報酬率 info modal ──────────────────────────────────────────── */}
      {showReturnInfo && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={() => setShowReturnInfo(false)}
        >
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23"/>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                  </svg>
                </div>
                <h3 className="text-base font-bold text-gray-800">累積報酬率 說明</h3>
              </div>
              <button onClick={() => setShowReturnInfo(false)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 active:bg-gray-200">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="bg-violet-50 rounded-2xl px-4 py-3 mb-4">
              <p className="text-xs text-violet-500 font-medium mb-1.5">計算公式</p>
              <p className="text-sm font-semibold text-violet-800 leading-relaxed">
                累積報酬率 ＝ 總損益 ÷ 總投入成本 × 100%
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <div className="w-1.5 rounded-full bg-violet-400 flex-shrink-0 self-start mt-1" style={{ height: '14px' }} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">總損益</p>
                  <p className="text-xs text-gray-400 mt-0.5">包含已實現損益與未實現損益的完整投資成效</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-1.5 rounded-full bg-gray-300 flex-shrink-0 self-start mt-1" style={{ height: '14px' }} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">總投入成本</p>
                  <p className="text-xs text-gray-400 mt-0.5">所有買入金額含手續費的總和，作為計算基準</p>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-4 pt-4 border-t border-gray-100">
              此為整體投資組合的績效指標，反映所有投資的整體報酬表現
            </p>
          </div>
        </div>
      )}

      {/* Clear confirm modal */}
      {showClearConfirm && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[90]" onClick={() => setShowClearConfirm(false)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[100] bg-white rounded-3xl p-6 shadow-2xl max-w-sm mx-auto">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </div>
              <div>
                <p className="text-base font-bold text-gray-800 mb-1">確定要清空所有資料？</p>
                <p className="text-sm text-gray-400">所有股票與交易記錄將永久刪除，此操作無法復原。</p>
              </div>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-3 rounded-2xl text-sm font-semibold text-gray-600 bg-gray-100 active:bg-gray-200"
                >
                  取消
                </button>
                <button
                  onClick={() => { setShowClearConfirm(false); onClearAll(); }}
                  className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white bg-red-500 active:bg-red-600"
                >
                  確定清空
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</p>
      {children}
    </div>
  );
}

