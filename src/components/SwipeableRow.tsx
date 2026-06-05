import { useState, useRef } from 'react';

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;          // called after user confirms deletion
  confirmTitle?: string;
  confirmMessage?: string;
}

const DELETE_W   = 72;  // px width of revealed delete zone
const THRESHOLD  = -36; // px — swipe past this to snap open

export default function SwipeableRow({
  children,
  onDelete,
  confirmTitle   = '確認刪除',
  confirmMessage = '確定要刪除這筆交易紀錄嗎？',
}: SwipeableRowProps) {
  const [offset,      setOffset]      = useState(0);
  const [animating,   setAnimating]   = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const startX   = useRef(0);
  const startY   = useRef(0);
  const locked   = useRef<'h' | 'v' | null>(null);
  const dragging = useRef(false);
  const openRef  = useRef(false);  // tracks whether delete zone is open

  // ── Touch handlers ──────────────────────────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    locked.current = null;
    dragging.current = true;
    setAnimating(false);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // Direction lock: first meaningful move decides axis
    if (!locked.current) {
      if (Math.abs(dx) > Math.abs(dy) + 4) locked.current = 'h';
      else if (Math.abs(dy) > Math.abs(dx) + 4) locked.current = 'v';
      else return;
    }
    if (locked.current !== 'h') return;

    e.preventDefault(); // prevent page scroll while swiping horizontally

    const base = openRef.current ? -DELETE_W : 0;
    const raw  = base + dx;
    // Clamp: can't swipe right past 0, or left past DELETE_W * 1.25 (elastic feel)
    setOffset(Math.max(-DELETE_W * 1.25, Math.min(0, raw)));
  }

  function onTouchEnd() {
    dragging.current = false;
    setAnimating(true);
    if (offset < THRESHOLD) {
      setOffset(-DELETE_W);
      openRef.current = true;
    } else {
      setOffset(0);
      openRef.current = false;
    }
  }

  // Tap outside: close the open row
  function handleCardClick() {
    if (openRef.current) {
      setAnimating(true);
      setOffset(0);
      openRef.current = false;
    }
  }

  function handleDeleteTap(e: React.MouseEvent) {
    e.stopPropagation();
    setShowConfirm(true);
  }

  function handleConfirm() {
    setShowConfirm(false);
    setAnimating(true);
    setOffset(0);
    openRef.current = false;
    onDelete();
  }

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl">
        {/* ── Delete zone (behind card) ── */}
        <div
          className="absolute right-0 top-0 bottom-0 bg-red-500 flex items-center justify-center rounded-r-2xl"
          style={{ width: DELETE_W }}
        >
          <button
            onClick={handleDeleteTap}
            className="flex flex-col items-center gap-0.5 text-white active:opacity-70 px-3 py-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
            <span className="text-[10px] font-semibold">刪除</span>
          </button>
        </div>

        {/* ── Card (slides left on swipe) ── */}
        <div
          style={{
            transform: `translateX(${offset}px)`,
            transition: animating ? 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onClick={handleCardClick}
        >
          {children}
        </div>
      </div>

      {/* ── Confirm modal ── */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm px-6"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
            </div>
            <h3 className="text-base font-bold text-gray-900 text-center mb-1">{confirmTitle}</h3>
            <p className="text-sm text-gray-500 text-center mb-5">{confirmMessage}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
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
