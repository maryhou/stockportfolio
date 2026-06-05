import type { Stock } from '../types';
import {
  calcYearDividends,
  calcMonthDividends,
  calcDividendYield,
  calcTotalInvested,
  formatNTD,
} from '../utils/calculations';

interface DividendCardProps {
  stocks: Stock[];
  onClick: () => void;
}

export default function DividendCard({ stocks, onClick }: DividendCardProps) {
  const today      = new Date();
  const yearStr    = String(today.getFullYear());
  const monthStr   = `${yearStr}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const allDividends = stocks.flatMap((s) => s.dividends ?? []);

  const thisMonthTotal = calcMonthDividends(allDividends, monthStr);
  const thisMonthCount = allDividends.filter((d) => d.date.startsWith(monthStr)).length;
  const thisYearTotal  = calcYearDividends(allDividends, yearStr);
  const totalInvested  = stocks.reduce((s, st) => s + calcTotalInvested(st.buys), 0);
  const yieldPct       = calcDividendYield(allDividends, totalInvested);

  // Show card even with no data (empty state to guide user)
  const hasData = allDividends.length > 0;

  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 flex items-stretch gap-0 active:bg-gray-50 transition-colors text-left"
    >
      {/* Left — 本月 */}
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="20" height="13" rx="2"/>
            <path d="M2 10h20"/>
            <circle cx="12" cy="15" r="1.5" fill="#f59e0b" stroke="none"/>
          </svg>
        </div>

        <div className="min-w-0">
          <p className="text-[11px] text-gray-400 mb-0.5 font-medium">本月已入帳股息</p>
          {hasData ? (
            <>
              <p className="text-xl font-bold text-amber-500 leading-tight">
                +{formatNTD(thisMonthTotal)}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {thisMonthCount > 0 ? `已入帳 ${thisMonthCount} 筆` : '本月尚無紀錄'}
              </p>
            </>
          ) : (
            <>
              <p className="text-xl font-bold text-gray-300 leading-tight">$0</p>
              <p className="text-[11px] text-gray-300 mt-0.5">新增第一筆股息 →</p>
            </>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="w-px bg-gray-100 mx-3 self-stretch" />

      {/* Right — 今年 */}
      <div className="flex-shrink-0 text-right flex flex-col justify-between">
        <div>
          <p className="text-[11px] text-gray-400 mb-0.5 font-medium">今年</p>
          <p className="text-xl font-bold text-gray-800 leading-tight">
            {hasData ? `+${formatNTD(thisYearTotal)}` : '$0'}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {yieldPct > 0 ? `年化殖利率 ${yieldPct.toFixed(2)}%` : '年化殖利率 —'}
          </p>
        </div>
      </div>

      {/* Arrow */}
      <div className="flex items-center ml-2 flex-shrink-0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    </button>
  );
}
