import { useState, useEffect, useRef, useCallback } from 'react';

const THRESHOLD     = 80;    // px pulled before refresh triggers
const MAX_PULL      = 110;   // max visual pull height
const DAMPEN        = 0.45;  // pull resistance factor
const HOLD_HEIGHT   = 56;    // px held open while refreshing / showing result
const RESULT_HOLD_MS = 1800; // ms to display success/error before collapsing

export type PTRStatus = 'idle' | 'pulling' | 'refreshing' | 'success' | 'error';

export interface PTRState {
  pullY: number;           // current indicator height in px
  status: PTRStatus;
  progress: number;        // 0→1, fraction of THRESHOLD reached while pulling
  lastUpdated: Date | null;
  errorMsg: string | null;
}

const IDLE: PTRState = { pullY: 0, status: 'idle', progress: 0, lastUpdated: null, errorMsg: null };

export function usePullToRefresh(
  containerRef: React.RefObject<HTMLElement | null>,
  onRefresh: () => Promise<void>,
  enabled: boolean = true,
): PTRState {
  const [state, setState] = useState<PTRState>(IDLE);

  // Always call the latest onRefresh without re-attaching listeners
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const busyRef = useRef(false);

  const triggerRefresh = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;

    // Subtle haptic feedback
    if (navigator.vibrate) navigator.vibrate(10);

    setState(s => ({ ...s, pullY: HOLD_HEIGHT, status: 'refreshing', progress: 1 }));

    try {
      await onRefreshRef.current();
      const now = new Date();
      setState(s => ({ ...s, status: 'success', lastUpdated: now }));
    } catch {
      setState(s => ({ ...s, status: 'error', errorMsg: '更新失敗，請稍後再試' }));
    }

    await new Promise<void>(r => setTimeout(r, RESULT_HOLD_MS));
    setState(s => ({ ...s, pullY: 0, status: 'idle' }));
    busyRef.current = false;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    let startY = 0;
    let pulling = false;
    let liveY = 0; // track current pull without triggering re-renders on every frame

    function onTouchStart(e: TouchEvent) {
      if (busyRef.current || el!.scrollTop > 0) return;
      startY = e.touches[0].clientY;
      pulling = true;
      liveY = 0;
    }

    function onTouchMove(e: TouchEvent) {
      if (!pulling || busyRef.current) return;
      const dy = e.touches[0].clientY - startY;

      if (dy <= 0 || el!.scrollTop > 0) {
        pulling = false;
        setState(s => (s.status === 'pulling' ? { ...s, pullY: 0, status: 'idle', progress: 0 } : s));
        return;
      }

      // preventDefault stops the scroll so the page doesn't jump while pulling
      e.preventDefault();
      liveY = Math.min(dy * DAMPEN, MAX_PULL);
      const progress = Math.min(liveY / THRESHOLD, 1);
      setState(s => ({ ...s, pullY: liveY, status: 'pulling', progress }));
    }

    function onTouchEnd() {
      if (!pulling) return;
      pulling = false;
      if (liveY >= THRESHOLD) {
        triggerRefresh();
      } else {
        liveY = 0;
        setState(s => ({ ...s, pullY: 0, status: 'idle', progress: 0 }));
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false }); // passive:false needed for preventDefault
    el.addEventListener('touchend',   onTouchEnd,   { passive: true });
    el.addEventListener('touchcancel',onTouchEnd,   { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
      el.removeEventListener('touchcancel',onTouchEnd);
    };
  }, [containerRef, enabled, triggerRefresh]);

  return state;
}
