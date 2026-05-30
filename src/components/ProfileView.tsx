import { useState, useRef } from 'react';
import type { Stock, AppSettings } from '../types';
import {
  calcAvgCost,
  calcRemainingShares,
  calcTotalRealizedProfit,
  calcTotalInvested,
  formatNTD,
  formatPrice,
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
  const [importError, setImportError]   = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Overview stats ─────────────────────────────────────────────────────────
  const totalProfit   = stocks.reduce((s, st) => s + calcTotalRealizedProfit(st.sells), 0);
  const totalTrades   = stocks.reduce((s, st) => s + st.buys.length + st.sells.length, 0);
  const totalInvested = stocks.reduce((s, st) => s + calcTotalInvested(st.buys), 0);
  const totalCurrentValue = stocks.reduce((s, st) => {
    const remaining = calcRemainingShares(st.buys, st.sells);
    return s + remaining * st.currentPrice;
  }, 0);
  const totalUnrealized = stocks.reduce((s, st) => {
    const remaining = calcRemainingShares(st.buys, st.sells);
    const avgCost = calcAvgCost(st.buys);
    return s + (remaining > 0 ? (st.currentPrice - avgCost) * remaining : 0);
  }, 0);
  const totalPL = totalProfit + totalUnrealized;

  // ── Performance ────────────────────────────────────────────────────────────
  const cumulativeReturn = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  // Best stock by realized profit %
  const bestStock = stocks
    .filter((s) => s.sells.length > 0)
    .map((s) => {
      const invested = calcTotalInvested(s.buys);
      const profit   = calcTotalRealizedProfit(s.sells);
      const pct      = invested > 0 ? (profit / invested) * 100 : 0;
      return { name: s.name, symbol: s.symbol, pct };
    })
    .sort((a, b) => b.pct - a.pct)[0] ?? null;

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

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatChip label="追蹤股票" value={`${stocks.length} 檔`} />
        <StatChip label="交易次數" value={`${totalTrades} 筆`} />
        <StatChip
          label="總損益"
          value={`${totalPL > 0 ? '+' : ''}${formatNTD(totalPL)}`}
          color={totalPL === 0 ? 'gray' : totalPL > 0 ? 'red' : 'green'}
        />
      </div>

      {/* 投資概況 */}
      <Section title="投資概況">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <OverviewRow label="總投入" value={formatNTD(totalInvested)} />
          <OverviewRow label="目前市值" value={formatNTD(totalCurrentValue)} border />
          <OverviewRow
            label="未實現損益"
            value={`${totalUnrealized > 0 ? '+' : ''}${formatNTD(totalUnrealized)}`}
            color={totalUnrealized === 0 ? 'gray' : totalUnrealized > 0 ? 'red' : 'green'}
            border
          />
        </div>
      </Section>

      {/* 績效分析 */}
      <Section title="績效分析">
        <div className="grid grid-cols-2 gap-3">

          {/* 累積報酬率 */}
          <div className={`rounded-2xl p-4 shadow-sm border flex flex-col gap-3 ${
            cumulativeReturn > 0 ? 'bg-red-50 border-red-100' :
            cumulativeReturn < 0 ? 'bg-emerald-50 border-emerald-100' :
            'bg-white border-gray-100'
          }`}>
            <div className="flex items-center gap-2">
              {/* Trending chart icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke={cumulativeReturn > 0 ? '#ef4444' : cumulativeReturn < 0 ? '#10b981' : '#9ca3af'}
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                <polyline points="16 7 22 7 22 13"/>
              </svg>
              <p className="text-xs font-semibold text-gray-500">累積報酬率</p>
            </div>
            <div>
              <p className={`text-2xl font-bold tracking-tight leading-none ${
                cumulativeReturn === 0 ? 'text-gray-700' :
                cumulativeReturn > 0 ? 'text-red-500' : 'text-emerald-600'
              }`}>
                {cumulativeReturn === 0 ? '0%' : `${cumulativeReturn > 0 ? '+' : ''}${cumulativeReturn.toFixed(2)}%`}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">基於總投入計算</p>
            </div>
          </div>

          {/* 最佳交易 */}
          <div className={`rounded-2xl p-4 shadow-sm border flex flex-col gap-3 ${
            bestStock && bestStock.pct > 0 ? 'bg-amber-50 border-amber-100' : 'bg-white border-gray-100'
          }`}>
            <div className="flex items-center gap-2">
              {/* Trophy icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke={bestStock && bestStock.pct > 0 ? '#f59e0b' : '#9ca3af'}
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1h3"/>
                <path d="M18 9h2a2 2 0 0 0 2-2V5a1 1 0 0 0-1-1h-3"/>
                <path d="M6 4h12v6a6 6 0 0 1-12 0V4z"/>
                <path d="M12 16v4"/>
                <path d="M9 20h6"/>
              </svg>
              <p className="text-xs font-semibold text-gray-500">最佳交易</p>
            </div>
            {bestStock ? (
              <div>
                <p className="text-2xl font-bold tracking-tight leading-none text-amber-500">
                  +{bestStock.pct.toFixed(1)}%
                </p>
                <p className="text-[11px] text-gray-500 mt-1 font-medium truncate">{bestStock.symbol} · {bestStock.name}</p>
              </div>
            ) : (
              <div>
                <p className="text-2xl font-bold text-gray-300 leading-none">—</p>
                <p className="text-[11px] text-gray-400 mt-1">尚無賣出記錄</p>
              </div>
            )}
          </div>

        </div>
      </Section>

      {/* 持股摘要 */}
      {stocks.length > 0 && (
        <Section title="持股摘要">
          <div className="flex flex-col gap-2">
            {stocks.map((stock) => {
              const avgCost   = calcAvgCost(stock.buys);
              const remaining = calcRemainingShares(stock.buys, stock.sells);
              const profit    = calcTotalRealizedProfit(stock.sells);
              return (
                <div key={stock.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{stock.name}</p>
                    <p className="text-xs text-gray-400">{stock.symbol} · 平均 {formatPrice(avgCost)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${profit === 0 ? 'text-gray-700' : profit > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      {profit > 0 ? '+' : ''}{formatNTD(profit)}
                    </p>
                    <p className="text-xs text-gray-400">{remaining > 0 ? `持有 ${remaining} 股` : '已清倉'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

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
            <p>· 損益 = 可取得金額 − 平均成本 × 股數</p>
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

function StatChip({ label, value, color = 'gray' }: { label: string; value: string; color?: 'gray' | 'red' | 'green' }) {
  const colorClass = color === 'red' ? 'text-red-500' : color === 'green' ? 'text-emerald-600' : 'text-gray-800';
  return (
    <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
      <p className={`text-sm font-bold ${colorClass}`}>{value}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

function OverviewRow({ label, value, color = 'gray', border = false }: {
  label: string; value: string; color?: 'gray' | 'red' | 'green'; border?: boolean;
}) {
  const colorClass = color === 'red' ? 'text-red-500' : color === 'green' ? 'text-emerald-600' : 'text-gray-800';
  return (
    <div className={`flex items-center justify-between px-4 py-3.5 ${border ? 'border-t border-gray-50' : ''}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-sm font-bold ${colorClass}`}>{value}</p>
    </div>
  );
}
