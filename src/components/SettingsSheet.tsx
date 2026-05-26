import { useState } from 'react';
import type { AppSettings } from '../types';
import { CloseIcon } from './icons/Icons';

interface SettingsSheetProps {
  settings: AppSettings;
  onSave: (s: AppSettings) => void;
  onClose: () => void;
}

export default function SettingsSheet({ settings, onSave, onClose }: SettingsSheetProps) {
  const [portfolioName, setPortfolioName] = useState(settings.portfolioName);
  const [brokerName, setBrokerName] = useState(settings.brokerName);
  // Display as percentages (e.g. 0.001425 → "0.1425")
  const [feeRateInput, setFeeRateInput] = useState(String(+(settings.feeRate * 100).toPrecision(6)));
  const [feeDiscountInput, setFeeDiscountInput] = useState(String(+(settings.feeDiscount * 100).toPrecision(6)));
  const [taxRateInput, setTaxRateInput] = useState(String(+(settings.taxRate * 100).toPrecision(6)));

  const feeRateVal = parseFloat(feeRateInput) || 0;
  const feeDiscountVal = parseFloat(feeDiscountInput) || 0;
  const taxRateVal = parseFloat(taxRateInput) || 0;
  const effectiveFee = ((feeRateVal * feeDiscountVal) / 100).toFixed(4);
  const zhe = (feeDiscountVal / 10).toFixed(1);

  function handleSave() {
    onSave({
      portfolioName: portfolioName.trim() || settings.portfolioName,
      brokerName: brokerName.trim() || settings.brokerName,
      feeRate: feeRateVal / 100,
      feeDiscount: feeDiscountVal / 100,
      taxRate: taxRateVal / 100,
    });
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm" onClick={onClose} />

      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] lg:max-w-lg bg-white rounded-t-3xl z-50 shadow-2xl"
        style={{ maxHeight: '92vh', overflowY: 'auto' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="px-5 pb-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-800">偏好設定</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <CloseIcon size={16} className="text-gray-500" />
            </button>
          </div>

          {/* Section: Portfolio */}
          <SectionLabel>投資組合</SectionLabel>
          <div className="mb-5">
            <label className="label">名稱</label>
            <input
              className="input"
              value={portfolioName}
              onChange={(e) => setPortfolioName(e.target.value)}
              placeholder="我的投資組合"
            />
          </div>

          {/* Section: Broker */}
          <SectionLabel>券商與費用</SectionLabel>

          <div className="mb-4">
            <label className="label">券商名稱</label>
            <input
              className="input"
              value={brokerName}
              onChange={(e) => setBrokerName(e.target.value)}
              placeholder="元大券商"
            />
          </div>

          {/* Fee rate */}
          <div className="mb-4">
            <label className="label">手續費率</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  className="input pr-8"
                  value={feeRateInput}
                  onChange={(e) => setFeeRateInput(e.target.value)}
                  step="0.0001"
                  min="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-1 pl-1">台灣標準費率為 0.1425%</p>
          </div>

          {/* Fee discount */}
          <div className="mb-4">
            <label className="label">手續費折扣</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  className="input pr-8"
                  value={feeDiscountInput}
                  onChange={(e) => setFeeDiscountInput(e.target.value)}
                  step="1"
                  min="0"
                  max="100"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
              </div>
              <span className="text-sm text-violet-600 font-semibold whitespace-nowrap">= {zhe} 折</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1 pl-1">例：60 表示 6 折優惠</p>
          </div>

          {/* Effective fee preview */}
          <div className="bg-violet-50 rounded-2xl px-4 py-3 mb-5 flex items-center justify-between">
            <p className="text-xs text-violet-700 font-medium">有效手續費率</p>
            <p className="text-sm font-bold text-violet-700">{effectiveFee}%</p>
          </div>

          {/* Tax rate */}
          <div className="mb-6">
            <label className="label">交易稅率（賣出適用）</label>
            <div className="relative">
              <input
                type="number"
                className="input pr-8"
                value={taxRateInput}
                onChange={(e) => setTaxRateInput(e.target.value)}
                step="0.01"
                min="0"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1 pl-1">台灣標準交易稅為 0.3%（ETF 為 0.1%）</p>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            className="w-full py-4 rounded-2xl font-semibold text-white bg-violet-600 active:bg-violet-700 transition-all"
          >
            儲存設定
          </button>
        </div>
      </div>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{children}</p>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}
