import { useEffect, useState } from 'react';

export interface ToastData {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface ToastProps {
  toasts: ToastData[];
}

export default function ToastContainer({ toasts }: ToastProps) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 items-center pointer-events-none w-full max-w-[360px] px-4">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: ToastData }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation on mount
    const enter = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(enter);
  }, []);

  const isSuccess = toast.type === 'success';

  return (
    <div
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg pointer-events-auto transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      } ${isSuccess ? 'bg-gray-900 text-white' : 'bg-red-500 text-white'}`}
    >
      <span className="text-lg flex-shrink-0">{isSuccess ? '✓' : '✕'}</span>
      <span className="text-sm font-medium">{toast.message}</span>
    </div>
  );
}
