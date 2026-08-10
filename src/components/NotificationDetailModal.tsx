import type { AppNotification } from '../types';
import { TYPE_CONFIG } from './NotificationsView';
import { CloseIcon } from './icons/Icons';

interface NotificationDetailModalProps {
  notification: AppNotification;
  /** 有 actionType 時的前往按鈕;省略則不顯示。 */
  onAction?: () => void;
  onClose: () => void;
}

const ACTION_LABEL: Record<NonNullable<AppNotification['actionType']>, string> = {
  stock: '查看持股',
  activity: '查看交易紀錄',
};

export default function NotificationDetailModal({ notification: n, onAction, onClose }: NotificationDetailModalProps) {
  const { Icon, bg, iconColor } = TYPE_CONFIG[n.type];
  const actionLabel = n.actionType ? ACTION_LABEL[n.actionType] : null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 backdrop-blur-sm px-5"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-5">
          {/* Header:icon + 關閉 */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className={`w-11 h-11 rounded-2xl ${bg} flex items-center justify-center flex-shrink-0`}>
              <Icon size={20} className={iconColor} />
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 active:bg-gray-200"
              aria-label="關閉"
            >
              <CloseIcon size={16} className="text-gray-500" />
            </button>
          </div>

          {/* 標題 */}
          <h2 className="text-lg font-bold text-gray-800 leading-snug">{n.title}</h2>
          <p className="text-xs text-gray-400 mt-1">{n.time}</p>

          {/* 完整內容(不截斷)*/}
          <p className="text-sm text-gray-600 leading-relaxed mt-4 whitespace-pre-wrap">{n.description}</p>
        </div>

        {/* 按鈕 */}
        <div className="px-6 pb-6 pt-1 flex flex-col gap-2.5">
          {actionLabel && onAction && (
            <button
              onClick={onAction}
              className="w-full py-3.5 rounded-2xl font-semibold text-white bg-primary-600 active:bg-primary-700 transition-colors"
            >
              {actionLabel}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl font-semibold text-gray-500 bg-gray-100 active:bg-gray-200 transition-colors"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
