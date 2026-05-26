import { useState, useEffect } from 'react';
import type { Stock, BuyTransaction, SellTransaction } from '../types';
import { calcAvgCost, calcFee, calcTax, buildSellTransaction, formatNTD, formatNumber } from '../utils/calculations';
import { CloseIcon } from './icons/Icons';

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
  const [newStockName, setNewStockName] = useState('');
  const [newStockSymbol, setNewStockSymbol] = useState('');

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

  useEffect(() => {
    setFeeOverride('');
  }, [price, shares]);

  function handleSubmit() {
    if (!priceN || !sharesN || !date) return;

    let targetId = stockId;
    if (isNewStock) {
      if (!newStockName || !newStockSymbol) return;
      const newStock: Stock = {
        id: newStockSymbol,
        name: newStockName,
        symbol: newStockSymbol,
        targetPrice: 0,
        currentPrice: priceN,
        buys: [],
        sells: [],
      };
      onAddStock(newStock);
      targetId = newStockSymbol;
    }

    if (txType === 'buy') {
      const tx: BuyTransaction = {
        id: `b${Date.now()}`,
        date,
        price: priceN,
        shares: sharesN,
        fee,
      };
      onAddBuy(targetId, tx);
    } else {
      const tx = buildSellTransaction(`s${Date.now()}`, date, priceN, sharesN, avgCost);
      onAddSell(targetId, { ...tx, fee, tax });
    }
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-50 shadow-2xl"
        style={{ maxHeight: '92vh', overflowY: 'auto' }}>
        {/* Handle */}
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
                    ? t === 'buy'
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'bg-emerald-500 text-white shadow-sm'
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
                <select
                  value={stockId}
                  onChange={(e) => setStockId(e.target.value)}
                  className="input flex-1"
                >
                  {stocks.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.symbol})</option>
                  ))}
                </select>
                <button
                  onClick={() => setIsNewStock(true)}
                  className="px-3 py-2.5 bg-gray-100 rounded-xl text-xs text-gray-500 font-medium whitespace-nowrap"
                >
                  + 新股票
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="股票名稱（如：台積電）"
                    value={newStockName}
                    onChange={(e) => setNewStockName(e.target.value)}
                  />
                  <input
                    className="input w-24"
                    placeholder="代號"
                    value={newStockSymbol}
                    onChange={(e) => setNewStockSymbol(e.target.value.toUpperCase())}
                  />
                </div>
                <button onClick={() => setIsNewStock(false)} className="text-xs text-gray-400 text-left">
                  ← 選擇已有股票
                </button>
              </div>
            )}
          </div>

          {/* Date */}
          <div className="mb-4">
            <label className="label">交易日期</label>
            <input
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Price & Shares */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="label">{txType === 'buy' ? '買入股價' : '賣出股價'} (NT$)</label>
              <input
                type="number"
                className="input"
                placeholder="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div>
              <label className="label">股數</label>
              <input
                type="number"
                className="input"
                placeholder="0"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
              />
            </div>
          </div>

          {/* Fee */}
          <div className="mb-4">
            <label className="label">
              手續費 <span className="text-gray-400 font-normal">（自動計算）</span>
            </label>
            <div className="relative">
              <input
                type="number"
                className="input"
                placeholder={autoFee > 0 ? String(autoFee) : '0'}
                value={feeOverride}
                onChange={(e) => setFeeOverride(e.target.value)}
              />
              {feeOverride === '' && autoFee > 0 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  自動：{autoFee}
                </span>
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
                    <PreviewRow
                      label="損益"
                      value={`${profit >= 0 ? '+' : ''}${formatNTD(profit)}`}
                      profit={profit}
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!priceN || !sharesN}
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
