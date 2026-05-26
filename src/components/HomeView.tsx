import type { Stock } from '../types';
import {
  calcAvgCost,
  calcRemainingShares,
  calcTotalRealizedProfit,
  calcTotalNetProceeds,
  formatNTD,
  formatNumber,
} from '../utils/calculations';
import { BellIcon, SearchIcon, TrendUpIcon, TrendDownIcon } from './icons/Icons';

interface HomeViewProps {
  stocks: Stock[];
  onStockClick: (id: string) => void;
  onAddClick: () => void;
}

export default function HomeView({ stocks, onStockClick }: HomeViewProps) {
  const totalProfit = stocks.reduce((s, st) => s + calcTotalRealizedProfit(st.sells), 0);
  const totalProceeds = stocks.reduce((s, st) => s + calcTotalNetProceeds(st.sells), 0);
  const totalCurrentValue = stocks.reduce((st, stock) => {
    const remaining = calcRemainingShares(stock.buys, stock.sells);
    return st + remaining * stock.currentPrice;
  }, 0);

  const displayValue = totalCurrentValue + totalProceeds;
  const isProfitable = totalProfit >= 0;

  return (
    <div className="flex flex-col gap-5 px-5 pt-6 pb-32">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">Hello,</p>
          <h1 className="text-2xl font-bold text-gray-800">Mary 👋</h1>
        </div>
        <div className="flex gap-2">
          <button className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
            <SearchIcon size={18} />
          </button>
          <button className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 relative">
            <BellIcon size={18} />
            <span className="absolute top-2 right-2 w-2 h-2 bg-violet-500 rounded-full" />
          </button>
        </div>
      </div>

      {/* Portfolio Value Card */}
      <div
        className="rounded-3xl p-6 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #a78bfa 100%)' }}
      >
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10" />
        <div className="absolute -right-4 -bottom-10 w-32 h-32 rounded-full bg-white/10" />
        <p className="text-sm text-white/70 mb-1">投資組合價值</p>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold tracking-tight">
              NT${formatNumber(Math.round(displayValue))}
            </p>
            <div className={`flex items-center gap-1 mt-2 text-sm font-medium ${isProfitable ? 'text-emerald-300' : 'text-red-300'}`}>
              {isProfitable ? <TrendUpIcon size={14} /> : <TrendDownIcon size={14} />}
              <span>已實現損益 {isProfitable ? '+' : ''}{formatNTD(totalProfit)}</span>
            </div>
          </div>
          <div className="text-right text-white/70 text-xs space-y-1">
            <p>可取得金額</p>
            <p className="text-white font-semibold text-sm">{formatNTD(totalProceeds)}</p>
          </div>
        </div>
      </div>

      {/* Stock Holdings */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">我的持股</h2>
          <button className="text-xs text-violet-600 font-medium">查看全部</button>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {stocks.map((stock) => (
            <StockCard key={stock.id} stock={stock} onClick={() => onStockClick(stock.id)} />
          ))}
        </div>
      </div>

      {/* Recent Transactions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">最近交易</h2>
          <button className="text-xs text-violet-600 font-medium">查看全部</button>
        </div>
        <div className="flex flex-col gap-2">
          {stocks.flatMap((stock) => [
            ...stock.sells.map((tx) => (
              <RecentItem
                key={`sell-${tx.id}`}
                symbol={stock.symbol}
                name={stock.name}
                type="sell"
                date={tx.date}
                shares={tx.shares}
                amount={tx.netProceeds}
                profit={tx.profit}
              />
            )),
            ...stock.buys.map((tx) => (
              <RecentItem
                key={`buy-${tx.id}`}
                symbol={stock.symbol}
                name={stock.name}
                type="buy"
                date={tx.date}
                shares={tx.shares}
                amount={tx.price * tx.shares + tx.fee}
                profit={null}
              />
            )),
          ])
            .sort((a, b) => (b.key as string).localeCompare(a.key as string))
            .slice(0, 5)}
        </div>
      </div>
    </div>
  );
}

interface StockCardProps {
  stock: Stock;
  onClick: () => void;
}

function StockCard({ stock, onClick }: StockCardProps) {
  const avgCost = calcAvgCost(stock.buys);
  const remaining = calcRemainingShares(stock.buys, stock.sells);
  const realizedProfit = calcTotalRealizedProfit(stock.sells);
  const unrealizedPL = remaining > 0 ? (stock.currentPrice - avgCost) * remaining : 0;
  const isProfitable = realizedProfit + unrealizedPL >= 0;

  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 w-52 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left active:scale-[0.98] transition-transform"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
          <span className="text-xs font-bold text-violet-600">{stock.symbol}</span>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          isProfitable ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
        }`}>
          {isProfitable ? '+' : ''}{formatNTD(realizedProfit + unrealizedPL)}
        </span>
      </div>
      <p className="font-semibold text-gray-800 text-sm">{stock.name}</p>
      <p className="text-xs text-gray-400 mt-0.5">{stock.symbol}</p>
      <div className="mt-3 pt-3 border-t border-gray-50 grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] text-gray-400">平均成本</p>
          <p className="text-xs font-semibold text-gray-700">{formatNumber(avgCost)}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400">剩餘股數</p>
          <p className="text-xs font-semibold text-gray-700">{remaining} 股</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400">目前股價</p>
          <p className="text-xs font-semibold text-gray-700">{formatNumber(stock.currentPrice)}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400">目標股價</p>
          <p className="text-xs font-semibold text-violet-600">{formatNumber(stock.targetPrice)}</p>
        </div>
      </div>
    </button>
  );
}

interface RecentItemProps {
  symbol: string;
  name: string;
  type: 'buy' | 'sell';
  date: string;
  shares: number;
  amount: number;
  profit: number | null;
}

function RecentItem({ symbol, name, type, date, shares, amount, profit }: RecentItemProps) {
  return (
    <div className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-50">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
        type === 'buy' ? 'bg-violet-100' : 'bg-emerald-50'
      }`}>
        <span className={`text-xs font-bold ${type === 'buy' ? 'text-violet-600' : 'text-emerald-600'}`}>
          {symbol.slice(0, 2)}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{name}</p>
        <p className="text-xs text-gray-400">{date} · {type === 'buy' ? '買入' : '賣出'} {shares} 股</p>
      </div>
      <div className="text-right">
        <p className={`text-sm font-semibold ${type === 'sell' ? 'text-emerald-600' : 'text-gray-700'}`}>
          {type === 'sell' ? '+' : '-'}{formatNTD(amount)}
        </p>
        {profit !== null && (
          <p className={`text-xs font-medium ${profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            損益 {profit >= 0 ? '+' : ''}{formatNTD(profit)}
          </p>
        )}
      </div>
    </div>
  );
}
