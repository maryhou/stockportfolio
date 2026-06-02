import { useState, useEffect, useRef } from 'react';
import type { Stock, BuyTransaction, SellTransaction, AppSettings } from '../types';
import { calcAvgCost, calcFee, calcTax, calcRemainingShares, formatNTD, formatNumber, formatPrice, isETFSymbol, ETF_TAX_RATE } from '../utils/calculations';
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
  settings: AppSettings;
  onClose: () => void;
  onAddBuy: (stockId: string, tx: BuyTransaction) => void;
  onAddSell: (stockId: string, tx: SellTransaction) => void;
  onAddStock: (stock: Stock) => void;
}

type TxType = 'buy' | 'sell' | 'import';

const TABS: { key: TxType; label: string; activeColor: string }[] = [
  { key: 'buy',    label: '買入',    activeColor: 'bg-primary-600' },
  { key: 'sell',   label: '賣出',    activeColor: 'bg-emerald-500' },
  { key: 'import', label: '匯入持倉', activeColor: 'bg-blue-500' },
];

export default function AddTransactionSheet({
  stocks,
  settings,
  onClose,
  onAddBuy,
  onAddSell,
  onAddStock,
}: AddTransactionSheetProps) {
  // ── Slide animation ────────────────────────────────────────────────────────
  const [show, setShow] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  function handleClose() {
    setShow(false);
    setTimeout(onClose, 280);
  }

  const [txType, setTxType] = useState<TxType>('buy');
  const activeTabIdx = TABS.findIndex((t) => t.key === txType);
  const [stockId, setStockId] = useState(stocks[0]?.id ?? '');
  const [isNewStock, setIsNewStock] = useState(false);

  // New stock fields
  const [newSymbol, setNewSymbol] = useState('');
  const [newName, setNewName] = useState('');
  const [suggestions, setSuggestions] = useState<TwStock[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [nameLocked, setNameLocked] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Broker selection — defaults to first broker
  const [brokerId, setBrokerId] = useState(settings.brokers[0]?.id ?? '');
  const selectedBroker = settings.brokers.find((b) => b.id === brokerId) ?? settings.brokers[0];

  // Transaction fields
  const [date, setDate] = useState(todayStr());
  const [price, setPrice] = useState('');
  const [shares, setShares] = useState('');
  const [feeOverride, setFeeOverride] = useState('');
  // 匯入持倉專用：直接輸入總成本（優先於均價×股數）
  const [totalCostInput, setTotalCostInput] = useState('');

  const sharesN = parseInt(shares) || 0;
  const totalCostN = parseFloat(totalCostInput) || 0;
  // 匯入模式：若填了總成本，反推均價（精確到小數）；否則用均價欄位
  const priceN = (() => {
    if (txType === 'import' && totalCostN > 0 && sharesN > 0) return totalCostN / sharesN;
    return parseFloat(price) || 0;
  })();
  const autoFee = priceN > 0 && sharesN > 0 && selectedBroker && txType !== 'import'
    ? calcFee(priceN, sharesN, selectedBroker.feeRate, selectedBroker.feeDiscount)
    : 0;
  const fee = txType === 'import' ? 0 : (feeOverride !== '' ? parseInt(feeOverride) : autoFee);

  const stock = stocks.find((s) => s.id === stockId);
  const avgCost = stock ? calcAvgCost(stock.buys) : 0;

  // Buying into a fully-closed stock → will create a new investment record
  const isBuyingClosedStock =
    txType === 'buy' &&
    !isNewStock &&
    stock != null &&
    stock.buys.length > 0 &&
    calcRemainingShares(stock.buys, stock.sells) === 0;

  // ETF auto-detection
  const currentSymbol = isNewStock ? newSymbol : (stock?.symbol ?? '');
  const detectedETF = isETFSymbol(currentSymbol);
  const effectiveTaxRate = detectedETF ? ETF_TAX_RATE : settings.taxRate;

  const tax = txType === 'sell' && priceN > 0 && sharesN > 0 ? calcTax(priceN, sharesN, effectiveTaxRate) : 0;
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
    if (!nameLocked) setNewName('');
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

    // ── 匯入初始持倉 ──────────────────────────────────────────────────────────
    if (txType === 'import') {
      // fee = 0：費用已內含在券商均價中
      const tx: BuyTransaction = { id: `b${Date.now()}`, date, price: priceN, shares: sharesN, fee: 0, imported: true, brokerId };
      if (isNewStock) {
        if (!newName || !newSymbol) return;
        onAddStock({ id: newSymbol, name: newName, symbol: newSymbol, targetPrice: 0, currentPrice: priceN, buys: [tx], sells: [] });
      } else if (stock) {
        onAddBuy(stockId, tx);
      }
      handleClose();
      return;
    }

    if (isNewStock) {
      if (!newName || !newSymbol) return;
      if (txType === 'buy') {
        const tx: BuyTransaction = { id: `b${Date.now()}`, date, price: priceN, shares: sharesN, fee, brokerId };
        onAddStock({ id: newSymbol, name: newName, symbol: newSymbol, targetPrice: 0, currentPrice: priceN, buys: [tx], sells: [] });
      } else {
        const np = priceN * sharesN - fee - tax;
        const tx: SellTransaction = { id: `s${Date.now()}`, date, price: priceN, shares: sharesN, fee, tax, netProceeds: np, profit: np, brokerId };
        onAddStock({ id: newSymbol, name: newName, symbol: newSymbol, targetPrice: 0, currentPrice: priceN, buys: [], sells: [tx] });
      }
      handleClose();
      return;
    }

    // Buying into a closed stock → create a new independent investment record
    if (isBuyingClosedStock && stock) {
      const tx: BuyTransaction = { id: `b${Date.now()}`, date, price: priceN, shares: sharesN, fee, brokerId };
      onAddStock({
        id: `${stock.symbol}_${Date.now()}`,
        name: stock.name,
        symbol: stock.symbol,
        targetPrice: stock.targetPrice,
        currentPrice: priceN,
        buys: [tx],
        sells: [],
      });
      handleClose();
      return;
    }

    if (txType === 'buy') {
      const tx: BuyTransaction = { id: `b${Date.now()}`, date, price: priceN, shares: sharesN, fee, brokerId };
      onAddBuy(stockId, tx);
    } else {
      const np = priceN * sharesN - fee - tax;
      const tx: SellTransaction = { id: `s${Date.now()}`, date, price: priceN, shares: sharesN, fee, tax, netProceeds: np, profit: np - avgCost * sharesN, brokerId };
      onAddSell(stockId, tx);
    }
    handleClose();
  }

  const isImport = txType === 'import';

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        className={`fixed inset-0 bg-black/30 z-40 backdrop-blur-sm transition-opacity duration-300 ${show ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] lg:max-w-lg bg-white rounded-t-3xl z-50 shadow-2xl transition-transform duration-300 ease-out ${show ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '92vh', overflowY: 'auto' }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="px-5 pb-10">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-800">新增交易</h2>
            <button onClick={handleClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <CloseIcon size={16} className="text-gray-500" />
            </button>
          </div>

          {/* 3-tab toggle: 買入 / 賣出 / 匯入持倉 */}
          <div className="relative flex mb-4 p-1 bg-gray-100 rounded-2xl">
            <div
              className={`absolute top-1 bottom-1 rounded-xl shadow-sm transition-all duration-300 ease-in-out ${TABS[activeTabIdx].activeColor}`}
              style={{
                width: `calc((100% - 8px) / ${TABS.length})`,
                transform: `translateX(calc(${activeTabIdx} * 100%))`,
                left: '4px',
              }}
            />
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTxType(t.key)}
                className={`relative z-10 flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-200 ${
                  txType === t.key ? 'text-white' : 'text-gray-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 匯入持倉 說明 banner */}
          {isImport && (
            <div className="mb-4 bg-blue-50 border border-blue-100 rounded-2xl p-3.5 flex items-start gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/>
                <circle cx="12" cy="8" r="1" fill="#3b82f6" stroke="none"/>
              </svg>
              <div>
                <p className="text-xs font-semibold text-blue-700">適用情境</p>
                <p className="text-xs text-blue-600 mt-0.5 leading-relaxed">
                  中途開始記帳時，直接填入券商顯示的<span className="font-semibold">平均成本/股</span>與目前持有股數。
                  手續費已內含在均價中，不另外計算。
                </p>
              </div>
            </div>
          )}

          {/* Broker selector */}
          {settings.brokers.length > 1 && (
            <div className="mb-4">
              <label className="label">券商</label>
              <select value={brokerId} onChange={(e) => { setBrokerId(e.target.value); setFeeOverride(''); }} className="input">
                {settings.brokers.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

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
                      {nameLocked && newName && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] bg-primary-100 text-primary-700 font-semibold px-2 py-0.5 rounded-full">
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
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-10 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
                      {suggestions.map((s) => (
                        <button
                          key={s.code}
                          onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                          className="w-full text-left px-4 py-2.5 hover:bg-primary-50 flex items-center justify-between transition-colors"
                        >
                          <span className="text-sm font-semibold text-gray-800">{s.name}</span>
                          <span className="text-xs text-gray-400 font-mono">{s.code}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {!nameLocked && newSymbol && (
                  <input
                    className="input"
                    placeholder="股票名稱（找不到時手動輸入）"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                )}
                {nameLocked && (
                  <button className="text-left text-xs text-gray-400 pl-1" onClick={() => setNameLocked(false)}>
                    股票名稱：{newName}　<span className="underline">手動修改</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Closed-stock warning (buy only) */}
          {isBuyingClosedStock && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-2.5">
              <div className="flex-shrink-0 mt-0.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-700">此股票已清倉</p>
                <p className="text-xs text-amber-600 mt-0.5">此筆買入將建立新的投資紀錄，不會累計在原本的交易紀錄上</p>
              </div>
            </div>
          )}

          {/* Date */}
          <div className="mb-4">
            <label className="label">{isImport ? '追蹤起始日期' : '交易日期'}</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {/* Price & Shares */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="label">
                {isImport ? '均價/股 (NT$)' : txType === 'buy' ? '買入股價 (NT$)' : '賣出股價 (NT$)'}
              </label>
              <input
                type="number" className="input" placeholder="0"
                value={isImport && totalCostN > 0 && sharesN > 0 ? (totalCostN / sharesN).toFixed(4) : price}
                onChange={(e) => { setPrice(e.target.value); if (isImport) setTotalCostInput(''); }}
                readOnly={isImport && totalCostN > 0}
              />
            </div>
            <div>
              <label className="label">{isImport ? '目前持有股數' : '股數'}</label>
              <input type="number" className="input" placeholder="0" value={shares} onChange={(e) => setShares(e.target.value)} />
            </div>
          </div>

          {/* 匯入模式：總成本欄位 */}
          {isImport && (
            <div className="mb-4">
              <label className="label">
                總成本 (NT$)
                <span className="text-gray-400 font-normal ml-1">（填券商顯示的總成本，自動反推均價）</span>
              </label>
              <input
                type="number" className="input" placeholder="如：383,519"
                value={totalCostInput}
                onChange={(e) => { setTotalCostInput(e.target.value); setPrice(''); }}
              />
            </div>
          )}

          {/* Fee (hidden for import) */}
          {!isImport && (
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
          )}

          {/* Calculation preview */}
          {priceN > 0 && sharesN > 0 && (
            <div className={`rounded-2xl p-4 mb-5 ${isImport ? 'bg-blue-50' : txType === 'sell' ? 'bg-emerald-50' : 'bg-primary-50'}`}>
              <p className="text-xs font-semibold text-gray-500 mb-2">計算預覽</p>
              <div className="flex flex-col gap-1.5">
                {isImport ? (
                  <>
                    <PreviewRow label="持有股數" value={`${sharesN} 股`} />
                    <PreviewRow label="均價/股（含費用）" value={formatPrice(priceN)} />
                    <PreviewRow
                      label="匯入總成本"
                      value={formatNTD(totalCostN > 0 ? totalCostN : priceN * sharesN)}
                      highlight
                    />
                    <div className="mt-1 pt-1 border-t border-blue-100">
                      <p className="text-[10px] text-blue-400">後續新增的買賣交易將以此成本為基礎計算損益</p>
                    </div>
                  </>
                ) : txType === 'buy' ? (
                  <>
                    <PreviewRow label="買入金額" value={formatNTD(priceN * sharesN)} />
                    <PreviewRow label="手續費" value={`-${formatNTD(fee)}`} />
                    <PreviewRow label="總花費" value={formatNTD(priceN * sharesN + fee)} highlight />
                    {stock && !isBuyingClosedStock && (
                      <PreviewRow label="新平均成本" value={formatNumber(calcNewAvgCost(stock, priceN, sharesN, fee))} highlight />
                    )}
                  </>
                ) : (
                  <>
                    <PreviewRow label="賣出金額" value={formatNTD(priceN * sharesN)} />
                    <PreviewRow label="手續費" value={`-${formatNTD(fee)}`} />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500">交易稅</span>
                        {detectedETF && (
                          <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">ETF 0.1%</span>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-gray-700">-{formatNTD(tax)}</span>
                    </div>
                    <PreviewRow label="總回收金額" value={formatNTD(netProceeds)} highlight />
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
              isImport
                ? 'bg-blue-500 active:bg-blue-600 disabled:bg-blue-200'
                : txType === 'buy'
                ? 'bg-primary-600 active:bg-primary-700 disabled:bg-primary-200'
                : 'bg-emerald-500 active:bg-emerald-600 disabled:bg-emerald-200'
            } disabled:cursor-not-allowed`}
          >
            {isImport ? '確認匯入持倉' : `確認${txType === 'buy' ? '買入' : '賣出'}`}
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
