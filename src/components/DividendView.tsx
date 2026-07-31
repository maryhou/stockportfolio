import { useState, useEffect, useRef } from 'react';
import { fetchStockDividends, type DividendRecord } from '../utils/fetchDividends';
import BottomSheet, { type BottomSheetHandle } from './BottomSheet';
import type { Stock, DividendTransaction, AppSettings } from '../types';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from './PullToRefreshIndicator';
import {
  calcYearDividends,
  calcMonthDividends,
  calcMonthlyDividends,
  calcDividendYield,
  calcDividendGross,
  calcDividendHealthInsurance,
  calcDividendNet,
  calcSharesHeldAtDate,
  calcTotalInvested,
  calcRemainingShares,
  dividendStatDate,
  HEALTH_INSURANCE_THRESHOLD,
  HEALTH_INSURANCE_RATE,
  formatNTD,
} from '../utils/calculations';

const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

// 歷年股息預設最多列出的年數，超過收合成「顯示更多」
const YEAR_COLLAPSE_LIMIT = 5;

/** "+$1,234" for positive totals, plain "$0" when zero. */
const signedNTD = (n: number) => `${n > 0 ? '+' : ''}${formatNTD(n)}`;

const todayISO = () => new Date().toISOString().slice(0, 10);

/** 發放日還沒到 = 即將配息，已到 = 已入帳 */
function StatusBadge({ payDate }: { payDate: string }) {
  const upcoming = payDate > todayISO();
  return (
    <span className={`inline-flex items-center text-[10px] font-bold rounded-full px-2 py-0.5 whitespace-nowrap
      ${upcoming ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-500'}`}>
      {upcoming ? '即將配息' : '已入帳'}
    </span>
  );
}

interface DividendViewProps {
  stocks: Stock[];
  settings: AppSettings;
  onBack: () => void;
  onSaveDividend: (stockId: string, dividend: DividendTransaction) => void;
  onImportDividends: (items: { stockId: string; dividend: DividendTransaction }[]) => void;
  onDeleteDividend: (stockId: string, dividendId: string) => void;
  onRefresh: () => Promise<void>;
}

