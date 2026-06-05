import { useState } from 'react';
import {
  isBiometricSupported,
  isBiometricEnabled,
  registerBiometric,
  disableBiometric,
} from '../utils/biometric';
import type { AppSettings, Broker, AppTheme } from '../types';
import { CloseIcon } from './icons/Icons';

interface SettingsSheetProps {
  settings: AppSettings;
  onSave: (s: AppSettings) => void;
  onThemePreview: (t: AppTheme) => void;
  onClose: () => void;
}

type EditMode = { kind: 'none' } | { kind: 'edit'; broker: Broker } | { kind: 'new' };

function emptyBrokerForm() {
  return { name: '', feeRateInput: '0.1425', feeDiscountInput: '60' };
}

export default function SettingsSheet({ settings, onSave, onThemePreview, onClose }: SettingsSheetProps) {
  const [userName,     setUserName]     = useState(settings.userName);
  const [taxRateInput, setTaxRateInput] = useState(String(+(settings.taxRate * 100).toPrecision(6)));
  const [brokers,      setBrokers]      = useState<Broker[]>([...settings.brokers]);
  const [editMode,     setEditMode]     = useState<EditMode>({ kind: 'none' });
  const [theme,        setTheme]        = useState<AppTheme>(settings.theme ?? 'default');
  const [bioEnabled,   setBioEnabled]   = useState(() => isBiometricEnabled());
  const [bioLoading,   setBioLoading]   = useState(false);
  const [bioError,     setBioError]     = useState('');

  // Inline broker form fields
  const [formName,     setFormName]     = useState('');
  const [formFeeRate,  setFormFeeRate]  = useState('0.1425');
  const [formDiscount, setFormDiscount] = useState('60');

  function openEdit(broker: Broker) {
    setEditMode({ kind: 'edit', broker });
    setFormName(broker.name);
    setFormFeeRate(String(+(broker.feeRate * 100).toPrecision(6)));
    setFormDiscount(String(+(broker.feeDiscount * 100).toPrecision(6)));
  }

  function openNew() {
    const f = emptyBrokerForm();
    setEditMode({ kind: 'new' });
    setFormName(f.name);
    setFormFeeRate(f.feeRateInput);
    setFormDiscount(f.feeDiscountInput);
  }

  function cancelEdit() { setEditMode({ kind: 'none' }); }

  function saveBroker() {
    const rate = parseFloat(formFeeRate) / 100 || 0;
    const disc = parseFloat(formDiscount) / 100 || 1;
    const name = formName.trim();
    if (!name) return;

    if (editMode.kind === 'new') {
      setBrokers((prev) => [...prev, { id: `b${Date.now()}`, name, feeRate: rate, feeDiscount: disc }]);
    } else if (editMode.kind === 'edit') {
      const id = editMode.broker.id;
      setBrokers((prev) => prev.map((b) => b.id === id ? { ...b, name, feeRate: rate, feeDiscount: disc } : b));
    }
    setEditMode({ kind: 'none' });
  }

  function deleteBroker(id: string) {
    setBrokers((prev) => prev.filter((b) => b.id !== id));
  }

  // Revert the live preview and close without saving
  function handleClose() {
    onThemePreview(settings.theme ?? 'default');
    onClose();
  }

  function handleSave() {
    onSave({
      userName: userName.trim() || settings.userName,
      brokers: brokers.length > 0 ? brokers : settings.brokers,
      taxRate: parseFloat(taxRateInput) / 100 || settings.taxRate,
      theme,
    });
    onClose();
  }

  const formEffective = ((parseFloat(formFeeRate) || 0) * (parseFloat(formDiscount) || 0) / 100).toFixed(4);

  async function handleBioToggle() {
    setBioError('');
    if (bioEnabled) {
      disableBiometric();
      setBioEnabled(false);
    } else {
      setBioLoading(true);
      const ok = await registerBiometric();
      setBioLoading(false);
      if (ok) {
        setBioEnabled(true);
      } else {
        setBioError('設定失敗，請確認裝置支援 Face ID / 指紋辨識');
      }
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm" onClick={handleClose} />

      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] lg:max-w-lg bg-white rounded-t-3xl z-50 shadow-2xl"
        style={{ maxHeight: '92vh', overflowY: 'auto' }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="px-5 pb-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-800">偏好設定</h2>
            <button onClick={handleClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <CloseIcon size={16} className="text-gray-500" />
            </button>
          </div>

          {/* 個人 */}
          <SectionLabel>個人</SectionLabel>
          <div className="mb-5">
            <label className="label">使用者名稱</label>
            <input className="input" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Mary" />
          </div>

          {/* 券商管理 */}
          <SectionLabel>券商費率</SectionLabel>
          <div className="flex flex-col gap-2 mb-3">
            {brokers.map((broker) => {
              const isEditing = editMode.kind === 'edit' && editMode.broker.id === broker.id;
              const effective = (broker.feeRate * broker.feeDiscount * 100).toFixed(4);
              const zhe       = (broker.feeDiscount * 10).toFixed(1);

              return (
                <div key={broker.id} className="bg-gray-50 rounded-2xl overflow-hidden">
                  {/* View row */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{broker.name}</p>
                      <p className="text-xs text-gray-400">
                        {(broker.feeRate * 100).toFixed(4)}% × {zhe}折 = 有效 {effective}%
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => isEditing ? cancelEdit() : openEdit(broker)}
                        className="text-xs text-primary-600 font-semibold px-2.5 py-1 bg-primary-100 rounded-lg active:bg-primary-200"
                      >
                        {isEditing ? '取消' : '編輯'}
                      </button>
                      {brokers.length > 1 && (
                        <button
                          onClick={() => deleteBroker(broker.id)}
                          className="text-xs text-red-500 font-semibold px-2.5 py-1 bg-red-50 rounded-lg active:bg-red-100"
                        >
                          刪除
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline edit form */}
                  {isEditing && (
                    <BrokerForm
                      name={formName} onName={setFormName}
                      feeRate={formFeeRate} onFeeRate={setFormFeeRate}
                      discount={formDiscount} onDiscount={setFormDiscount}
                      effective={formEffective}
                      onSave={saveBroker} onCancel={cancelEdit}
                    />
                  )}
                </div>
              );
            })}

            {/* New broker inline form */}
            {editMode.kind === 'new' && (
              <div className="bg-primary-50 rounded-2xl overflow-hidden">
                <p className="text-xs font-semibold text-primary-700 px-4 pt-3">新增券商</p>
                <BrokerForm
                  name={formName} onName={setFormName}
                  feeRate={formFeeRate} onFeeRate={setFormFeeRate}
                  discount={formDiscount} onDiscount={setFormDiscount}
                  effective={formEffective}
                  onSave={saveBroker} onCancel={cancelEdit}
                />
              </div>
            )}
          </div>

          {editMode.kind !== 'new' && (
            <button
              onClick={openNew}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-primary-600 border border-primary-200 bg-primary-50 active:bg-primary-100 mb-5"
            >
              + 新增券商
            </button>
          )}

          {/* 交易稅 */}
          <SectionLabel>交易稅（賣出適用）</SectionLabel>
          <div className="mb-6">
            <div className="relative">
              <input
                type="number" className="input pr-8"
                value={taxRateInput} onChange={(e) => setTaxRateInput(e.target.value)}
                step="0.01" min="0"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1 pl-1">一般股票 0.3%，ETF 0.1%</p>
          </div>

          {/* 介面主題 */}
          <SectionLabel>介面主題</SectionLabel>
          <div className="flex gap-2 mb-6">

            {/* ① 預設 — dot and selected state always fixed violet (never follows theme) */}
            <button
              onClick={() => { setTheme('default'); onThemePreview('default'); }}
              className={`flex-1 flex items-center gap-2 px-2.5 py-3 rounded-xl border-2 transition-all ${
                theme === 'default'
                  ? 'border-violet-600 bg-violet-50'
                  : 'border-gray-200 bg-white active:bg-gray-50'
              }`}
            >
              <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 bg-violet-600" />
              <div className="text-left min-w-0">
                <p className={`text-xs font-semibold truncate ${theme === 'default' ? 'text-violet-700' : 'text-gray-700'}`}>預設</p>
                <p className="text-[10px] text-gray-400 truncate">紫色主調</p>
              </div>
            </button>

            {/* ② 中性色 — follows theme when selected */}
            <button
              onClick={() => { setTheme('neutral'); onThemePreview('neutral'); }}
              className={`flex-1 flex items-center gap-2 px-2.5 py-3 rounded-xl border-2 transition-all ${
                theme === 'neutral'
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-gray-200 bg-white active:bg-gray-50'
              }`}
            >
              <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 bg-gray-500" />
              <div className="text-left min-w-0">
                <p className={`text-xs font-semibold truncate ${theme === 'neutral' ? 'text-primary-700' : 'text-gray-700'}`}>中性色</p>
                <p className="text-[10px] text-gray-400 truncate">灰階主調</p>
              </div>
            </button>

            {/* ③ 暗色模式 — dot and selected state always use hardcoded slate (immune to CSS-var inversion)
                  so the card itself always previews what dark mode looks like */}
            <button
              onClick={() => { setTheme('dark'); onThemePreview('dark'); }}
              className={`flex-1 flex items-center gap-2 px-2.5 py-3 rounded-xl border-2 transition-all ${
                theme === 'dark'
                  ? 'border-slate-500 bg-slate-900'
                  : 'border-gray-200 bg-white active:bg-gray-50'
              }`}
            >
              <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 bg-slate-800 ring-1 ring-slate-500" />
              <div className="text-left min-w-0">
                <p className={`text-xs font-semibold truncate ${theme === 'dark' ? 'text-slate-100' : 'text-gray-700'}`}>暗色模式</p>
                <p className={`text-[10px] truncate ${theme === 'dark' ? 'text-slate-400' : 'text-gray-400'}`}>深色背景</p>
              </div>
            </button>

          </div>

          {/* 隱私設定 */}
          {isBiometricSupported() && (
            <>
              <SectionLabel>隱私</SectionLabel>
              <div className="mb-5">
                <div className="bg-gray-50 rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600">
                        <path d="M4 8V6a2 2 0 0 1 2-2h2"/><path d="M16 4h2a2 2 0 0 1 2 2v2"/>
                        <path d="M20 16v2a2 2 0 0 1-2 2h-2"/><path d="M8 20H6a2 2 0 0 1-2-2v-2"/>
                        <path d="M9 10h.01"/><path d="M15 10h.01"/>
                        <path d="M9.5 15a3.5 3.5 0 0 0 5 0"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Face ID / 生物辨識解鎖</p>
                      <p className="text-xs text-gray-400 mt-0.5">開啟 App 時需要驗證身份</p>
                    </div>
                  </div>
                  {/* Toggle */}
                  <button
                    onClick={handleBioToggle}
                    disabled={bioLoading}
                    className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${
                      bioEnabled ? 'bg-primary-500' : 'bg-gray-200'
                    } ${bioLoading ? 'opacity-50' : ''}`}
                  >
                    <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                      bioEnabled ? 'translate-x-5.5' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
                {bioError && (
                  <p className="text-xs text-red-500 mt-2 px-1">{bioError}</p>
                )}
              </div>
            </>
          )}

          <button
            onClick={handleSave}
            className="w-full py-4 rounded-2xl font-semibold text-white bg-primary-600 active:bg-primary-700 transition-all"
          >
            儲存設定
          </button>
        </div>
      </div>
    </>
  );
}

// ── Reusable broker inline form ─────────────────────────────────────────────
function BrokerForm({ name, onName, feeRate, onFeeRate, discount, onDiscount, effective, onSave, onCancel }: {
  name: string; onName: (v: string) => void;
  feeRate: string; onFeeRate: (v: string) => void;
  discount: string; onDiscount: (v: string) => void;
  effective: string;
  onSave: () => void; onCancel: () => void;
}) {
  const zhe = (parseFloat(discount) / 10 || 0).toFixed(1);
  return (
    <div className="px-4 pb-4 pt-2 flex flex-col gap-3">
      <div>
        <label className="label">券商名稱</label>
        <input className="input" placeholder="元大券商" value={name} onChange={(e) => onName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">手續費率</label>
          <div className="relative">
            <input type="number" className="input pr-8" step="0.0001" min="0"
              value={feeRate} onChange={(e) => onFeeRate(e.target.value)} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-1 pl-1">標準 0.1425%</p>
        </div>
        <div>
          <label className="label">折扣</label>
          <div className="relative">
            <input type="number" className="input pr-8" step="1" min="0" max="100"
              value={discount} onChange={(e) => onDiscount(e.target.value)} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-1 pl-1">= {zhe} 折</p>
        </div>
      </div>
      <div className="bg-white rounded-xl px-3 py-2 flex items-center justify-between">
        <p className="text-xs text-primary-700 font-medium">有效手續費率</p>
        <p className="text-sm font-bold text-primary-700">{effective}%</p>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 active:bg-gray-200">
          取消
        </button>
        <button onClick={onSave} disabled={!name.trim()}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary-600 active:bg-primary-700 disabled:bg-primary-200">
          儲存
        </button>
      </div>
    </div>
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
