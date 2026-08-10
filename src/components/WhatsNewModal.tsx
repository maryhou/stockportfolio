export interface WhatsNewItem {
  title: string;
  desc: string;
}

interface WhatsNewModalProps {
  items: WhatsNewItem[];
  /** 主要 CTA:跳到偏好設定調整字體。省略則不顯示該按鈕。 */
  onAdjustFont?: () => void;
  onClose: () => void;
}

/**
 * 一次性「更新內容」modal:每個版本首次開啟時彈一次(版本控制在 App.tsx)。
 * 主打字體大小(無障礙),故給長輩用的文字刻意大一點、對比清楚。
 */
export default function WhatsNewModal({ items, onAdjustFont, onClose }: WhatsNewModalProps) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 backdrop-blur-sm px-5"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 頂部漸層 header */}
        <div className="px-6 pt-7 pb-6 text-center" style={{ background: 'linear-gradient(135deg, var(--hero-from), var(--hero-to))' }}>
          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-3">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.9 3.85 4.25.62-3.07 3 .72 4.23L12 15.7l-3.8 2 .72-4.23-3.07-3 4.25-.62L12 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-white">App 更新囉!</h2>
          <p className="text-xs text-white/80 mt-1">這次帶來這些新功能與優化</p>
        </div>

        {/* 更新項目 */}
        <div className="px-6 py-5 flex flex-col gap-4">
          {items.map((item, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold text-gray-800 leading-snug">{item.title}</p>
                <p className="text-sm text-gray-500 leading-relaxed mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* 按鈕 */}
        <div className="px-6 pb-6 pt-1 flex flex-col gap-2.5">
          {onAdjustFont && (
            <button
              onClick={onAdjustFont}
              className="w-full py-3.5 rounded-2xl font-semibold text-white bg-primary-600 active:bg-primary-700 transition-colors"
            >
              立即調整字體大小
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl font-semibold text-gray-500 bg-gray-100 active:bg-gray-200 transition-colors"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}
