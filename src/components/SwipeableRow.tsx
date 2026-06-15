import { useState, useRef } from 'react';

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  onEdit?: () => void;
  confirmTitle?: string;
  confirmMessage?: string;
}

const DELETE_THRESHOLD = -72; // px — swipe past this to trigger confirm

export default function SwipeableRow({
  children,
  onDelete,
  onEdit,
  confirmTitle   = '確認刪除',
  confirmMessage = '確定要刪除這筆交易紀錄嗎？',
}: SwipeableRowProps) {
  const [offsetX,     setOffsetX]     = useState(0);
  const [isDragging,  setIsDragging]  = useState(false);
  const [exiting,     setExiting]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [hovered,     setHovered]     = useState(false);

  const drag = useRef({ active: false, startX: 0, hasMoved: false, isTouch: false });

  // ── Pointer handlers (touch only — mouse skips drag) ──────────────────────
  function onPointerDown(e: React.PointerEvent) {
    const isTouch = e.pointerType === 'touch';
    drag.current = { active: isTouch, startX: e.clientX, hasMoved: false, isTouch };
    if (isTouch) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setIsDragging(true);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current.active || !drag.current.isTouch || exiting) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 6) drag.current.hasMoved = true;
    setOffsetX(Math.max(-120, Math.min(0, dx)));
  }

  function onPointerUp() {
    if (!drag.current.active) return;
    drag.current.active = false;
    setIsDragging(false);

    if (offsetX <= DELETE_THRESHOLD) {
      setOffsetX(DELETE_THRESHOLD);
      setShowConfirm(true);
    } else {
      setOffsetX(0);
    }
  }

  function handleCardClick(e: React.MouseEvent) {
    if (drag.current.hasMoved) { e.preventDefault(); e.stopPropagation(); }
  }

  // ── Confirm / cancel ───────────────────────────────────────────────────────
  function handleConfirm() {
    setShowConfirm(false);
    setExiting(true);
    setTimeout(onDelete, 260);
  }

  function handleCancel() {
    setShowConfirm(false);
    setOffsetX(0);
  }

  const backdropOpacity = exiting
    ? 1
    : Math.min(1, Math.abs(offsetX) / Math.abs(DELETE_THRESHOLD));

  return (
    <>
      <div
        className="relative rounded-2xl overflow-hidden"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Red backdrop — touch swipe only */}
        <div
          className="absolute inset-0 bg-red-500 rounded-2xl flex items-center justify-end pr-5"
          style={{ opacity: backdropOpacity }}
          aria-hidden
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </div>

        {/* Card */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={handleCardClick}
          style={{
            transform: exiting ? 'translateX(-110%)' : `translateX(${offsetX}px)`,
            transition: isDragging ? 'none' : 'transform 0.25s ease-out',
            touchAction: 'pan-y',
          }}
          className="relative select-none"
        >
          {children}

          {/* Desktop hover action buttons */}
          <div
            className="absolute inset-y-0 right-0 flex items-center gap-1 pr-3 pointer-events-none transition-opacity duration-150"
            style={{ opacity: hovered ? 1 : 0, pointerEvents: hovered ? 'auto' : 'none' }}
          >
            {onEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="w-8 h-8 rounded-full bg-white/90 shadow-md flex items-center justify-center hover:bg-amber-50 hover:text-amber-600 text-gray-400 transition-colors"
                title="編輯"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setShowConfirm(true); }}
              className="w-8 h-8 rounded-full bg-white/90 shadow-md flex items-center justify-center hover:bg-red-50 hover:text-red-500 text-gray-400 transition-colors"
              title="刪除"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm px-6"
          onClick={handleCancel}
        >
          <div
            className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
            </div>
            <h3 className="text-base font-bold text-gray-900 text-center mb-1">{confirmTitle}</h3>
            <p className="text-sm text-gray-500 text-center mb-5">{confirmMessage}</p>
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold bg-gray-100 text-gray-600 active:opacity-80"
              >
                取消
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-3 rounded-2xl text-sm font-bold bg-red-500 text-white active:opacity-80"
              >
                刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
