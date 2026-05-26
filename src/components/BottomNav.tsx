import { HomeIcon, ChartIcon, UserIcon, PlusIcon } from './icons/Icons';
import type { ViewName } from '../types';

interface BottomNavProps {
  active: ViewName;
  onNavigate: (v: ViewName) => void;
  onAddClick: () => void;
}

function BriefcaseIcon({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <line x1="12" y1="12" x2="12" y2="16" />
      <line x1="10" y1="14" x2="14" y2="14" />
    </svg>
  );
}

export default function BottomNav({ active, onNavigate, onAddClick }: BottomNavProps) {
  const tab = (
    view: ViewName,
    Icon: React.ComponentType<{ size?: number; className?: string }>,
    label: string,
  ) => (
    <button
      onClick={() => onNavigate(view)}
      className={`relative flex flex-col items-center gap-0.5 px-4 py-2 transition-colors ${
        active === view ? 'text-violet-600' : 'text-gray-400'
      }`}
    >
      <Icon size={22} />
      <span className="text-[10px] font-medium">{label}</span>
      {active === view && (
        <span className="absolute bottom-0 w-5 h-0.5 rounded-full bg-violet-600" />
      )}
    </button>
  );

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] md:max-w-full bg-white border-t border-gray-100 flex items-center justify-around px-2 z-50"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
    >
      {tab('home',     HomeIcon,       '首頁')}
      {tab('activity', ChartIcon,      '活動')}

      {/* Centre FAB */}
      <button
        onClick={onAddClick}
        className="relative -top-5 w-14 h-14 rounded-full bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-400/40 active:scale-95 transition-transform"
      >
        <PlusIcon size={26} className="text-white" />
      </button>

      {tab('holdings', BriefcaseIcon, '持倉')}
      {tab('profile',  UserIcon,      '我的')}
    </nav>
  );
}
