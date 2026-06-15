import { useState, useEffect, useRef } from 'react';
import type { Stock, BuyTransaction, SellTransaction, AppSettings } from '../types';
import { calcFee, calcTax, formatNTD, formatPrice, isETFSymbol, ETF_TAX_RATE } from '../utils/calculations';
import { CloseIcon } from './icons/Icons';
import BottomSheet, { type BottomSheetHandle } from './BottomSheet';

interface EditTransactionModalProps {
  stock: Stock;
  txType: 'buy' | 'sell';
  transaction: BuyTransaction | SellTransaction;
  avgCost: number;
  settings: AppSettings;
  onSave: (tx: BuyTransaction | SellTransaction) => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function EditTransactionModal({
  stock, txType, transaction, avgCost, settings, onSave, onDelete, onClose,
}: EditTransactionModalProps) {
  // Sheet enter/exit animation + gestures live in BottomSheet
  const sheetRef = useRef<BottomSheetHandle>(null);

  function handleClose() {
    sheetRef.current?.close();
  }

  // Detect imported transaction (匯入初始持倉 — fee already baked into price)
  const isImportedTx = txType === 'buy' && !!(transaction as BuyTransaction).imported;

  // Broker — default to transaction's brokerId, or first broker
  const [brokerId, setBrokerId] = useState(transaction.brokerId ?? settings.brokers[0]?.id ?? '');
  const selectedBroker = settings.brokers.find((b) => b.id === brokerId) ?? settings.brokers[0];

  const [date, setDate] = useState(transaction.date);
  const [price, setPrice] = useState(String(transaction.price));
  const [shares, setShares] = useState(String(transaction.shares));
  const [feeOverride, setFeeOverride] = useState(String(transaction.fee));
  const [taxOverride, setTaxOverride] = useState(
    txType === 'sell' ? String((transaction as SellTransaction).tax) : ''
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  // For imported transactions: edit via total cost rather than ugly decimal price
  const importedTotalCost = isImportedTx
    ? Math.round(transaction.price * transaction.shares)
    : 0;
  const [totalCostEdit, setTotalCostEdit] = useState(
    isImportedTx ? String(importedTotalCost) : ''
  );

  const sharesN = parseInt(shares) || 0;

  // Effective price: for imported, derive from total cost / shares
  const priceN = (() => {
    if (isImportedTx) {
      const tc = parseFloat(totalCostEdit) || 0;
      return tc > 0 && sharesN > 0 ? tc / sharesN : 0;
    }
    return parseFloat(price) || 0;
  })();

  const autoFee = priceN > 0 && sharesN > 0 && selectedBroker && !isImportedTx
    ? calcFee(priceN, sharesN, selectedBroker.feeRate, selectedBroker.feeDiscount)
    : 0;
  const detectedETF = isETFSymbol(stock.symbol);
  const effectiveTaxRate = detectedETF ? ETF_TAX_RATE : settings.taxRate;
  const autoTax = priceN > 0 && sharesN > 0 ? calcTax(priceN, sharesN, effectiveTaxRate) : 0;
  const fee = isImportedTx ? 0 : (feeOverride !== '' ? (parseInt(feeOverride) || 0) : autoFee);
  const tax = txType === 'sell'
    ? (taxOverride !== '' ? (parseInt(taxOverride) || 0) : autoTax)
    : 0;

  const netProceeds = txType === 'sell' ? priceN * sharesN - fee - tax : 0;
  const profit = txType === 'sell' ? netProceeds - avgCost * sharesN : 0;

  // Skip first render so stored fee=0 isn't overwritten by auto-calc on mount
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (isImportedTx) return;
    setFeeOverride(String(autoFee));
    if (txType === 'sell') setTaxOverride(String(autoTax));
  }, [price, shares]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSave() {
    if (!priceN || !sharesN || !date) return;
    if (txType === 'buy') {
      const saved: BuyTransaction = { id: transaction.id, date, price: priceN, shares: sharesN, fee, brokerId };
      if (isImportedTx) saved.imported = true;
      onSave(saved);
    } else {
      onSave({ id: transaction.id, date, price: priceN, shares: sharesN, fee, tax, netProceeds, profit, brokerId } as SellTransaction);
    }
    handleClose();
  }

  function handleDelete() {
    sheetRef.current?.close(onDelete);
  }

  const isBuy = txType === 'buy';

  return (
    <>
      <BottomSheet ref={sheetRef} onClose={onClose} zBackdrop="z-[55]" zSheet="z-[60]">
        <div className="px-5 pb-28">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-800">編輯交易</h2>
            <button onClick={handleClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <CloseIcon size={16} className="text-gray-500" />
            </button>
          </div>

          {/* Read-only stock info */}
          <div className="flex items-center gap-3 mb-5 p-3 bg-gray-50 rounded-2xl">
            <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              <span className="text-[11px] font-bold text-primary-600">{stock.symbol}</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">{stock.name}</p>
              <p className="text-xs text-gray-400">{stock.symbol}</p>
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              isImportedTx
                ? 'bg-blue-100 text-blue-700'
                : isBuy
                ? 'bg-primary-100 text-primary-700'
                : 'bg-emerald-100 text-emerald-700'
            }`}>
              {isImportedTx ? '匯入持倉' : isBuy ? '買入' : '賣出'}
            </span>
          </div>

          {/* Broker (shown whenever multiple brokers exist) */}
          {settings.brokers.length > 1 && (
            <div className="mb-4">
              <label className="label">券商</label>
              <select value={brokerId} onChange={(e) => { setBrokerId(e.target.value); if (!isImportedTx) setFeeOverride(''); }} className="input">
                {settings.brokers.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Date */}
          <div className="mb-4">
            <label className="label">{isImportedTx ? '追蹤起始日期' : '交易日期'}</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {/* Imported: total cost + shares; Normal: price + shares */}
          {isImportedTx ? (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="label">匯入總成本 (NT$)</label>
                <input
                  type="number" className="input"
                  value={totalCostEdit}
                  onChange={(e) => setTotalCostEdit(e.target.value)}
                />
              </div>
              <div>
                <label className="label">持有股數</label>
                <input type="number" className="input" value={shares} onChange={(e) => setShares(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="label">{isBuy ? '買入股價' : '賣出股價'} (NT$)</label>
                <input type="number" className="input" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div>
                <label className="label">股數</label>
                <input type="number" className="input" value={shares} onChange={(e) => setShares(e.target.value)} />
              </div>
            </div>
          )}

          {/* Fee — locked for imported; editable for normal */}
          {isImportedTx ? (
            <div className="mb-4">
              <label className="label">手續費</label>
              <div className="relative">
                <input type="text" className="input bg-gray-50 text-gray-400 cursor-default" value="0" readOnly />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-blue-400">已含在均價中</span>
              </div>
            </div>
          ) : (
            <div className="mb-4">
              <label className="label">手續費</label>
              <input type="number" className="input" value={feeOverride} onChange={(e) => setFeeOverride(e.target.value)} />
            </div>
          )}

          {/* Tax (sell only) */}
          {!isBuy && (
            <div className="mb-4">
              <label className="label">交易稅</label>
              <input type="number" className="input" value={taxOverride} onChange={(e) => setTaxOverride(e.target.value)} />
            </div>
          )}

          {/* Preview */}
          {priceN > 0 && sharesN > 0 && (
            <div className={`rounded-2xl p-4 mb-5 ${isImportedTx ? 'bg-blue-50' : isBuy ? 'bg-primary-50' : 'bg-emerald-50'}`}>
              <p className="text-xs font-semibold text-gray-500 mb-2">計算預覽</p>
              <div className="flex flex-col gap-1.5">
                {isImportedTx ? (
                  <>
                    <PreviewRow label="買入均價/股（含費用）" value={formatPrice(priceN)} />
                    <PreviewRow label="目前持有股數" value={`${sharesN} 股`} />
                    <PreviewRow
                      label="買入成本金額"
                      value={formatNTD(parseFloat(totalCostEdit) || priceN * sharesN)}
                      highlight
                    />
                    <div className="mt-1 pt-1 border-t border-blue-100">
                      <p className="text-[10px] text-blue-400">後續新增的買賣交易將以此成本為基礎計算損益</p>
                    </div>
                  </>
                ) : isBuy ? (
                  <>
                    <PreviewRow label="買入金額" value={formatNTD(priceN * sharesN)} />
                    <PreviewRow label="手續費" value={`-${formatNTD(fee)}`} />
                    {fee > 0 && <PreviewRow label="總花費" value={formatNTD(priceN * sharesN + fee)} highlight />}
                  </>
                ) : (
                  <>
                    <PreviewRow label="賣出金額" value={formatNTD(priceN * sharesN)} />
                    <PreviewRow label="手續費" value={`-${formatNTD(fee)}`} />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500">交易稅</span>
                        {detectedETF ? (
                          <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">ETF 0.1%</span>
                        ) : (
                          <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">股票 0.3%</span>
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

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!priceN || !sharesN || !date}
            className={`w-full py-4 rounded-2xl font-semibold text-white transition-all mb-3 ${
              isImportedTx
                ? 'bg-blue-500 active:bg-blue-600 disabled:bg-blue-200'
                : isBuy
                ? 'bg-primary-600 active:bg-primary-700 disabled:bg-primary-200'
                : 'bg-emerald-500 active:bg-emerald-600 disabled:bg-emerald-200'
            } disabled:cursor-not-allowed`}
          >
            確認修改
          </button>

          {/* Delete trigger */}
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full py-3 rounded-2xl font-semibold text-red-500 border border-red-200 bg-red-50 active:bg-red-100 transition-all"
          >
            刪除這筆交易
          </button>
        </div>
      </BottomSheet>

      {/* Delete confirm — separate overlay above everything */}
      {confirmDelete && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[90]" onClick={() => setConfirmDelete(false)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[100] bg-white rounded-3xl p-6 shadow-2xl max-w-sm mx-auto">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </div>
              <div>
                <p className="text-base font-bold text-gray-800 mb-1">確定要刪除這筆交易？</p>
                <p className="text-sm text-gray-400">此操作無法復原，交易記錄將永久移除。</p>
              </div>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-3 rounded-2xl text-sm font-semibold text-gray-600 bg-gray-100 active:bg-gray-200"
                >
                  取消
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white bg-red-500 active:bg-red-600"
                >
                  確定刪除
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
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
