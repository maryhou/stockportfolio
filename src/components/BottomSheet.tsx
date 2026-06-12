import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * App-like bottom sheet:
 * - swipe down to dismiss (from the handle, or from content scrolled to top)
 * - drag up to expand between two snap points (natural height ↔ 92vh)
 * - body scroll locked while open
 * - iOS-style spring easing + velocity-based settling
 *
 * All gesture state lives in refs and styles are mutated directly so drags
 * never trigger React re-renders.
 */

export interface BottomSheetHandle {
  /** Animate out, then run `after` (defaults to the onClose prop). */
  close: (after?: () => void) => void;
}

interface BottomSheetProps {
  onClose: () => void;
  zBackdrop?: string;
  zSheet?: string;
  children: ReactNode;
}

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const OPEN_MS = 420;
const SETTLE_MS = 420;
const CLOSE_MS = 280;
const COLLAPSED_CAP = 0.72; // initial snap: at most 72% of viewport
const MAX_FRACTION = 0.92;  // expanded snap: 92% of viewport
const DRAG_THRESHOLD = 8;   // px before a touch becomes a drag (keeps taps intact)

// ── Body scroll lock (counter-based so stacked sheets don't unlock early) ────
let lockCount = 0;
let savedScrollY = 0;

function lockBody() {
  if (++lockCount > 1) return;
  savedScrollY = window.scrollY;
  Object.assign(document.body.style, {
    position: 'fixed',
    top: `-${savedScrollY}px`,
    left: '0',
    right: '0',
    width: '100%',
    overflow: 'hidden',
  });
}

function unlockBody() {
  if (--lockCount > 0) return;
  for (const p of ['position', 'top', 'left', 'right', 'width', 'overflow']) {
    document.body.style.removeProperty(p);
  }
  window.scrollTo(0, savedScrollY);
}

