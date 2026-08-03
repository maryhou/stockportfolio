import { useEffect, useState, useRef } from 'react';
import type { AppNotification } from '../types';
import { TargetIcon, TradeIcon, CalendarTrendIcon, InfoCircleIcon } from './icons/Icons';

interface NotificationsViewProps {
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  onNotificationClick: (n: AppNotification) => void;
  onDeleteNotification: (id: string) => void;
}

const TYPE_CONFIG = {
  target: { Icon: TargetIcon,        bg: 'bg-violet-100', iconColor: 'text-violet-600' },
  trade:  { Icon: TradeIcon,         bg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
  pnl:    { Icon: CalendarTrendIcon, bg: 'bg-amber-100',   iconColor: 'text-amber-600' },
  system: { Icon: InfoCircleIcon,    bg: 'bg-blue-100',    iconColor: 'text-blue-600' },
};

export default function NotificationsView({
  notifications, onMarkAllRead, onNotificationClick, onDeleteNotification,
}: NotificationsViewProps) {
  useEffect(() => {
    const hasUnread = notifications.some((n) => !n.read);
    if (!hasUnread) return;
    const timer = setTimeout(() => onMarkAllRead(), 1500);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex flex-col px-5 pt-safe-6 pb-32 lg:pb-10 lg:px-8 w-full">
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
            <SwipeableItem
              key={n.id}
              notification={n}
              onClick={() => onNotificationClick(n)}
              onDelete={() => onDeleteNotification(n.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Swipeable notification card ──────────────────────────────────────────────

function SwipeableItem({
  notification: n,
  onClick,
  onDelete,
}: {
  notification: AppNotification;
  onClick: () => void;
  onDelete: () => void;
}) {
  const { Icon, bg, iconColor } = TYPE_CONFIG[n.type];
  const isClickable = !!n.actionType;

  const [offsetX, setOffsetX]   = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [exiting, setExiting]   = useState(false);

  const drag = useRef({ active: false, startX: 0, hasMoved: false });

  const DELETE_THRESHOLD = -72; // px to trigger delete

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { active: true, startX: e.clientX, hasMoved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current.active || exiting) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 6) drag.current.hasMoved = true;
    setOffsetX(Math.max(-120, Math.min(0, dx))); // drag left only, cap at -120
  }

  function onPointerUp() {
    if (!drag.current.active) return;
    drag.current.active = false;
    setIsDragging(false);
    if (offsetX <= DELETE_THRESHOLD) {
      setExiting(true);
      setTimeout(onDelete, 280);
    } else {
      setOffsetX(0);
    }
  }

  function handleClick(e: React.MouseEvent) {
    if (drag.current.hasMoved) { e.preventDefault(); e.stopPropagation(); return; }
    if (isClickable) onClick();
  }

  // Red backdrop opacity scales from 0 → 1 as card drags toward threshold
  const backdropOpacity = exiting ? 1 : Math.min(1, Math.abs(offsetX) / Math.abs(DELETE_THRESHOLD));

  return (
    <div className="relative rounded-2xl overflow-hidden">
      {/* Delete backdrop — revealed as card slides left */}
      <div
        className="absolute inset-0 bg-red-500 rounded-2xl flex items-center justify-end pr-5"
        style={{ opacity: backdropOpacity }}
        aria-hidden
      >
        {/* Trash icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </div>

      {/* Card — draggable */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={handleClick}
        style={{
          transform: exiting ? 'translateX(-110%)' : `translateX(${offsetX}px)`,
          transition: isDragging ? 'none' : 'transform 0.25s ease-out',
          touchAction: 'pan-y', // allow vertical scroll; capture horizontal swipe
        }}
        className={`relative flex items-start gap-3 px-4 py-3.5 rounded-2xl border select-none ${
          n.read ? 'bg-white border-gray-100' : 'bg-gray-100 border-gray-200'
        } ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
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
      </div>
    </div>
  );
}
