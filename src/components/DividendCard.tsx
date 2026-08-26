import type { Stock, AppFontScale } from '../types';
import {
  calcYearDividends,
  calcMonthDividends,
  calcDividendYield,
  calcTotalInvested,
  dividendStatDate,
  formatNTD,
} from '../utils/calculations';

interface DividendCardProps {
  stocks: Stock[];
  onClick: () => void;
  fontScale?: AppFontScale;
}

export default function DividendCard({ stocks, onClick, fontScale = 'normal' }: DividendCardProps) {
  // 字體放大時「本月 / 今年」兩欄並排會被大數字擠壓/截字。
  // large/xlarge 改為直式堆疊卡:標題列 → 今年累積(主角)→ 虛線 → 本月收益/筆數;
  // 標準(normal)維持原本左右並排。
  const stacked = fontScale === 'large' || fontScale === 'xlarge';

  const chevron = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );

  const walletIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="13" rx="2"/>
      <path d="M2 10h20"/>
      <circle cx="12" cy="15" r="1.5" fill="#f59e0b" stroke="none"/>
    </svg>
  );

  const today      = new Date();
  const yearStr    = String(today.getFullYear());
  const monthStr   = `${yearStr}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const allDividends = stocks.flatMap((s) => s.dividends ?? []);

  const thisMonthTotal = calcMonthDividends(allDividends, monthStr);
  const thisMonthCount = allDividends.filter((d) => dividendStatDate(d).startsWith(monthStr)).length;
  const thisYearTotal  = calcYearDividends(allDividends, yearStr);
  const totalInvested  = stocks.reduce((s, st) => s + calcTotalInvested(st.buys), 0);
  const yieldPct       = calcDividendYield(allDividends, totalInvested);

  // Show card even with no data (empty state to guide user)
  const hasData = allDividends.length > 0;

  // ── 大 / 特大字體:直式堆疊卡(設計如需求截圖)──
  if (stacked) {
    return (
      <button
        onClick={onClick}
        className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 flex flex-col gap-3 active:bg-gray-50 transition-colors text-left"
      >
        {/* Header:圖示 + 標題 + chevron */}
        <div className="flex items-center gap-3 w-full">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
            {walletIcon}
          </div>
          <p className="text-base font-bold text-gray-800 flex-1 min-w-0">股息收益</p>
          <div className="flex items-center flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </div>

        {/* 主角:今年累積 */}
        <div className="w-full">
          <p className="text-xs text-gray-400 font-medium mb-0.5">今年累積</p>
          <p className={`text-2xl font-bold leading-tight whitespace-nowrap tabular-nums ${hasData ? 'text-gray-800' : 'text-gray-300'}`}>
            {hasData ? formatNTD(thisYearTotal) : '$0'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {yieldPct > 0 ? `年化殖利率 ${yieldPct.toFixed(2)}%` : '年化殖利率 —'}
          </p>
        </div>

        {/* 虛線分隔 */}
        <div className="w-full border-t border-dashed border-gray-200" />

        {/* 底部:本月收益 | 筆數 */}
        <div className="flex items-end justify-between w-full gap-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-400 font-medium mb-0.5">本月收益</p>
            <p className={`text-lg font-bold leading-tight whitespace-nowrap tabular-nums ${hasData ? 'text-amber-500' : 'text-gray-300'}`}>
              {hasData ? formatNTD(thisMonthTotal) : '$0'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400 flex-shrink-0">
            <span>{hasData && thisMonthCount > 0 ? `${thisMonthCount} 筆股息紀錄` : '本月尚無紀錄'}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="8" y1="13" x2="16" y2="13"/>
              <line x1="8" y1="17" x2="16" y2="17"/>
            </svg>
          </div>
        </div>
      </button>
    );
  }

  // ── 標準字體:原本左右並排 ──
  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 flex items-stretch gap-0 active:bg-gray-50 transition-colors text-left"
    >
      {/* Left — 本月 */}
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0 mt-0.5">
          {walletIcon}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[0.6875rem] text-gray-400 mb-0.5 font-medium">本月股息收益</p>
          {hasData ? (
            <>
              <p className="text-xl font-bold text-amber-500 leading-tight">
                {formatNTD(thisMonthTotal)}
              </p>
              <p className="text-[0.6875rem] text-gray-400 mt-0.5">
                {thisMonthCount > 0 ? `共 ${thisMonthCount} 筆股息紀錄` : '本月尚無紀錄'}
              </p>
            </>
          ) : (
            <>
              <p className="text-xl font-bold text-gray-300 leading-tight">$0</p>
              <p className="text-[0.6875rem] text-gray-300 mt-0.5">新增第一筆股息 →</p>
            </>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="w-px bg-gray-100 mx-3 self-stretch" />

      {/* Right — 今年 */}
      <div className="flex-shrink-0 text-right flex flex-col justify-between">
        <div>
          <p className="text-[0.6875rem] text-gray-400 mb-0.5 font-medium">今年</p>
          <p className="text-xl font-bold text-gray-800 leading-tight">
            {hasData ? formatNTD(thisYearTotal) : '$0'}
          </p>
          <p className="text-[0.6875rem] text-gray-400 mt-0.5">
            {yieldPct > 0 ? `年化殖利率 ${yieldPct.toFixed(2)}%` : '年化殖利率 —'}
          </p>
        </div>
      </div>

      {/* Arrow */}
      <div className="flex items-center ml-2 flex-shrink-0">{chevron}</div>
    </button>
  );
}
