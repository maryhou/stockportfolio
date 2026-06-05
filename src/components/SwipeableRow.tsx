import { useState, useRef } from 'react';

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  confirmTitle?: string;
  confirmMessage?: string;
}

const DELETE_THRESHOLD = -72; // px — swipe past this to trigger confirm

export default function SwipeableRow({
  children,
  onDelete,
  confirmTitle   = '確認刪除',
  confirmMessage = '確定要刪除這筆交易紀錄嗎？',
}: SwipeableRowProps) {
  const [offsetX,     setOffsetX]     = useState(0);
  const [isDragging,  setIsDragging]  = useState(false);
  const [exiting,     setExiting]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const drag = useRef({ active: false, startX: 0, hasMoved: false });

  // ── Pointer handlers (works on touch + mouse) ──────────────────────────────
  function onPointerDown(e: React.PointerEvent) {
    drag.current = { active: true, startX: e.clientX, hasMoved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current.active || exiting) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 6) drag.current.hasMoved = true;
    setOffsetX(Math.max(-120, Math.min(0, dx)));
  }

  function onPointerUp() {
    if (!drag.current.active) return;
    drag.current.active = false;
    setIsDragging(false);

    if (offsetX <= DELETE_THRESHOLD) {
      // Swiped far enough — show confirmation
      setOffsetX(DELETE_THRESHOLD); // hold at threshold
      setShowConfirm(true);
    } else {
      setOffsetX(0); // snap back
    }
  }

  function handleCardClick(e: React.MouseEvent) {
    // If dragged, suppress click so the card tap doesn't fire
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

  // Backdrop opacity scales 0→1 as card approaches threshold
  const backdropOpacity = exiting
    ? 1
    : Math.min(1, Math.abs(offsetX) / Math.abs(DELETE_THRESHOLD));

  return (
    <>
      <div className="relative rounded-2xl overflow-hidden">
        {/* Red backdrop — revealed as card slides left */}
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

        {/* Card — draggable */}
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
