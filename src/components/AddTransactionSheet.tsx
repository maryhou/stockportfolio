import { useState, useEffect, useRef } from 'react';
import type { Stock, BuyTransaction, SellTransaction } from '../types';
import { calcAvgCost, calcFee, calcTax, buildSellTransaction, formatNTD, formatNumber } from '../utils/calculations';
import { CloseIcon } from './icons/Icons';
import twStocksRaw from '../data/twStocks.json';

interface TwStock { code: string; name: string }
const TW_STOCKS = twStocksRaw as TwStock[];

function searchTwStocks(query: string): TwStock[] {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase();
  return TW_STOCKS
    .filter(s => s.code.startsWith(q) || s.name.includes(query))
    .slice(0, 8);
}

interface AddTransactionSheetProps {
  stocks: Stock[];
  onClose: () => void;
  onAddBuy: (stockId: string, tx: BuyTransaction) => void;
  onAddSell: (stockId: string, tx: SellTransaction) => void;
  onAddStock: (stock: Stock) => void;
}

type TxType = 'buy' | 'sell';

export default function AddTransactionSheet({
  stocks,
  onClose,
  onAddBuy,
  onAddSell,
  onAddStock,
}: AddTransactionSheetProps) {
  const [txType, setTxType] = useState<TxType>('buy');
  const [stockId, setStockId] = useState(stocks[0]?.id ?? '');
  const [isNewStock, setIsNewStock] = useState(false);

  // New stock fields
  const [newSymbol, setNewSymbol] = useState('');
  const [newName, setNewName] = useState('');
  const [suggestions, setSuggestions] = useState<TwStock[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [nameLocked, setNameLocked] = useState(false); // true once auto-filled
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Transaction fields
  const [date, setDate] = useState(todayStr());
  const [price, setPrice] = useState('');
  const [shares, setShares] = useState('');
  const [feeOverride, setFeeOverride] = useState('');

  const priceN = parseFloat(price) || 0;
  const sharesN = parseInt(shares) || 0;
  const autoFee = priceN > 0 && sharesN > 0 ? calcFee(priceN, sharesN) : 0;
  const fee = feeOverride !== '' ? parseInt(feeOverride) : autoFee;
  const tax = txType === 'sell' && priceN > 0 && sharesN > 0 ? calcTax(priceN, sharesN) : 0;

  const stock = stocks.find((s) => s.id === stockId);
  const avgCost = stock ? calcAvgCost(stock.buys) : 0;
  const netProceeds = txType === 'sell' ? priceN * sharesN - fee - tax : 0;
  const profit = txType === 'sell' ? netProceeds - avgCost * sharesN : 0;

  useEffect(() => { setFeeOverride(''); }, [price, shares]);

  // Close suggestions on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function handleSymbolChange(val: string) {
    setNewSymbol(val);
    if (!nameLocked) setNewName(''); // clear name when symbol changes unless locked
    setNameLocked(false);
    const results = searchTwStocks(val);
    setSuggestions(results);
    setShowSuggestions(results.length > 0);
  }

  function selectSuggestion(s: TwStock) {
    setNewSymbol(s.code);
    setNewName(s.name);
    setNameLocked(true);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  function handleSubmit() {
    if (!priceN || !sharesN || !date) return;

    let targetId = stockId;
    if (isNewStock) {
      if (!newName || !newSymbol) return;
      const newStock: Stock = {
        id: newSymbol,
        name: newName,
        symbol: newSymbol,
        targetPrice: 0,
        currentPrice: priceN,
        buys: [],
        sells: [],
      };
      onAddStock(newStock);
      targetId = newSymbol;
    }

    if (txType === 'buy') {
      const tx: BuyTransaction = { id: `b${Date.now()}`, date, price: priceN, shares: sharesN, fee };
      onAddBuy(targetId, tx);
    } else {
      const tx = buildSellTransaction(`s${Date.now()}`, date, priceN, sharesN, avgCost);
      onAddSell(targetId, { ...tx, fee, tax });
    }
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm" onClick={onClose} />

      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] lg:max-w-lg bg-white rounded-t-3xl z-50 shadow-2xl"
        style={{ maxHeight: '92vh', overflowY: 'auto' }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="px-5 pb-10">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-800">新增交易</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <CloseIcon size={16} className="text-gray-500" />
            </button>
          </div>

          {/* Buy / Sell toggle */}
          <div className="flex gap-2 mb-5 p-1 bg-gray-100 rounded-2xl">
            {(['buy', 'sell'] as TxType[]).map((t) => (
              <button
                key={t}
                onClick={() => setTxType(t)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  txType === t
                    ? t === 'buy' ? 'bg-violet-600 text-white shadow-sm' : 'bg-emerald-500 text-white shadow-sm'
                    : 'text-gray-400'
                }`}
              >
                {t === 'buy' ? '買入' : '賣出'}
              </button>
            ))}
          </div>

          {/* Stock selection */}
          <div className="mb-4">
            <label className="label">股票</label>
            {!isNewStock ? (
              <div className="flex gap-2">
                <select value={stockId} onChange={(e) => setStockId(e.target.value)} className="input flex-1">
                  {stocks.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.symbol})</option>
                  ))}
                </select>
                <button
                  onClick={() => { setIsNewStock(true); setNewSymbol(''); setNewName(''); setNameLocked(false); }}
                  className="px-3 py-2.5 bg-gray-100 rounded-xl text-xs text-gray-500 font-medium whitespace-nowrap"
                >
                  + 新股票
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {/* Symbol search input with autocomplete */}
                <div className="relative" ref={suggestionsRef}>
                  <div className="flex gap-2 items-start">
                    <div className="relative flex-1">
                      <input
                        autoFocus
                        className="input w-full"
                        placeholder="輸入股票代號（如：2330）"
                        value={newSymbol}
                        onChange={(e) => handleSymbolChange(e.target.value)}
                        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                      />
                      {/* Auto-filled name badge */}
                      {nameLocked && newName && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] bg-violet-100 text-violet-700 font-semibold px-2 py-0.5 rounded-full">
                          {newName}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => { setIsNewStock(false); setSuggestions([]); }}
                      className="text-xs text-gray-400 px-2 py-2.5 whitespace-nowrap"
                    >
                      ← 返回
                    </button>
                  </div>

                  {/* Suggestions dropdown */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-10 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
                      {suggestions.map((s) => (
                        <button
                          key={s.code}
                          onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                          className="w-full text-left px-4 py-2.5 hover:bg-violet-50 flex items-center justify-between transition-colors"
                        >
                          <span className="text-sm font-semibold text-gray-800">{s.name}</span>
                          <span className="text-xs text-gray-400 font-mono">{s.code}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Manual name override (shown when not auto-locked or when user clears) */}
                {!nameLocked && newSymbol && (
                  <input
                    className="input"
                    placeholder="股票名稱（找不到時手動輸入）"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                )}

                {/* Locked name — tap to unlock for manual edit */}
                {nameLocked && (
                  <button
                    className="text-left text-xs text-gray-400 pl-1"
                    onClick={() => setNameLocked(false)}
                  >
                    股票名稱：{newName}　<span className="underline">手動修改</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Date */}
          <div className="mb-4">
            <label className="label">交易日期</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {/* Price & Shares */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="label">{txType === 'buy' ? '買入股價' : '賣出股價'} (NT$)</label>
              <input type="number" className="input" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <label className="label">股數</label>
              <input type="number" className="input" placeholder="0" value={shares} onChange={(e) => setShares(e.target.value)} />
            </div>
          </div>

          {/* Fee */}
          <div className="mb-4">
            <label className="label">手續費 <span className="text-gray-400 font-normal">（自動計算）</span></label>
            <div className="relative">
              <input
                type="number"
                className="input"
                placeholder={autoFee > 0 ? String(autoFee) : '0'}
                value={feeOverride}
                onChange={(e) => setFeeOverride(e.target.value)}
              />
              {feeOverride === '' && autoFee > 0 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">自動：{autoFee}</span>
              )}
            </div>
          </div>

          {/* Calculation preview */}
          {priceN > 0 && sharesN > 0 && (
            <div className={`rounded-2xl p-4 mb-5 ${txType === 'sell' ? 'bg-emerald-50' : 'bg-violet-50'}`}>
              <p className="text-xs font-semibold text-gray-500 mb-2">計算預覽</p>
              <div className="flex flex-col gap-1.5">
                {txType === 'buy' ? (
                  <>
                    <PreviewRow label="買入金額" value={formatNTD(priceN * sharesN)} />
                    <PreviewRow label="手續費" value={`-${formatNTD(fee)}`} />
                    <PreviewRow label="總花費" value={formatNTD(priceN * sharesN + fee)} highlight />
                    {stock && (
                      <PreviewRow
                        label="新平均成本"
                        value={formatNumber(calcNewAvgCost(stock, priceN, sharesN, fee))}
                        highlight
                      />
                    )}
                  </>
                ) : (
                  <>
                    <PreviewRow label="賣出金額" value={formatNTD(priceN * sharesN)} />
                    <PreviewRow label="手續費" value={`-${formatNTD(fee)}`} />
                    <PreviewRow label="交易稅" value={`-${formatNTD(tax)}`} />
                    <PreviewRow label="可取得金額" value={formatNTD(netProceeds)} highlight />
                    <PreviewRow label="損益" value={`${profit >= 0 ? '+' : ''}${formatNTD(profit)}`} profit={profit} />
                  </>
                )}
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!priceN || !sharesN || (isNewStock && (!newSymbol || !newName))}
            className={`w-full py-4 rounded-2xl font-semibold text-white transition-all ${
              txType === 'buy'
                ? 'bg-violet-600 active:bg-violet-700 disabled:bg-violet-200'
                : 'bg-emerald-500 active:bg-emerald-600 disabled:bg-emerald-200'
            } disabled:cursor-not-allowed`}
          >
            確認{txType === 'buy' ? '買入' : '賣出'}
          </button>
        </div>
      </div>
    </>
  );
}

function calcNewAvgCost(stock: Stock, price: number, shares: number, fee: number): number {
  const existingCost = stock.buys.reduce((s, b) => s + b.price * b.shares + b.fee, 0);
  const existingShares = stock.buys.reduce((s, b) => s + b.shares, 0);
  return Math.floor((existingCost + price * shares + fee) / (existingShares + shares));
}

function PreviewRow({ label, value, highlight, profit }: {
  label: string; value: string; highlight?: boolean; profit?: number;
}) {
  const color = profit !== undefined
    ? profit >= 0 ? 'text-emerald-600' : 'text-red-500'
    : highlight ? 'text-gray-800 font-bold' : 'text-gray-600';
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm ${color}`}>{value}</span>
    </div>
  );
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
