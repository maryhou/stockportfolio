import { useEffect, useState } from 'react';

export interface ToastData {
  id: number;
  message: string;
  type: 'success' | 'error';
  /** 選用：右側動作按鈕（如「復原」）。點擊後執行並關閉此 toast。 */
  action?: { label: string; onClick: () => void };
}

interface ToastProps {
  toasts: ToastData[];
  onDismiss: (id: number) => void;
  /** 當前介面主題：深色主題用黑色玻璃，其餘（預設／中性色）用白色玻璃。 */
  theme?: string;
}

export default function ToastContainer({ toasts, onDismiss, theme }: ToastProps) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 items-center pointer-events-none w-full max-w-[380px] px-4">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} dark={theme === 'dark'} />
      ))}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="7" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12" y2="17" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-1" />
    </svg>
  );
}

function ToastItem({ toast, onDismiss, dark }: { toast: ToastData; onDismiss: (id: number) => void; dark: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation on mount
    const enter = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(enter);
  }, []);

  const isSuccess = toast.type === 'success';

  // 玻璃底色隨主題：深色主題→黑色玻璃；預設／中性色→白色玻璃。
  const surface = dark
    ? 'bg-gray-900/80 supports-[backdrop-filter]:bg-gray-900/70 border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.35)] text-white'
    : 'bg-white/85 supports-[backdrop-filter]:bg-white/70 border-black/5 shadow-[0_8px_30px_rgba(0,0,0,0.18)] text-gray-900';
  const messageColor = dark ? 'text-white' : 'text-gray-900';
  const actionClasses = dark ? 'border-white/15 text-blue-300' : 'border-black/10 text-blue-600';

  return (
    <div
      className={`w-full flex items-center gap-3 pl-3.5 pr-4 py-3 rounded-2xl pointer-events-auto transition-all duration-300 ease-out
        backdrop-blur-2xl border ${surface} ${
        visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-95'
      }`}
    >
      <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${isSuccess ? 'bg-emerald-500' : 'bg-red-500'}`}>
        {isSuccess ? <CheckIcon /> : <AlertIcon />}
      </span>
      <span className={`text-sm font-medium flex-1 min-w-0 leading-snug ${messageColor}`}>{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => { toast.action!.onClick(); onDismiss(toast.id); }}
          className={`flex-shrink-0 flex items-center gap-1 pl-3 ml-0.5 border-l font-semibold text-sm active:opacity-60 transition-opacity ${actionClasses}`}
        >
          <UndoIcon />
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
