import { useState } from 'react';

interface OnboardingModalProps {
  onComplete: (userName: string) => void;
  onGoogleSignIn: () => Promise<{ isNewUser: boolean; displayName: string }>;
}

type Step = 1 | 2 | 3;

export default function OnboardingModal({ onComplete, onGoogleSignIn }: OnboardingModalProps) {
  const [step, setStep]           = useState<Step>(1);
  const [name, setName]           = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [signedIn, setSignedIn]   = useState(false);

  async function handleGoogleSignIn() {
    setSigningIn(true);
    try {
      const { isNewUser, displayName } = await onGoogleSignIn();
      setSignedIn(true);
      if (isNewUser) {
        setName(displayName);
        setStep(2);
      } else {
        setStep(3);
      }
    } catch {
      // user cancelled or error — fall through to name step
      setStep(2);
    } finally {
      setSigningIn(false);
    }
  }

  function handleFinish() {
    onComplete(name.trim() || (signedIn ? '' : '投資人'));
  }

  // Steps shown in indicator: always 3
  const totalSteps: Step[] = [1, 2, 3];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">

        {/* Step indicator */}
        <div className="flex gap-1.5 justify-center pt-5 pb-1">
          {totalSteps.map((s) => (
            <div
              key={s}
              className={`h-1 rounded-full transition-all duration-300 ${
                s === step ? 'w-6 bg-primary-500' : s < step ? 'w-3 bg-primary-300' : 'w-3 bg-gray-200'
              }`}
            />
          ))}
        </div>

        <div className="px-6 pt-4 pb-7">

          {/* ── Step 1: Google Sign-in ── */}
          {step === 1 && (
            <>
              <div className="mb-5 text-center">
                <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-blue-50">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-800 mb-1">跨裝置同步資料</h2>
                <p className="text-sm text-gray-400 leading-relaxed">
                  以 Google 帳號登入後，你的投資資料會自動<br />在所有裝置上同步
                </p>
              </div>

              <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-5 flex flex-col gap-3">
                {[
                  {
                    text: '手機、平板、電腦資料同步',
                    svg: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
                      </svg>
                    ),
                  },
                  {
                    text: '資料安全備份在雲端',
                    svg: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
                      </svg>
                    ),
                  },
                  {
                    text: '僅你自己可以存取',
                    svg: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    ),
                  },
                ].map(({ svg, text }) => (
                  <div key={text} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0 text-primary-600">
                      {svg}
                    </div>
                    <p className="text-xs text-gray-600">{text}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={handleGoogleSignIn}
                disabled={signingIn}
                className="w-full py-3.5 rounded-2xl font-semibold text-white bg-primary-600 active:bg-primary-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2 mb-3"
              >
                {signingIn ? (
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="white" fillOpacity="0.9"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="white" fillOpacity="0.7"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="white" fillOpacity="0.5"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="white" fillOpacity="0.6"/>
                  </svg>
                )}
                以 Google 帳號登入
              </button>

              <button
                onClick={() => setStep(2)}
                className="w-full py-2.5 rounded-2xl text-sm font-semibold text-gray-400 active:text-gray-600 transition-colors"
              >
                先跳過，稍後再設定
              </button>
            </>
          )}

          {/* ── Step 2: Name ── */}
          {step === 2 && (
            <>
              <div className="mb-5 text-center">
                <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--hero-from), var(--hero-to))' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-800 mb-1">歡迎使用股票追蹤</h2>
                <p className="text-sm text-gray-400">先告訴我們你怎麼稱呼</p>
              </div>

              <div className="mb-6">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">你的名字</label>
                <input
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition"
                  placeholder="例如：Mary"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && name.trim() && setStep(3)}
                  autoFocus
                />
              </div>

              <button
                onClick={() => setStep(3)}
                disabled={!name.trim()}
                className="w-full py-3.5 rounded-2xl font-semibold text-white bg-primary-600 active:bg-primary-700 disabled:bg-primary-200 transition-colors"
              >
                下一步
              </button>
            </>
          )}

          {/* ── Step 3: Broker hint ── */}
          {step === 3 && (
            <>
              <div className="mb-5 text-center">
                <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-emerald-50">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-800 mb-1">
                  {signedIn ? '設定完成！' : '最後一步'}
                </h2>
                <p className="text-sm text-gray-400">記得設定你的券商費率</p>
              </div>

              <div className="bg-primary-50 rounded-2xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-primary-800 mb-0.5">「我的」→「設定」</p>
                    <p className="text-xs text-primary-600 leading-relaxed">
                      可以新增券商名稱、手續費率及折扣，讓損益計算更準確
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleFinish}
                className="w-full py-3.5 rounded-2xl font-semibold text-white bg-primary-600 active:bg-primary-700 transition-colors"
              >
                開始使用
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
