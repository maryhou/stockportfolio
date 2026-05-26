import { useEffect } from 'react';
import type { AppNotification } from '../types';
import { TargetIcon, TradeIcon, CalendarTrendIcon, InfoCircleIcon } from './icons/Icons';

interface NotificationsViewProps {
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  onNotificationClick: (n: AppNotification) => void;
}

const TYPE_CONFIG = {
  target: {
    Icon: TargetIcon,
    bg: 'bg-violet-100',
    iconColor: 'text-violet-600',
  },
  trade: {
    Icon: TradeIcon,
    bg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
  },
  pnl: {
    Icon: CalendarTrendIcon,
    bg: 'bg-amber-100',
    iconColor: 'text-amber-600',
  },
  system: {
    Icon: InfoCircleIcon,
    bg: 'bg-blue-100',
    iconColor: 'text-blue-600',
  },
};

export default function NotificationsView({ notifications, onMarkAllRead, onNotificationClick }: NotificationsViewProps) {
  useEffect(() => {
    const hasUnread = notifications.some((n) => !n.read);
    if (!hasUnread) return;
    const timer = setTimeout(() => onMarkAllRead(), 1500);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex flex-col px-5 pt-6 pb-32 lg:pb-10 lg:px-8 w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">通知中心</h2>
          {unreadCount > 0 && (
            <p className="text-xs text-violet-600 mt-0.5">{unreadCount} 則未讀</p>
          )}
        </div>
      </div>

      {/* Notification list */}
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <InfoCircleIcon size={28} className="text-gray-300" />
          </div>
          <p className="text-sm">目前沒有任何通知</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {notifications.map((n) => (
            <NotificationItem key={n.id} notification={n} onClick={() => onNotificationClick(n)} />
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationItem({ notification: n, onClick }: { notification: AppNotification; onClick: () => void }) {
  const { Icon, bg, iconColor } = TYPE_CONFIG[n.type];
  const isClickable = !!n.actionType;

  return (
    <button
      onClick={isClickable ? onClick : undefined}
      className={`w-full text-left flex items-start gap-3 px-4 py-3.5 rounded-2xl border transition-all ${
        n.read
          ? 'bg-white border-gray-100'
          : 'bg-gray-50 border-gray-200'
      } ${isClickable ? 'active:scale-[0.99] cursor-pointer' : 'cursor-default'}`}
    >
      {/* Type icon */}
      <div className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
        <Icon size={18} className={iconColor} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${n.read ? 'font-medium text-gray-500' : 'font-semibold text-gray-900'}`}>
          {n.title}
        </p>
        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed line-clamp-2">{n.description}</p>
        <p className="text-[10px] text-gray-300 mt-1.5">{n.time}</p>
      </div>

      {/* Unread dot */}
      <div className="flex-shrink-0 pt-1.5">
        {!n.read
          ? <span className="w-2.5 h-2.5 rounded-full bg-violet-500 block ring-2 ring-violet-100" />
          : <span className="w-2.5 h-2.5 block" />
        }
      </div>
    </button>
  );
}