export default function DividendView({
  stocks, settings, onBack, onSaveDividend, onImportDividends, onDeleteDividend, onRefresh,
}: DividendViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const ptrState = usePullToRefresh(scrollRef, onRefresh);
  const [showAdd,    setShowAdd]    = useState(false);
  const [showImport, setShowImport] = useState(false);
  // 0-based month selected in the bar chart; null = show the whole year
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  // Year shown in the chart and record list
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  // Stock id to filter chart + records by; null = all stocks
  const [stockFilter, setStockFilter] = useState<string | null>(null);
  // 歷年股息超過 YEAR_COLLAPSE_LIMIT 年時預設收合，只列最近幾年
  const [yearsExpanded, setYearsExpanded] = useState(false);
  const [editTarget, setEditTarget] = useState<{ stockId: string; dividend: DividendTransaction } | null>(null);
  const [detailTarget, setDetailTarget] = useState<{ stock: Stock; dividend: DividendTransaction } | null>(null);

  const today     = new Date();
  const yearStr   = String(today.getFullYear());
  const monthStr  = `${yearStr}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const monthIdx  = today.getMonth(); // 0-based

  const allDividends = stocks.flatMap((s) =>
    (s.dividends ?? []).map((d) => ({ ...d, stockId: s.id, stockName: s.name, stockSymbol: s.symbol }))
  );
  allDividends.sort((a, b) => dividendStatDate(b).localeCompare(dividendStatDate(a)));

  const totalNet      = allDividends.reduce((s, d) => s + d.netAmount, 0);
  const thisYearTotal = calcYearDividends(allDividends, yearStr);
  const thisMonthTotal= calcMonthDividends(allDividends, monthStr);
  const totalInvested = stocks.reduce((s, st) => s + calcTotalInvested(st.buys), 0);
  const yieldPct      = calcDividendYield(allDividends, totalInvested);

  // Stocks that have dividend records — shown as filter chips
  const dividendStocks = stocks.filter((s) => (s.dividends ?? []).length > 0);
  const filteredDividends = stockFilter === null
    ? allDividends
    : allDividends.filter((d) => d.stockId === stockFilter);

  // Continuous year range from the first record to today (newest first) —
  // gap years stay visible at $0 so the multi-year record reads as a streak.
  // Falls back to record-years-only when dirty dates make the span absurd.
  const recordYears = allDividends.map((d) => parseInt(dividendStatDate(d).slice(0, 4)));
  const firstYear = recordYears.length > 0 ? Math.min(...recordYears) : today.getFullYear();
  const lastYear  = recordYears.length > 0 ? Math.max(today.getFullYear(), ...recordYears) : today.getFullYear();
  const yearSpan  = lastYear - firstYear + 1;
  const years = yearSpan >= 1 && yearSpan <= 15
    ? Array.from({ length: yearSpan }, (_, i) => lastYear - i)
    : Array.from(new Set([
        today.getFullYear(),
        ...recordYears,
      ])).sort((a, b) => b - a);
  const selYearStr = String(selectedYear);

  // Yearly totals for the 歷年股息 overview (respects the stock filter)
  const yearlyTotals = years.map((y) => calcYearDividends(filteredDividends, String(y)));
  const maxYearly = Math.max(...yearlyTotals, 1);
  const filteredTotalNet = filteredDividends.reduce((s, d) => s + d.netAmount, 0);
  const visibleYears = yearsExpanded ? years : years.slice(0, YEAR_COLLAPSE_LIMIT);
  const hiddenYearCount = years.length - visibleYears.length;

  // 換年時清掉月份篩選，避免帶著別年的月份殘留
  function selectYear(y: number) {
    setSelectedYear(y);
    setSelectedMonth(null);
  }

  // Monthly bar chart data for the selected year / stock filter
  const monthlyTotals = calcMonthlyDividends(filteredDividends, selYearStr);
  const maxMonthly    = Math.max(...monthlyTotals, 1);
  const selectedYearTotal = calcYearDividends(filteredDividends, selYearStr);

  // Records shown in the list — selected year, narrowed to a month when a bar
  // is tapped (attribution by ex-date)
  const visibleDividends = filteredDividends.filter((d) => {
    const sd = dividendStatDate(d);
    return selectedMonth === null
      ? sd.startsWith(selYearStr)
      : sd.startsWith(`${selYearStr}-${String(selectedMonth + 1).padStart(2, '0')}`);
  });

  const transferFee = settings.dividendTransferFee ?? 10;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-3 bg-white border-b border-gray-100">
        <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center active:bg-gray-100 transition-colors -ml-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">股息收益</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 border border-amber-400 text-amber-500 text-sm font-semibold px-3 py-2 rounded-xl active:opacity-80 transition-opacity"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            自動估算
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 bg-amber-500 text-white text-sm font-semibold px-3.5 py-2 rounded-xl active:opacity-80 transition-opacity"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            新增
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-32 lg:pb-10">
        <PullToRefreshIndicator state={ptrState} color="#f59e0b" />
        <div className="px-4 pt-4 space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-5 lg:items-start lg:max-w-5xl lg:mx-auto lg:pt-6">
        {/* ── Left column: summary + charts (sticky on desktop so filters stay in view) ── */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        {/* ── Hero Card ── */}
        <div className="rounded-2xl overflow-hidden shadow-md" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}>
          <div className="px-5 pt-5 pb-4">
            {/* Top row: label + yield pill */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-white/70 text-xs font-medium">總股息收益</p>
              {yieldPct > 0 && (
                <div className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/20 text-white whitespace-nowrap">
                  年化殖利率 {yieldPct.toFixed(2)}%
                </div>
              )}
            </div>
            <p className={`text-3xl font-bold text-white ${allDividends.length > 0 ? 'mb-1' : 'mb-3'}`}>{signedNTD(totalNet)}</p>
            {allDividends.length > 0 && (
              <p className="text-white/60 text-[11px] font-medium mb-3">
                自 {firstYear} 年起 · 累計 {allDividends.length} 筆入帳
              </p>
            )}
            <div className="flex gap-3">
              <div className="bg-white/15 rounded-xl px-4 py-2.5 flex-1">
                <p className="text-white/70 text-[10px] font-medium mb-0.5">今年</p>
                <p className="text-white text-lg font-bold">{signedNTD(thisYearTotal)}</p>
              </div>
              <div className="bg-white/15 rounded-xl px-4 py-2.5 flex-1">
                <p className="text-white/70 text-[10px] font-medium mb-0.5">本月</p>
                <p className="text-white text-lg font-bold">{signedNTD(thisMonthTotal)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Stock filter chips ── */}
        {dividendStocks.length > 1 && (
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-0.5 lg:mx-0 lg:px-0">
            <button
              onClick={() => setStockFilter(null)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors
                ${stockFilter === null ? 'bg-amber-500 text-white' : 'bg-white border border-gray-200 text-gray-500'}`}
            >
              全部
            </button>
            {dividendStocks.map((s) => (
              <button
                key={s.id}
                onClick={() => setStockFilter(stockFilter === s.id ? null : s.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors
                  ${stockFilter === s.id ? 'bg-amber-500 text-white' : 'bg-white border border-gray-200 text-gray-500'}`}
              >
                {s.symbol}
              </button>
            ))}
          </div>
        )}

        {/* ── Yearly Overview（歷年股息，兼年份切換器）── */}
        {allDividends.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 pt-4 pb-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[13px] font-semibold text-gray-500">歷年股息</p>
              <p className="text-[13px] font-bold text-amber-500">累計 {signedNTD(filteredTotalNet)}</p>
            </div>
            <div>
              {visibleYears.map((y, i) => {
                const total = yearlyTotals[i];
                const widthPct = total > 0 ? Math.max((total / maxYearly) * 100, 5) : 0;
                const isSelected = y === selectedYear;
                return (
                  <button
                    key={y}
                    onClick={() => selectYear(y)}
                    className={`w-full flex items-center gap-3 rounded-xl px-2 py-2 transition-colors
                      ${isSelected ? 'bg-amber-50' : 'active:bg-gray-50'}`}
                  >
                    <span className={`w-9 flex-shrink-0 text-left text-[12px] font-bold ${isSelected ? 'text-amber-600' : 'text-gray-400'}`}>
                      {y}
                    </span>
                    <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isSelected ? 'bg-amber-500' : 'bg-amber-200'}`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <span className={`flex-shrink-0 text-right text-[12px] font-bold whitespace-nowrap ${
                      total > 0 ? (isSelected ? 'text-amber-600' : 'text-gray-600') : 'text-gray-300'}`}>
                      {total > 0 ? signedNTD(total) : '$0'}
                    </span>
                  </button>
                );
              })}
            </div>
            {years.length > YEAR_COLLAPSE_LIMIT && (
              <button
                onClick={() => setYearsExpanded(!yearsExpanded)}
                className="w-full flex items-center justify-center gap-1 pt-2 pb-1 text-[12px] font-semibold text-gray-400 active:opacity-70"
              >
                {yearsExpanded ? '收合' : `顯示更多（還有 ${hiddenYearCount} 年）`}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className={yearsExpanded ? 'rotate-180' : ''}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
            )}
          </div>
        )}

        {/* ── Monthly Bar Chart ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 pt-4 pb-3">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-[13px] font-semibold text-gray-500">{selectedYear} 月度股息</p>
            <p className="text-[13px] font-bold text-amber-500">
              {selectedMonth !== null
                ? `${selectedMonth + 1} 月股息 ${signedNTD(monthlyTotals[selectedMonth])}`
                : `全年 ${signedNTD(selectedYearTotal)}`}
            </p>
          </div>
          <div className="flex items-end gap-1 h-20">
            {monthlyTotals.map((val, i) => {
              const heightPct = val > 0 ? Math.max((val / maxMonthly) * 100, 8) : 0;
              const isCurrentMonth = i === monthIdx && selectedYear === today.getFullYear();
              const isSelected = i === selectedMonth;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedMonth(isSelected ? null : i)}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <div className="w-full flex items-end justify-center" style={{ height: 64 }}>
                    <div
                      className={`w-full rounded-t-sm transition-all
                        ${isSelected ? 'bg-amber-500' : isCurrentMonth ? 'bg-amber-400' : 'bg-amber-200'}`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className={`text-[9px] font-medium
                    ${isSelected ? 'text-amber-600 font-bold' : isCurrentMonth ? 'text-amber-500' : 'text-gray-300'}`}>
                    {MONTHS[i].replace('月', '')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        </div>{/* end left column */}

        {/* ── Right column: record list ── */}
        <div className="space-y-4">
        {/* ── Dividend List ── */}
        {allDividends.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-3">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="13" rx="2"/>
                <path d="M2 10h20"/>
                <circle cx="12" cy="15" r="1.5" fill="#f59e0b" stroke="none"/>
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-500 mb-1">尚無股息紀錄</p>
            <p className="text-xs text-gray-400">點「新增股息」記錄第一筆配息</p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-[13px] font-semibold text-gray-500">
                {selectedMonth === null ? `${selectedYear} 股息紀錄` : `${selectedMonth + 1} 月股息紀錄`}
              </p>
              {selectedMonth !== null && (
                <button
                  onClick={() => setSelectedMonth(null)}
                  className="text-[12px] font-semibold text-amber-500 active:opacity-70"
                >
                  顯示全部
                </button>
              )}
            </div>
            {visibleDividends.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 py-10 text-center">
                <p className="text-sm font-semibold text-gray-500 mb-1">
                  {selectedMonth === null ? `${selectedYear} 年沒有股息紀錄` : `${selectedMonth + 1} 月沒有股息紀錄`}
                </p>
                <p className="text-xs text-gray-400">
                  {selectedMonth === null ? '切換年份或篩選條件查看其他紀錄' : '點同一根長條或「顯示全部」可取消篩選'}
                </p>
              </div>
            ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {visibleDividends.map((d, i) => (
                <button
                  key={d.id}
                  onClick={() => {
                    const stock = stocks.find((s) => s.id === d.stockId)!;
                    setDetailTarget({ stock, dividend: d });
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 transition-colors
                    ${i < visibleDividends.length - 1 ? 'border-b border-gray-50' : ''}`}
                >
                  <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="6" width="20" height="13" rx="2"/>
                      <path d="M2 10h20"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="inline-flex items-center bg-gray-100 text-gray-500 text-[10px] font-bold rounded-full px-2 py-0.5">
                        {d.stockSymbol}
                      </span>
                      <StatusBadge payDate={d.date} />
                    </div>
                    <p className="text-sm font-semibold text-gray-800 truncate">{d.stockName}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {d.exDate ? `除息 ${d.exDate} · ` : ''}發放 {d.date} · {d.shares.toLocaleString()} 股
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-amber-500">+{formatNTD(d.netAmount)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">每股 ${d.amountPerShare}</p>
                  </div>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-1 flex-shrink-0">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
              ))}
            </div>
            )}
          </div>
        )}
        </div>{/* end right column */}
        </div>{/* end inner px-4 pt-4 */}
      </div>

      {/* ── Import History Sheet ── */}
      {showImport && (
        <ImportDividendSheet
          stocks={stocks}
          settings={settings}
          onConfirm={(items) => {
            onImportDividends(items.map((item) => ({ stockId: item.stockId, dividend: item.dividend })));
            setShowImport(false);
          }}
          onClose={() => setShowImport(false)}
        />
      )}

      {/* ── Add Dividend Sheet ── */}
      {showAdd && (
        <AddDividendSheet
          stocks={stocks}
          defaultTransferFee={transferFee}
          onSave={(stockId, d) => { onSaveDividend(stockId, d); setShowAdd(false); }}
          onClose={() => setShowAdd(false)}
        />
      )}

      {/* ── Edit Dividend Sheet ── */}
      {editTarget && (
        <AddDividendSheet
          stocks={stocks}
          defaultTransferFee={transferFee}
          editDividend={editTarget.dividend}
          editStockId={editTarget.stockId}
          onSave={(stockId, d) => { onSaveDividend(stockId, d); setEditTarget(null); }}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* ── Detail Modal ── */}
      {detailTarget && (
        <DividendDetailModal
          stock={detailTarget.stock}
          dividend={detailTarget.dividend}
          defaultTransferFee={transferFee}
          onSave={(updated) => {
            onSaveDividend(detailTarget!.stock.id, updated);
            setDetailTarget({ stock: detailTarget!.stock, dividend: updated });
          }}
          onEdit={() => {
            setEditTarget({ stockId: detailTarget!.stock.id, dividend: detailTarget!.dividend });
            setDetailTarget(null);
          }}
          onDelete={() => {
            onDeleteDividend(detailTarget!.stock.id, detailTarget!.dividend.id);
            setDetailTarget(null);
          }}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add / Edit Dividend Sheet
// ─────────────────────────────────────────────────────────────────────────────
interface AddDividendSheetProps {
  stocks: Stock[];
  defaultTransferFee: number;
  editDividend?: DividendTransaction;
  editStockId?: string;
  onSave: (stockId: string, dividend: DividendTransaction) => void;
  onClose: () => void;
}

function AddDividendSheet({ stocks, defaultTransferFee, editDividend, editStockId, onSave, onClose }: AddDividendSheetProps) {
  const sheetRef = useRef<BottomSheetHandle>(null);
  const isEdit = !!editDividend;
  // Include sold-out stocks too, so past dividends can be back-filled
  const selectableStocks = stocks.filter((s) => s.buys.length > 0 || isEdit);

  const [stockId,        setStockId]        = useState(editStockId ?? selectableStocks[0]?.id ?? '');
  const [date,           setDate]           = useState(editDividend?.date ?? new Date().toISOString().slice(0, 10));
  const [exDate,         setExDate]         = useState(editDividend?.exDate ?? '');
  const [amtPerShare,    setAmtPerShare]    = useState(editDividend ? String(editDividend.amountPerShare) : '');
  const [sharesStr,      setSharesStr]      = useState(() => {
    if (editDividend) return String(editDividend.shares);
    const s = stocks.find((st) => st.id === (editStockId ?? selectableStocks[0]?.id ?? ''));
    const remaining = s ? calcRemainingShares(s.buys, s.sells) : 0;
    return remaining > 0 ? String(remaining) : '';
  });
  // 免扣的紀錄存的匯費是 0，輸入框改帶預設值，勾回「扣」時才有合理金額
  const [transferFeeStr, setTransferFeeStr] = useState(
    editDividend && !editDividend.transferFeeExempt ? String(editDividend.transferFee) : String(defaultTransferFee)
  );
  const [healthExempt,   setHealthExempt]   = useState(editDividend?.healthFeeExempt ?? false);
  const [transferExempt, setTransferExempt] = useState(editDividend?.transferFeeExempt ?? false);
  // 健保費預設依 2.11% 公式自動算；使用者改過欄位就轉手動、不再自動重算
  const [healthFeeManual, setHealthFeeManual] = useState(() => !!editDividend && isHealthFeeManual(editDividend));
  const [healthFeeStr,    setHealthFeeStr]    = useState(editDividend ? String(editDividend.healthInsuranceFee) : '');
  const [note,           setNote]           = useState(editDividend?.note ?? '');

  // Yahoo Finance quick-fill suggestions
  const [suggestions,    setSuggestions]    = useState<DividendRecord[]>([]);
  const [loadingSugg,    setLoadingSugg]    = useState(false);

  const selectedStock = stocks.find((s) => s.id === stockId);

  // Fetch suggestions when stock changes, auto-fill the latest record
  useEffect(() => {
    if (isEdit || !selectedStock) return;
    setSuggestions([]);
    setLoadingSugg(true);
    fetchStockDividends(selectedStock.symbol)
      .then((recs) => {
        setSuggestions(recs);
        if (recs.length > 0) applySuggestion(recs[0]);
      })
      .finally(() => setLoadingSugg(false));
  }, [stockId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply a suggestion: rec.date is the ex-dividend date; use the real
  // payment date when the source provides it (TWSE/TPEx ETF data).
  // Shares default to the holdings on that ex-date, so back-filling
  // dividends of sold-out stocks gets the right share count.
  function applySuggestion(rec: DividendRecord) {
    // 金額尚未公告（null）時留空，讓使用者從收益分配通知書自行填入
    setAmtPerShare(rec.cashPerShare != null ? String(rec.cashPerShare) : '');
    setExDate(rec.date);
    setDate(rec.payDate ?? rec.date);
    setHealthFeeManual(false); // 金額換了，手動覆寫的健保費已失效，回到自動計算
    if (selectedStock) {
      const remaining = calcRemainingShares(selectedStock.buys, selectedStock.sells);
      setSharesStr(remaining > 0 ? String(remaining) : '');
    }
  }

  function handleStockChange(id: string) {
    setStockId(id);
    if (!isEdit) {
      const s = stocks.find((st) => st.id === id);
      if (s) {
        const remaining = calcRemainingShares(s.buys, s.sells);
        setSharesStr(remaining > 0 ? String(remaining) : '');
      }
    }
  }

  const amtPerShareNum = parseFloat(amtPerShare) || 0;
  const sharesNum      = parseInt(sharesStr) || 0;
  const transferFeeNum = transferExempt ? 0 : (parseInt(transferFeeStr) || 0);
  const gross          = calcDividendGross(amtPerShareNum, sharesNum);
  const autoHealthFee  = calcDividendHealthInsurance(gross);
  const healthFee      = healthExempt ? 0 : healthFeeManual ? (parseInt(healthFeeStr) || 0) : autoHealthFee;
  const net            = calcDividendNet(gross, healthFee, transferFeeNum);
  const canSave        = stockId && amtPerShareNum > 0 && sharesNum > 0 && date && exDate;

  function handleSave() {
    if (!canSave) return;
    // Spread optional fields conditionally — Firestore rejects undefined values
    const dividend: DividendTransaction = {
      id:                editDividend?.id ?? `div-${Date.now()}`,
      date,
      ...(exDate ? { exDate } : {}),
      amountPerShare:    amtPerShareNum,
      shares:            sharesNum,
      grossAmount:       gross,
      healthInsuranceFee: healthFee,
      ...(healthExempt ? { healthFeeExempt: true } : {}),
      transferFee:       transferFeeNum,
      ...(transferExempt ? { transferFeeExempt: true } : {}),
      netAmount:         net,
      ...(note ? { note } : {}),
    };
    sheetRef.current?.close(() => onSave(stockId, dividend));
  }

  return (
    <BottomSheet ref={sheetRef} onClose={onClose} zBackdrop="z-[199]" zSheet="z-[200]">
      <div className="dividend-form px-4 pb-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? '編輯股息' : '新增股息'}</h2>
          <button
            onClick={() => sheetRef.current?.close()}
            className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* Stock selector */}
          <div>
            <label className="label">股票</label>
            <select
              className="input"
              value={stockId}
              onChange={(e) => handleStockChange(e.target.value)}
            >
              {selectableStocks.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.symbol} {s.name}{calcRemainingShares(s.buys, s.sells) <= 0 ? '（已清倉）' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Yahoo Finance quick-fill */}
          {!isEdit && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <label className="label mb-0 text-gray-500">近期配息紀錄</label>
                {loadingSugg && (
                  <svg className="animate-spin text-amber-400" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                )}
              </div>
              {suggestions.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {suggestions.slice(0, 5).map((rec) => {
                    const cps           = rec.cashPerShare;
                    const pending       = cps == null; // 金額尚未公告
                    const previewGross  = cps != null ? calcDividendGross(cps, parseInt(sharesStr) || 0) : 0;
                    const previewHealth = healthExempt ? 0 : calcDividendHealthInsurance(previewGross);
                    const previewNet    = calcDividendNet(previewGross, previewHealth, transferFeeNum);
                    const isActive      = pending
                      ? exDate === rec.date && date === (rec.payDate ?? rec.date)
                      : amtPerShare === String(cps) && date === (rec.payDate ?? rec.date);
                    return (
                      <button
                        key={rec.date}
                        onClick={() => applySuggestion(rec)}
                        className={`w-full flex items-center justify-between text-left border rounded-2xl px-4 py-3 transition-colors active:scale-[0.99]
                          ${isActive ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-gray-50 active:bg-amber-50'}`}
                      >
                        <div>
                          <p className="text-[10px] font-medium text-gray-400">
                            {rec.payDate ? `除息 ${rec.date} · 發放 ${rec.payDate}` : rec.date}
                          </p>
                          {pending ? (
                            <p className="text-sm font-bold text-amber-500">金額尚未公告 · 點此帶入日期</p>
                          ) : (
                            <p className="text-sm font-bold text-gray-800">每股 ${cps}</p>
                          )}
                        </div>
                        {pending ? (
                          <span className="text-[10px] font-semibold text-amber-500 whitespace-nowrap ml-2">待填金額</span>
                        ) : parseInt(sharesStr) > 0 && (
                          <p className={`text-sm font-bold ${isActive ? 'text-amber-500' : 'text-gray-400'}`}>
                            +{formatNTD(previewNet)}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : !loadingSugg ? (
                <p className="text-xs text-gray-400">查無資料，請手動輸入</p>
              ) : null}
            </div>
          )}

          {/* Dates */}
          <div className="flex gap-3">
            <div className="flex-1 min-w-0">
              <label className="label">除息日</label>
              <input
                type="date"
                className="input input-date"
                value={exDate}
                onChange={(e) => setExDate(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="label">實際發放日</label>
              <input
                type="date"
                className="input input-date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          {/* Amount per share + shares */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="label">每股股息（元）</label>
              <input
                type="number"
                className="input"
                placeholder="例：2.5"
                value={amtPerShare}
                onChange={(e) => setAmtPerShare(e.target.value)}
                step="0.01"
                min="0"
              />
            </div>
            <div className="flex-1">
              <label className="label">持有股數</label>
              <input
                type="number"
                className="input"
                placeholder="股"
                value={sharesStr}
                onChange={(e) => setSharesStr(e.target.value)}
                min="1"
              />
              {!isEdit && sharesStr !== '' && (
                <p className="text-xs text-gray-400 mt-1">已帶入目前持股數，請依除息日實際持有數量修改</p>
              )}
            </div>
          </div>

          {/* Health insurance fee — auto (2.11%) until manually overridden */}
          <div>
            <label className="label">健保補充費（元）</label>
            <input
              type="number"
              className={`input ${healthExempt ? 'opacity-40' : ''}`}
              value={healthFeeManual ? healthFeeStr : String(autoHealthFee)}
              onChange={(e) => { setHealthFeeManual(true); setHealthFeeStr(e.target.value); }}
              min="0"
              disabled={healthExempt}
            />
            {healthExempt ? (
              <p className="text-xs text-gray-400 mt-1">此筆設為免扣健保補充費，可在下方試算勾回</p>
            ) : healthFeeManual ? (
              <p className="text-xs text-gray-400 mt-1">
                已手動修改（如 ETF 僅股利所得部分課徵）
                <button
                  onClick={() => setHealthFeeManual(false)}
                  className="inline-flex items-center gap-1 align-bottom text-amber-500 font-semibold ml-2 active:opacity-70"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                  重算 ({(HEALTH_INSURANCE_RATE * 100).toFixed(2)}%)
                </button>
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1">依 {(HEALTH_INSURANCE_RATE * 100).toFixed(2)}% 自動計算，與實際入帳不符可直接修改</p>
            )}
          </div>

          {/* Transfer fee */}
          <div>
            <label className="label">匯款手續費（元）</label>
            <input
              type="number"
              className={`input ${transferExempt ? 'opacity-40' : ''}`}
              value={transferFeeStr}
              onChange={(e) => setTransferFeeStr(e.target.value)}
              min="0"
              disabled={transferExempt}
            />
            {transferExempt && (
              <p className="text-xs text-gray-400 mt-1">此筆設為免扣匯款手續費，可在下方試算勾回</p>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="label">備註（選填）</label>
            <input
              type="text"
              className="input"
              placeholder="例：現金股利、股票股利..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* Calculation preview */}
          {gross > 0 && (
            <div className="bg-amber-50 rounded-2xl p-4 space-y-2.5">
              <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider mb-1">試算</p>
              <Row label="應得股息" value={`+${formatNTD(gross)}`} valueClass="text-gray-800 font-semibold" />
              <HealthFeeRow
                fee={healthFee}
                exempt={healthExempt}
                manual={healthFeeManual}
                belowThreshold={gross < HEALTH_INSURANCE_THRESHOLD}
                onToggle={() => setHealthExempt(!healthExempt)}
              />
              <FeeToggleRow
                label="扣匯款手續費"
                fee={transferFeeNum}
                exempt={transferExempt}
                exemptHint={TRANSFER_EXEMPT_HINT}
                onToggle={() => setTransferExempt(!transferExempt)}
              />
              <div className="border-t border-amber-200 pt-2 mt-1">
                <Row label="實際入帳" value={`+${formatNTD(net)}`} valueClass="text-amber-600 font-bold text-base" />
              </div>
            </div>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`w-full py-3.5 rounded-2xl text-sm font-bold transition-opacity
              ${canSave ? 'bg-amber-500 text-white active:opacity-80' : 'bg-gray-100 text-gray-400'}`}
          >
            {isEdit ? '儲存變更' : '新增股息'}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dividend Detail Modal
// ─────────────────────────────────────────────────────────────────────────────
interface DividendDetailModalProps {
  stock: Stock;
  dividend: DividendTransaction;
  defaultTransferFee: number;
  onSave: (updated: DividendTransaction) => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function DividendDetailModal({ stock, dividend: d, defaultTransferFee, onSave, onEdit, onDelete, onClose }: DividendDetailModalProps) {
  const sheetRef = useRef<BottomSheetHandle>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 切換此筆費用的扣 / 免扣，重算後立即存檔。
  // d 來自列表展開（帶有 stockId 等額外欄位），必須逐欄重建乾淨物件再存，
  // 否則多餘欄位會被寫進 Firestore。
  function toggleFee(which: 'health' | 'transfer') {
    const healthExempt   = which === 'health'   ? !(d.healthFeeExempt ?? false)   : (d.healthFeeExempt ?? false);
    const transferExempt = which === 'transfer' ? !(d.transferFeeExempt ?? false) : (d.transferFeeExempt ?? false);
    // 只重算被切換的費用，另一個保留原值（健保費可能是手動覆寫值，不能重算蓋掉）
    const healthFee = healthExempt ? 0
      : which === 'health' ? calcDividendHealthInsurance(d.grossAmount)
      : d.healthInsuranceFee;
    // 免扣時存 0；從免扣勾回時原值已是 0，回填設定的預設匯費
    const transferFee = transferExempt ? 0 : (d.transferFeeExempt ? defaultTransferFee : d.transferFee);
    onSave({
      id:                 d.id,
      date:               d.date,
      ...(d.exDate ? { exDate: d.exDate } : {}),
      amountPerShare:     d.amountPerShare,
      shares:             d.shares,
      grossAmount:        d.grossAmount,
      healthInsuranceFee: healthFee,
      ...(healthExempt ? { healthFeeExempt: true } : {}),
      transferFee,
      ...(transferExempt ? { transferFeeExempt: true } : {}),
      netAmount:          calcDividendNet(d.grossAmount, healthFee, transferFee),
      ...(d.note ? { note: d.note } : {}),
    });
  }

  return (
    <BottomSheet ref={sheetRef} onClose={onClose} zBackdrop="z-[199]" zSheet="z-[200]">
      <div className="px-4 pb-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] text-gray-400 font-medium">{stock.symbol} · {d.date}</p>
              <StatusBadge payDate={d.date} />
            </div>
            <h2 className="text-lg font-bold text-gray-900">{stock.name}</h2>
          </div>
          <button onClick={() => sheetRef.current?.close()} className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Breakdown */}
        <div className="bg-gray-50 rounded-2xl p-4 space-y-3 mb-4">
          {d.exDate && (
            <Row label="除息日" value={d.exDate} valueClass="text-gray-800 font-semibold" />
          )}
          <Row label="實際發放日" value={d.date} valueClass="text-gray-800 font-semibold" />
          <Row label="每股配息" value={`$${d.amountPerShare}`} valueClass="text-gray-800 font-semibold" />
          <Row label="持有股數" value={`${d.shares.toLocaleString()} 股`} valueClass="text-gray-800 font-semibold" />
          <div className="border-t border-gray-200 pt-2">
            <Row label="應得股息" value={`+${formatNTD(d.grossAmount)}`} valueClass="text-gray-800 font-semibold" />
            <div className="text-[10px] text-gray-400 mt-0.5 ml-auto text-right">
              ${d.amountPerShare} × {d.shares.toLocaleString()} 股
            </div>
          </div>
          <HealthFeeRow
            fee={d.healthInsuranceFee}
            exempt={d.healthFeeExempt ?? false}
            manual={isHealthFeeManual(d)}
            belowThreshold={d.grossAmount < HEALTH_INSURANCE_THRESHOLD}
            onToggle={() => toggleFee('health')}
          />
          <FeeToggleRow
            label="扣匯款手續費"
            fee={d.transferFee}
            exempt={d.transferFeeExempt ?? false}
            exemptHint={TRANSFER_EXEMPT_HINT}
            onToggle={() => toggleFee('transfer')}
          />
          <div className="border-t border-gray-200 pt-3">
            <Row label="實際入帳" value={`+${formatNTD(d.netAmount)}`} valueClass="text-amber-500 font-bold text-base" />
          </div>
        </div>

        {d.note && (
          <p className="text-xs text-gray-400 mb-4 px-1">備註：{d.note}</p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {confirmDelete ? (
            <>
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold bg-gray-100 text-gray-600 active:opacity-80"
              >
                取消
              </button>
              <button
                onClick={() => sheetRef.current?.close(onDelete)}
                className="flex-1 py-3 rounded-2xl text-sm font-bold bg-red-500 text-white active:opacity-80"
              >
                確認刪除
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setConfirmDelete(true)}
                className="py-3 px-4 rounded-2xl text-sm font-semibold bg-gray-100 text-gray-500 active:opacity-80"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
              <button
                onClick={() => sheetRef.current?.close(onEdit)}
                className="flex-1 py-3 rounded-2xl text-sm font-bold bg-amber-500 text-white active:opacity-80"
              >
                編輯
              </button>
            </>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Import History Sheet
// ─────────────────────────────────────────────────────────────────────────────
interface ImportItem {
  key: string;
  stockId: string;
  stockName: string;
  stockSymbol: string;
  year: string;
  refDate: string;
  dividend: DividendTransaction;
}

interface ImportDividendSheetProps {
  stocks: Stock[];
  settings: AppSettings;
  onConfirm: (items: ImportItem[]) => void;
  onClose: () => void;
}

function ImportDividendSheet({ stocks, settings, onConfirm, onClose }: ImportDividendSheetProps) {
  const sheetRef = useRef<BottomSheetHandle>(null);
  const [loading,     setLoading]     = useState(true);
  const [items,       setItems]       = useState<ImportItem[]>([]);
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [loadingMsg,  setLoadingMsg]  = useState('正在查詢 Yahoo Finance 配息資料...');

  const transferFee = settings.dividendTransferFee ?? 10;

  useEffect(() => {
    async function load() {
      const results: ImportItem[] = [];

      for (const stock of stocks) {
        if (stock.buys.length === 0) continue;
        setLoadingMsg(`查詢 ${stock.symbol} ${stock.name}...`);

        const records = await fetchStockDividends(stock.symbol);

        for (const rec of records) {
          // 金額尚未公告的配息無法試算淨額，批次匯入時略過（改由「新增」逐筆自填）
          if (rec.cashPerShare == null) continue;

          // rec.date = ex-dividend date (配息資格以除息日持股計算)
          const refDate = rec.date;
          const payDate = rec.payDate ?? rec.date;
          const sharesHeld = calcSharesHeldAtDate(stock.buys, stock.sells, refDate);
          if (sharesHeld <= 0) continue;

          // Skip if already recorded (match ex-date or either date field)
          const alreadyExists = (stock.dividends ?? []).some(
            (d) => d.exDate === refDate || d.date === refDate || d.date === payDate,
          );
          if (alreadyExists) continue;

          const gross     = calcDividendGross(rec.cashPerShare, sharesHeld);
          const healthFee = calcDividendHealthInsurance(gross);
          const net       = calcDividendNet(gross, healthFee, transferFee);

          const item: ImportItem = {
            key:         `${stock.id}-${rec.date}`,
            stockId:     stock.id,
            stockName:   stock.name,
            stockSymbol: stock.symbol,
            year:        rec.date.slice(0, 4),
            refDate,
            dividend: {
              id:                 `div-import-${stock.id}-${rec.date}`,
              date:               payDate,
              exDate:             refDate,
              amountPerShare:     rec.cashPerShare,
              shares:             sharesHeld,
              grossAmount:        gross,
              healthInsuranceFee: healthFee,
              transferFee,
              netAmount:          net,
            },
          };
          results.push(item);
        }
      }

      // Sort by year desc then stock name
      results.sort((a, b) => b.year.localeCompare(a.year) || a.stockName.localeCompare(b.stockName));
      setItems(results);
      setSelected(new Set(results.map((r) => r.key)));
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const selectedItems = items.filter((i) => selected.has(i.key));
  const totalNet = selectedItems.reduce((s, i) => s + i.dividend.netAmount, 0);

  return (
    <BottomSheet ref={sheetRef} onClose={onClose} zBackdrop="z-[199]" zSheet="z-[200]">
      <div className="pb-10">
        {/* Header */}
        <div className="flex items-center justify-between px-4 mb-1">
          <div>
            <h2 className="text-lg font-bold text-gray-900">匯入歷史股息</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">以官方公告的除息日持股數估算，可逐筆修改</p>
          </div>
          <button onClick={() => sheetRef.current?.close()} className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <svg className="animate-spin text-amber-400" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              <p className="text-sm text-gray-400">{loadingMsg}</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm font-semibold text-gray-500 mb-1">沒有可匯入的紀錄</p>
              <p className="text-xs text-gray-400">TWSE 查無資料，或所有配息都已記錄</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Select all toggle */}
              <button
                onClick={() => selected.size === items.length
                  ? setSelected(new Set())
                  : setSelected(new Set(items.map(i => i.key)))}
                className="w-full flex items-center gap-2 px-1 py-1.5 active:opacity-70"
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  selected.size === items.length ? 'bg-amber-500 border-amber-500' : 'border-gray-300'
                }`}>
                  {selected.size === items.length && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </div>
                <span className="text-sm text-gray-600 font-medium">全選 / 取消全選</span>
                <span className="ml-auto text-xs text-gray-400">{items.length} 筆</span>
              </button>

              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {items.map((item, i) => {
                  const isSelected = selected.has(item.key);
                  return (
                    <button
                      key={item.key}
                      onClick={() => toggle(item.key)}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors
                        ${i < items.length - 1 ? 'border-b border-gray-50' : ''}
                        ${isSelected ? 'bg-amber-50/50' : 'bg-white'}`}
                    >
                      {/* Checkbox */}
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        isSelected ? 'bg-amber-500 border-amber-500' : 'border-gray-300'
                      }`}>
                        {isSelected && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-gray-800">{item.stockName}</p>
                          <span className="text-[10px] text-gray-400">{item.year}</span>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {item.stockSymbol} · 每股 ${item.dividend.amountPerShare} · {item.dividend.shares.toLocaleString()} 股
                        </p>
                      </div>

                      {/* Amount */}
                      <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-bold ${isSelected ? 'text-amber-500' : 'text-gray-400'}`}>
                          +{formatNTD(item.dividend.netAmount)}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{item.refDate}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && items.length > 0 && (
          <div className="px-4 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500">選取 {selectedItems.length} 筆</p>
              <p className="text-sm font-bold text-amber-500">{signedNTD(totalNet)}</p>
            </div>
            <button
              onClick={() => sheetRef.current?.close(() => onConfirm(selectedItems))}
              disabled={selectedItems.length === 0}
              className={`w-full py-3.5 rounded-2xl text-sm font-bold transition-opacity
                ${selectedItems.length > 0 ? 'bg-amber-500 text-white active:opacity-80' : 'bg-gray-100 text-gray-400'}`}
            >
              確認匯入 {selectedItems.length > 0 ? `${selectedItems.length} 筆` : ''}
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────
function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-gray-500 flex-1">{label}</span>
      <span className={`text-sm ${valueClass ?? 'text-gray-700'}`}>{value}</span>
    </div>
  );
}

function CheckSquare({ checked }: { checked: boolean }) {
  return (
    <div className={`w-[18px] h-[18px] rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
      checked ? 'bg-amber-500 border-amber-500' : 'border-gray-300'
    }`}>
      {checked && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      )}
    </div>
  );
}

/** 費用列附「扣 / 免扣」勾選框；勾選 = 扣（預設），取消 = 此筆免扣 */
function FeeToggleRow({ label, fee, exempt, exemptHint, onToggle }: {
  label: string; fee: number; exempt: boolean; exemptHint: string; onToggle: () => void;
}) {
  const showFee = !exempt && fee > 0;
  return (
    <div>
      <button onClick={onToggle} className="w-full flex items-center justify-between gap-2 active:opacity-70">
        <span className="flex items-center gap-2 flex-1 text-left">
          <CheckSquare checked={!exempt} />
          <span className="text-xs text-gray-500">{label}</span>
        </span>
        <span className={`text-sm ${showFee ? 'text-gray-600' : 'text-gray-400'}`}>
          {showFee ? `-${formatNTD(fee)}` : '$0'}
        </span>
      </button>
      {exempt && (
        <p className="text-[10px] text-gray-400 mt-1 ml-[26px]">{exemptHint}</p>
      )}
    </div>
  );
}

/**
 * 健保補充費列。自動模式依 2.11% 公式，未達門檻時顯示靜態「免扣」列；
 * 手動模式（金額被使用者覆寫，如 ETF 僅股利所得部分課徵）顯示覆寫值並標示（手動），
 * 門檻判斷不適用。
 */
function HealthFeeRow({ fee, exempt, manual, belowThreshold, onToggle }: {
  fee: number; exempt: boolean; manual: boolean; belowThreshold: boolean; onToggle: () => void;
}) {
  if (!manual && belowThreshold) {
    return (
      <Row
        label={`健保補充費 (${(HEALTH_INSURANCE_RATE * 100).toFixed(2)}%，未達 $${HEALTH_INSURANCE_THRESHOLD.toLocaleString()} 免扣)`}
        value="$0"
        valueClass="text-gray-400"
      />
    );
  }
  return (
    <FeeToggleRow
      label={manual ? '扣健保補充費（手動）' : `扣健保補充費 (${(HEALTH_INSURANCE_RATE * 100).toFixed(2)}%)`}
      fee={fee}
      exempt={exempt}
      exemptHint="此筆設為免扣（如資本利得配息）"
      onToggle={onToggle}
    />
  );
}

/** 存的健保費與公式值不同（且非免扣）＝ 當初被手動覆寫過 */
function isHealthFeeManual(d: DividendTransaction): boolean {
  return !d.healthFeeExempt && d.healthInsuranceFee !== calcDividendHealthInsurance(d.grossAmount);
}

const TRANSFER_EXEMPT_HINT = '此筆設為免扣（如入帳銀行為該檔保管銀行）';

