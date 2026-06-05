import { useState, useEffect } from 'react';
import { verifyBiometric } from '../utils/biometric';

interface AppLockProps {
  onUnlocked: () => void;
}

type Status = 'idle' | 'verifying' | 'error';

export default function AppLock({ onUnlocked }: AppLockProps) {
  const [status, setStatus] = useState<Status>('idle');

  // Auto-trigger on mount (slight delay for transition)
  useEffect(() => {
    const t = setTimeout(() => triggerBiometric(), 400);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function triggerBiometric() {
    setStatus('verifying');
    const ok = await verifyBiometric();
    if (ok) {
      onUnlocked();
    } else {
      setStatus('error');
    }
  }

  return (
    <div
      className="fixed inset-0 z-[500] flex flex-col items-center justify-center select-none"
      style={{ background: 'linear-gradient(160deg, var(--hero-from) 0%, var(--hero-to) 100%)' }}
    >
      {/* App icon */}
      <div className="w-20 h-20 rounded-3xl bg-white/15 backdrop-blur-sm flex items-center justify-center mb-5 shadow-lg">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18"/>
          <path d="M7 16l4-4 4 4 4-4"/>
        </svg>
      </div>

      <h1 className="text-2xl font-bold text-white mb-1">WealthTrack</h1>
      <p className="text-white/60 text-sm mb-14">投資日誌</p>

      {/* Unlock button */}
      <button
        onClick={triggerBiometric}
        disabled={status === 'verifying'}
        className="flex flex-col items-center gap-3 active:scale-95 transition-transform disabled:opacity-60"
      >
        <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
          {status === 'verifying' ? (
            <svg className="animate-spin text-white" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
          ) : (
            /* Face ID icon */
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8V6a2 2 0 0 1 2-2h2"/>
              <path d="M16 4h2a2 2 0 0 1 2 2v2"/>
              <path d="M20 16v2a2 2 0 0 1-2 2h-2"/>
              <path d="M8 20H6a2 2 0 0 1-2-2v-2"/>
              <path d="M9 10h.01"/>
              <path d="M15 10h.01"/>
              <path d="M9.5 15a3.5 3.5 0 0 0 5 0"/>
            </svg>
          )}
        </div>
        <p className="text-white/80 text-sm font-medium">
          {status === 'verifying' ? '驗證中...' : status === 'error' ? '點擊重試' : '點擊解鎖'}
        </p>
      </button>

      {status === 'error' && (
        <p className="text-white/50 text-xs mt-4">Face ID / 生物辨識驗證失敗</p>
      )}
    </div>
  );
}
