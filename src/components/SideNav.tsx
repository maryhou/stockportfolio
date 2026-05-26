import { HomeIcon, ChartIcon, UserIcon, PlusIcon } from './icons/Icons';
import type { ViewName } from '../types';

interface SideNavProps {
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

export default function SideNav({ active, onNavigate, onAddClick }: SideNavProps) {
  const items: { view: ViewName; Icon: React.ComponentType<{ size?: number; className?: string }>; label: string }[] = [
    { view: 'home',     Icon: HomeIcon,       label: '首頁' },
    { view: 'activity', Icon: ChartIcon,      label: '活動分析' },
    { view: 'holdings', Icon: BriefcaseIcon,  label: '持倉列表' },
    { view: 'profile',  Icon: UserIcon,       label: '我的' },
  ];

  return (
    <aside className="hidden lg:flex fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-100 flex-col z-40 shadow-sm">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center">
            <span className="text-white text-sm font-bold">S</span>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800">股票追蹤</p>
            <p className="text-[10px] text-gray-400">Stock Portfolio</p>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {items.map(({ view, Icon, label }) => (
          <button
            key={view}
            onClick={() => onNavigate(view)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all w-full text-left ${
              active === view
                ? 'bg-violet-50 text-violet-700'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            <Icon size={18} className={active === view ? 'text-violet-600' : ''} />
            {label}
            {active === view && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-500" />
            )}
          </button>
        ))}
      </nav>

      {/* Add button */}
      <div className="px-4 pb-6">
        <button
          onClick={onAddClick}
          className="w-full py-3 bg-violet-600 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-violet-700 active:bg-violet-800 transition-colors shadow-md shadow-violet-200"
        >
          <PlusIcon size={16} />
          新增交易
        </button>
      </div>
    </aside>
  );
}
