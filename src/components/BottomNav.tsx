import { HomeIcon, ChartIcon, UserIcon, PlusIcon } from './icons/Icons';
import type { ViewName } from '../types';

interface BottomNavProps {
  active: ViewName;
  onNavigate: (v: ViewName) => void;
  onAddClick: () => void;
}

export default function BottomNav({ active, onNavigate, onAddClick }: BottomNavProps) {
  const tab = (view: ViewName, Icon: React.ComponentType<{ size?: number; className?: string }>, label: string) => (
    <button
      onClick={() => onNavigate(view)}
      className={`flex flex-col items-center gap-0.5 px-4 py-2 transition-colors ${
        active === view ? 'text-violet-600' : 'text-gray-400'
      }`}
    >
      <Icon size={22} />
      <span className="text-[10px] font-medium">{label}</span>
      {active === view && (
        <span className="absolute -bottom-0 w-5 h-0.5 rounded-full bg-violet-600" />
      )}
    </button>
  );

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 flex items-center justify-around px-2 pb-safe z-50"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
      {tab('home', HomeIcon, '首頁')}
      {tab('activity', ChartIcon, '活動')}

      {/* Center FAB */}
      <button
        onClick={onAddClick}
        className="relative -top-5 w-14 h-14 rounded-full bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-400/40 active:scale-95 transition-transform"
      >
        <PlusIcon size={26} className="text-white" />
      </button>

      {tab('detail', ChartIcon, '持倉')}
      {tab('profile', UserIcon, '我的')}
    </nav>
  );
}