const BottomSheet = forwardRef<BottomSheetHandle, BottomSheetProps>(function BottomSheet(
  { onClose, zBackdrop = 'z-40', zSheet = 'z-50', children },
  ref,
) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const sheetRef    = useRef<HTMLDivElement>(null);
  const grabRef     = useRef<HTMLDivElement>(null);
  const scrollRef   = useRef<HTMLDivElement>(null);
  const contentRef  = useRef<HTMLDivElement>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const g = useRef({
    maxH: 0,
    naturalH: 0,    // full content height (handle included)
    collapsedH: 0,  // first snap point
    visibleH: 0,    // current height showing above the bottom edge
    expanded: false,
    mode: '' as '' | 'drag' | 'scroll',
    dragging: false,
    closing: false,
    startY: 0,
    startVisibleH: 0,
    lastY: 0,
    lastT: 0,
    vel: 0,         // visibleH px per ms (positive = sheet growing)
  });

  /** Upper snap point: full content, capped at maxH. */
  function snapTop() {
    const s = g.current;
    return Math.min(s.naturalH, s.maxH);
  }

  function applyStyles(animate: boolean, durationMs = SETTLE_MS) {
    const s = g.current;
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (!sheet || !backdrop) return;
    const transition = animate
      ? `transform ${durationMs}ms ${EASE}, height ${durationMs}ms ${EASE}`
      : 'none';
    sheet.style.transition = transition;
    const height = Math.min(Math.max(s.visibleH, s.collapsedH), s.maxH);
    sheet.style.height = `${height}px`;
    sheet.style.transform = `translateY(${Math.max(0, s.collapsedH - s.visibleH)}px)`;
    backdrop.style.transition = animate ? `opacity ${durationMs}ms ${EASE}` : 'none';
    backdrop.style.opacity = String(Math.min(1, s.visibleH / Math.max(1, s.collapsedH)));
  }

  function measureNatural(): number {
    return (contentRef.current?.offsetHeight ?? 0) + (grabRef.current?.offsetHeight ?? 0);
  }

  /** Re-derive both snap points from the live content height. */
  function refreshSnapPoints() {
    const s = g.current;
    s.naturalH = measureNatural();
    s.collapsedH = Math.min(s.naturalH, window.innerHeight * COLLAPSED_CAP);
  }

  function close(after?: () => void) {
    const s = g.current;
    if (s.closing) return;
    s.closing = true;
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (sheet && backdrop) {
      sheet.style.transition = `transform ${CLOSE_MS}ms ease-in`;
      sheet.style.transform = `translateY(${sheet.offsetHeight + 20}px)`;
      backdrop.style.transition = `opacity ${CLOSE_MS}ms ease-in`;
      backdrop.style.opacity = '0';
    }
    window.setTimeout(() => (after ?? onCloseRef.current)(), CLOSE_MS);
  }

  useImperativeHandle(ref, () => ({ close }), []);

  // ── Drag mechanics (shared by touch + mouse) ───────────────────────────────
  function dragMove(clientY: number, timeStamp: number) {
    const s = g.current;
    let raw = s.startVisibleH - (clientY - s.startY);
    const top = snapTop();
    if (raw > top) raw = top + (raw - top) * 0.12; // elastic resistance past the top snap
    s.visibleH = Math.max(0, raw);
    const dt = timeStamp - s.lastT;
    if (dt > 0) {
      const v = (s.lastY - clientY) / dt;
      // Clamp so one glitchy sample (tiny dt) can't fake an extreme flick
      s.vel = Math.max(-4, Math.min(4, s.vel * 0.6 + v * 0.4));
    }
    s.lastY = clientY;
    s.lastT = timeStamp;
    applyStyles(false);
  }

  function settle() {
    const s = g.current;
    const top = snapTop();
    // Project ~180ms ahead so a flick carries inertia past the nearest snap
    const projected = s.visibleH + s.vel * 180;
    if (projected < s.collapsedH * 0.55) {
      close();
      return;
    }
    const expandable = top > s.collapsedH + 24;
    const target = expandable && projected > (s.collapsedH + top) / 2 ? top : s.collapsedH;
    s.expanded = target > s.collapsedH + 1;
    s.visibleH = target;
    applyStyles(true);
  }

  // ── Mount: measure, lock body, slide in ────────────────────────────────────
  useLayoutEffect(() => {
    const s = g.current;
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (!sheet || !backdrop) return;

    lockBody();
    s.maxH = window.innerHeight * MAX_FRACTION;
    refreshSnapPoints();
    s.visibleH = s.collapsedH;

    // Commit the below-viewport start position with a forced reflow, then
    // animate to the snap point. Synchronous (no rAF) so it also works when
    // the page is momentarily hidden.
    sheet.style.transition = 'none';
    backdrop.style.transition = 'none';
    sheet.style.height = `${s.collapsedH}px`;
    sheet.style.transform = `translateY(${s.collapsedH + 20}px)`;
    backdrop.style.opacity = '0';
    void sheet.offsetHeight;
    applyStyles(true, OPEN_MS);

    return () => unlockBody();
  }, []);

  // ── Content growth/shrink (async data, tab switches) re-snaps the sheet ───
  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const s = g.current;
      if (s.dragging || s.closing) return;
      if (Math.abs(measureNatural() - s.naturalH) < 2) return;
      refreshSnapPoints();
      s.visibleH = s.expanded ? snapTop() : s.collapsedH;
      applyStyles(true, 260);
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  // ── Touch gestures ─────────────────────────────────────────────────────────
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const s = g.current;

    function onTouchStart(e: TouchEvent) {
      if (s.closing) return;
      const t = e.touches[0];
      s.mode = '';
      s.dragging = false;
      s.startY = t.clientY;
      s.lastY = t.clientY;
      s.lastT = e.timeStamp;
      s.vel = 0;
      s.startVisibleH = s.visibleH;
      // Fresh measurement so snap targets never act on a stale content height
      refreshSnapPoints();
    }

    function onTouchMove(e: TouchEvent) {
      if (s.closing) return;
      const t = e.touches[0];
      if (!s.mode) {
        const dy = t.clientY - s.startY;
        if (Math.abs(dy) < DRAG_THRESHOLD) return;
        const inGrab = grabRef.current?.contains(e.target as Node) ?? false;
        const scroller = scrollRef.current;
        const atTop = (scroller?.scrollTop ?? 0) <= 0;
        if (inGrab || (dy > 0 && atTop) || (dy < 0 && s.visibleH < snapTop() - 1)) {
          s.mode = 'drag';
          s.dragging = true;
          // Re-anchor so the sheet doesn't jump by the threshold distance
          s.startY = t.clientY;
          s.startVisibleH = s.visibleH;
        } else {
          s.mode = 'scroll';
          return;
        }
      }
      if (s.mode !== 'drag') return;
      e.preventDefault();
      dragMove(t.clientY, e.timeStamp);
    }

    function onTouchEnd() {
      if (!s.dragging) { s.mode = ''; return; }
      s.dragging = false;
      s.mode = '';
      if (!s.closing) settle();
    }

    sheet.addEventListener('touchstart', onTouchStart, { passive: true });
    sheet.addEventListener('touchmove', onTouchMove, { passive: false });
    sheet.addEventListener('touchend', onTouchEnd);
    sheet.addEventListener('touchcancel', onTouchEnd);
    return () => {
      sheet.removeEventListener('touchstart', onTouchStart);
      sheet.removeEventListener('touchmove', onTouchMove);
      sheet.removeEventListener('touchend', onTouchEnd);
      sheet.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  // ── Mouse drag on the handle (desktop) ─────────────────────────────────────
  function onGrabMouseDown(e: React.MouseEvent) {
    const s = g.current;
    if (s.closing) return;
    e.preventDefault();
    s.mode = 'drag';
    s.dragging = true;
    s.startY = e.clientY;
    s.startVisibleH = s.visibleH;
    s.lastY = e.clientY;
    s.lastT = e.timeStamp;
    s.vel = 0;
    refreshSnapPoints();
    const move = (ev: MouseEvent) => dragMove(ev.clientY, ev.timeStamp);
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      s.dragging = false;
      s.mode = '';
      if (!s.closing) settle();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  return (
    <>
      <div
        ref={backdropRef}
        onClick={() => close()}
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm ${zBackdrop}`}
      />
      <div
        ref={sheetRef}
        className={`fixed bottom-0 inset-x-0 mx-auto w-full max-w-[430px] lg:max-w-lg bg-white rounded-t-3xl shadow-2xl flex flex-col will-change-transform ${zSheet}`}
      >
        <div
          ref={grabRef}
          onMouseDown={onGrabMouseDown}
          className="flex justify-center pt-3 pb-2 flex-shrink-0 cursor-grab active:cursor-grabbing touch-none"
        >
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
          <div ref={contentRef}>{children}</div>
        </div>
      </div>
    </>
  );
});

export default BottomSheet;
