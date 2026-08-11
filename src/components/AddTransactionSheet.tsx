import { useState, useEffect, useRef } from 'react';
import type { Stock, BuyTransaction, SellTransaction, AppSettings } from '../types';
import { calcAvgCost, calcFee, calcTax, calcRemainingShares, formatNTD, formatNumber, formatPrice, isETFSymbol, isBondETFSymbol, ETF_TAX_RATE, BOND_ETF_TAX_RATE } from '../utils/calculations';
import { CloseIcon } from './icons/Icons';
import BottomSheet, { type BottomSheetHandle } from './BottomSheet';
import twStocksRaw from '../data/twStocks.json';
import { lookupStockName } from '../utils/lookupStock';

interface TwStock { code: string; name: string }
const TW_STOCKS = twStocksRaw as TwStock[];

// 看起來像完整股號(4~6 碼數字 + 選用大寫尾碼 + 選用數字),值得對線上即時查名。
const CODE_LIKE_RE = /^[0-9]{4,6}[A-Za-z]?[0-9]?$/;

function searchTwStocks(query: string): TwStock[] {
  if (!query || query.length < 1) return [];
  const q = query.trim().toLowerCase();
  // 代號比對需大小寫不敏感:主動式 ETF 代號帶大寫尾碼(如 00991A、00403A),
  // query 已轉小寫,故 code 也要轉小寫才對得起來(否則打完整的 00991A 會找不到)。
  return TW_STOCKS
    .filter(s => s.code.toLowerCase().startsWith(q) || s.name.includes(query.trim()))
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
  // Sheet enter/exit animation + gestures live in BottomSheet
  const sheetRef = useRef<BottomSheetHandle>(null);

  function handleClose() {
    sheetRef.current?.close();
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
  const [looking, setLooking] = useState(false);      // 線上查名進行中
  const [lookupMiss, setLookupMiss] = useState(false); // 線上也查不到
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookupSeq = useRef(0); // 防止較舊的非同步結果覆蓋較新的輸入

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
  // 匯入持倉專用：此筆為配股（股票股利），免費取得，只填股數
  const [isStockDividend, setIsStockDividend] = useState(false);

  const sharesN = parseInt(shares) || 0;
  const totalCostN = parseFloat(totalCostInput) || 0;
  // 配股：成本 0；匯入模式：若填了總成本，反推均價（精確到小數）；否則用均價欄位
  const priceN = (() => {
    if (txType === 'import' && isStockDividend) return 0;
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
  const detectedBondETF = isBondETFSymbol(currentSymbol);
  const effectiveTaxRate = detectedBondETF ? BOND_ETF_TAX_RATE : detectedETF ? ETF_TAX_RATE : settings.taxRate;

  const tax = txType === 'sell' && priceN > 0 && sharesN > 0 ? calcTax(priceN, sharesN, effectiveTaxRate) : 0;
  const netProceeds = txType === 'sell' ? Math.floor(priceN * sharesN) - fee - tax : 0;
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

  // Cancel any pending online lookup on unmount
  useEffect(() => () => { if (lookupTimer.current) clearTimeout(lookupTimer.current); }, []);

  function handleSymbolChange(val: string) {
    setNewSymbol(val);
    if (!nameLocked) setNewName('');
    setNameLocked(false);

    // 取消任何待處理的線上查名
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    lookupSeq.current++;
    setLooking(false);
    setLookupMiss(false);

    const results = searchTwStocks(val);
    setSuggestions(results);
    setShowSuggestions(results.length > 0);

    // 本地清單查不到、但輸入像完整股號 → 對線上即時查名(剛上市的新股不在靜態清單)。
    const code = val.trim();
    if (results.length === 0 && CODE_LIKE_RE.test(code)) {
      setLooking(true);
      setShowSuggestions(true);
      const seq = lookupSeq.current;
      lookupTimer.current = setTimeout(async () => {
        const found = await lookupStockName(code);
        if (seq !== lookupSeq.current) return; // 已被更新的輸入取代
        setLooking(false);
        if (found) {
          setSuggestions([{ code: found.code, name: found.name }]);
          setShowSuggestions(true);
        } else {
          setSuggestions([]);
          setLookupMiss(true);
          setShowSuggestions(false);
        }
      }, 450);
    }
  }

  function selectSuggestion(s: TwStock) {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    lookupSeq.current++;
    setLooking(false);
    setLookupMiss(false);
    setNewSymbol(s.code);
    setNewName(s.name);
    setNameLocked(true);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  function handleSubmit() {
    // 配股：成本為 0，只需股數與日期；其餘皆需正的均價
    if (!sharesN || !date) return;
    if (!isStockDividend && !priceN) return;

    // ── 匯入初始持倉 ──────────────────────────────────────────────────────────
    if (txType === 'import') {
      // fee = 0：費用已內含在券商均價中；配股則另標 stockDividend、price=0
      const tx: BuyTransaction = { id: `b${Date.now()}`, date, price: priceN, shares: sharesN, fee: 0, imported: true, brokerId };
      if (isStockDividend) tx.stockDividend = true;
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
        const np = Math.floor(priceN * sharesN) - fee - tax;
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
      const np = Math.floor(priceN * sharesN) - fee - tax;
      const tx: SellTransaction = { id: `s${Date.now()}`, date, price: priceN, shares: sharesN, fee, tax, netProceeds: np, profit: np - avgCost * sharesN, brokerId };
      onAddSell(stockId, tx);
    }
    handleClose();
  }

  const isImport = txType === 'import';

  return (
    <BottomSheet ref={sheetRef} onClose={onClose} zBackdrop="z-40" zSheet="z-50">
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
                onClick={() => { setTxType(t.key); if (t.key !== 'import') setIsStockDividend(false); }}
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
                <p className="text-xs font-semibold text-blue-700">{isStockDividend ? '配股（股票股利）' : '適用情境'}</p>
                <p className="text-xs text-blue-600 mt-0.5 leading-relaxed">
                  {isStockDividend ? (
                    <>配股是<span className="font-semibold">免費取得</span>，不需填成本；只登記獲配股數即可，系統會自動攤低你的平均成本。</>
                  ) : (
                    <>中途開始記帳時，直接填入券商顯示的<span className="font-semibold">平均成本/股</span>與目前持有股數。
                    手續費已內含在均價中，不另外計算。</>
                  )}
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
                        onFocus={() => (suggestions.length > 0 || looking) && setShowSuggestions(true)}
                      />
                      {nameLocked && newName && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[0.6875rem] bg-primary-100 text-primary-700 font-semibold px-2 py-0.5 rounded-full">
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
                  {showSuggestions && (suggestions.length > 0 || looking) && (
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
                      {looking && suggestions.length === 0 && (
                        <div className="px-4 py-2.5 flex items-center gap-2 text-xs text-gray-400">
                          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                          </svg>
                          線上查詢股票名稱中…
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {lookupMiss && !nameLocked && (
                  <p className="text-[0.6875rem] text-gray-400 pl-1 -mt-1">
                    查無此代號的線上資料,可直接在下方手動輸入名稱。
                  </p>
                )}
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

          {/* 匯入模式：配股（股票股利）勾選 */}
          {isImport && (
            <button
              type="button"
              onClick={() => setIsStockDividend((v) => !v)}
              className={`w-full mb-4 flex items-center gap-2.5 p-3 rounded-2xl border transition-colors text-left ${
                isStockDividend ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'
              }`}
            >
              <span className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border ${
                isStockDividend ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300'
              }`}>
                {isStockDividend && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
              <span>
                <span className={`text-sm font-semibold ${isStockDividend ? 'text-blue-700' : 'text-gray-700'}`}>此為配股（股票股利）</span>
                <span className="block text-xs text-gray-400 mt-0.5">免費取得的股票，只需填獲配股數</span>
              </span>
            </button>
          )}

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
            <label className="label">{isStockDividend ? '配股基準日' : isImport ? '追蹤起始日期' : '交易日期'}</label>
            <input type="date" className="input input-date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {/* Price & Shares — 配股時只留獲配股數 */}
          {isStockDividend ? (
            <div className="mb-4">
              <label className="label">獲配股數</label>
              <input type="number" className="input" placeholder="0" value={shares} onChange={(e) => setShares(e.target.value)} />
            </div>
          ) : (
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
          )}

          {/* 匯入模式：總成本欄位（配股免填） */}
          {isImport && !isStockDividend && (
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
          {sharesN > 0 && (priceN > 0 || isStockDividend) && (
            <div className={`rounded-2xl p-4 mb-5 ${isImport ? 'bg-blue-50' : txType === 'sell' ? 'bg-emerald-50' : 'bg-primary-50'}`}>
              <p className="text-xs font-semibold text-gray-500 mb-2">計算預覽</p>
              <div className="flex flex-col gap-1.5">
                {isStockDividend ? (
                  <>
                    <PreviewRow label="獲配股數" value={`${sharesN} 股`} />
                    <PreviewRow label="取得成本" value={formatNTD(0)} highlight />
                    <div className="mt-1 pt-1 border-t border-blue-100">
                      <p className="text-xs text-blue-500 leading-relaxed">配股免費取得，會使你的平均成本自動攤低</p>
                    </div>
                  </>
                ) : isImport ? (
                  <>
                    <PreviewRow label="持有股數" value={`${sharesN} 股`} />
                    <PreviewRow label="均價/股（含費用）" value={formatPrice(priceN)} />
                    <PreviewRow
                      label="匯入總成本"
                      value={formatNTD(totalCostN > 0 ? totalCostN : priceN * sharesN)}
                      highlight
                    />
                    <div className="mt-1 pt-1 border-t border-blue-100">
                      <p className="text-xs text-blue-500 leading-relaxed">後續新增的買賣交易將以此成本為基礎計算損益</p>
                    </div>
                  </>
                ) : txType === 'buy' ? (
                  <>
                    <PreviewRow label="買入金額" value={formatNTD(Math.floor(priceN * sharesN))} />
                    <PreviewRow label="手續費" value={`-${formatNTD(fee)}`} />
                    <PreviewRow label="總花費" value={formatNTD(Math.floor(priceN * sharesN) + fee)} highlight />
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
                        {detectedBondETF ? (
                          <span className="text-[0.625rem] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">債券ETF 免稅</span>
                        ) : detectedETF ? (
                          <span className="text-[0.625rem] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">ETF 0.1%</span>
                        ) : (
                          <span className="text-[0.625rem] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">股票 0.3%</span>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-gray-700">{tax > 0 ? '-' : ''}{formatNTD(tax)}</span>
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
            disabled={!sharesN || (!isStockDividend && !priceN) || (isNewStock && (!newSymbol || !newName))}
            className={`w-full py-4 rounded-2xl font-semibold text-white transition-all ${
              isImport
                ? 'bg-blue-500 active:bg-blue-600 disabled:bg-blue-200'
                : txType === 'buy'
                ? 'bg-primary-600 active:bg-primary-700 disabled:bg-primary-200'
                : 'bg-emerald-500 active:bg-emerald-600 disabled:bg-emerald-200'
            } disabled:cursor-not-allowed`}
          >
            {isStockDividend ? '確認登記配股' : isImport ? '確認匯入持倉' : `確認${txType === 'buy' ? '買入' : '賣出'}`}
          </button>
        </div>
    </BottomSheet>
  );
}

function calcNewAvgCost(stock: Stock, price: number, shares: number, fee: number): number {
  const existingCost = stock.buys.reduce((s, b) => s + Math.floor(b.price * b.shares) + b.fee, 0);
  const existingShares = stock.buys.reduce((s, b) => s + b.shares, 0);
  return Math.floor((existingCost + Math.floor(price * shares) + fee) / (existingShares + shares));
}

function PreviewRow({ label, value, highlight, profit }: {
  label: string; value: string; highlight?: boolean; profit?: number;
}) {
  const color = profit !== undefined
    ? profit >= 0 ? 'text-red-500' : 'text-emerald-600'
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
