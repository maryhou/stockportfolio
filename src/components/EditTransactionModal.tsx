import { useState, useEffect } from 'react';
import type { Stock, BuyTransaction, SellTransaction, AppSettings } from '../types';
import { calcFee, calcTax, formatNTD } from '../utils/calculations';
import { CloseIcon } from './icons/Icons';

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

  const [date, setDate] = useState(transaction.date);
  const [price, setPrice] = useState(String(transaction.price));
  const [shares, setShares] = useState(String(transaction.shares));
  const [feeOverride, setFeeOverride] = useState(String(transaction.fee));
  const [taxOverride, setTaxOverride] = useState(
    txType === 'sell' ? String((transaction as SellTransaction).tax) : ''
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const priceN = parseFloat(price) || 0;
  const sharesN = parseInt(shares) || 0;
  const autoFee = priceN > 0 && sharesN > 0 ? calcFee(priceN, sharesN, settings.feeRate, settings.feeDiscount) : 0;
  const autoTax = priceN > 0 && sharesN > 0 ? calcTax(priceN, sharesN, settings.taxRate) : 0;
  const fee = feeOverride !== '' ? (parseInt(feeOverride) || 0) : autoFee;
  const tax = txType === 'sell'
    ? (taxOverride !== '' ? (parseInt(taxOverride) || 0) : autoTax)
    : 0;

  const netProceeds = txType === 'sell' ? priceN * sharesN - fee - tax : 0;
  const profit = txType === 'sell' ? netProceeds - avgCost * sharesN : 0;

  useEffect(() => {
    setFeeOverride(String(autoFee));
    if (txType === 'sell') setTaxOverride(String(autoTax));
  }, [price, shares]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSave() {
    if (!priceN || !sharesN || !date) return;
    if (txType === 'buy') {
      onSave({ id: transaction.id, date, price: priceN, shares: sharesN, fee } as BuyTransaction);
    } else {
      onSave({ id: transaction.id, date, price: priceN, shares: sharesN, fee, tax, netProceeds, profit } as SellTransaction);
    }
    handleClose();
  }

  function handleDelete() {
    setShow(false);
    setTimeout(onDelete, 280);
  }

  const isBuy = txType === 'buy';

  return (
    <>
      {/* Sheet backdrop — fades in/out */}
      <div
        onClick={handleClose}
        className={`fixed inset-0 bg-black/30 z-[55] backdrop-blur-sm transition-opacity duration-300 ${show ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Bottom sheet — slides up/down */}
      <div
        className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] lg:max-w-lg bg-white rounded-t-3xl z-[60] shadow-2xl transition-transform duration-300 ease-out ${show ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '92vh', overflowY: 'auto' }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

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
            <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
              <span className="text-[11px] font-bold text-violet-600">{stock.symbol}</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">{stock.name}</p>
              <p className="text-xs text-gray-400">{stock.symbol}</p>
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              isBuy ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {isBuy ? '買入' : '賣出'}
            </span>
          </div>

          {/* Date */}
          <div className="mb-4">
            <label className="label">交易日期</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {/* Price & Shares */}
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

          {/* Fee */}
          <div className="mb-4">
            <label className="label">手續費</label>
            <input type="number" className="input" value={feeOverride} onChange={(e) => setFeeOverride(e.target.value)} />
          </div>

          {/* Tax (sell only) */}
          {!isBuy && (
            <div className="mb-4">
              <label className="label">交易稅</label>
              <input type="number" className="input" value={taxOverride} onChange={(e) => setTaxOverride(e.target.value)} />
            </div>
          )}

          {/* Preview */}
          {priceN > 0 && sharesN > 0 && (
            <div className={`rounded-2xl p-4 mb-5 ${isBuy ? 'bg-violet-50' : 'bg-emerald-50'}`}>
              <p className="text-xs font-semibold text-gray-500 mb-2">計算預覽</p>
              <div className="flex flex-col gap-1.5">
                {isBuy ? (
                  <>
                    <PreviewRow label="買入金額" value={formatNTD(priceN * sharesN)} />
                    <PreviewRow label="手續費" value={`-${formatNTD(fee)}`} />
                    <PreviewRow label="總花費" value={formatNTD(priceN * sharesN + fee)} highlight />
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

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!priceN || !sharesN || !date}
            className={`w-full py-4 rounded-2xl font-semibold text-white transition-all mb-3 ${
              isBuy
                ? 'bg-violet-600 active:bg-violet-700 disabled:bg-violet-200'
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
      </div>

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
