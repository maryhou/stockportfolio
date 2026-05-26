import { useEffect, useRef, useCallback } from 'react';
import type { Stock } from '../types';
import { fetchStockPrices } from '../utils/fetchPrices';

const POLL_MS = 15_000;

/**
 * Polls Yahoo Finance every 15 s for the currently-visible stocks.
 *
 * - Uses a single setInterval; guards against duplicates.
 * - Pauses automatically when the document tab is hidden.
 * - Resumes when the tab becomes visible again.
 * - Calls onPriceUpdate only when a price actually changed.
 * - All mutable state is kept in refs so the interval callback is
 *   never stale without needing to be recreated.
 */
export function useStockPoller(
  stocks: Stock[],
  visibleIds: ReadonlySet<string>,
  onPriceUpdate: (stockId: string, price: number) => void,
): void {
  // Refs — updated every render, read inside the interval callback
  const stocksRef   = useRef(stocks);
  const visibleRef  = useRef(visibleIds);
  const onUpdateRef = useRef(onPriceUpdate);
  stocksRef.current   = stocks;
  visibleRef.current  = visibleIds;
  onUpdateRef.current = onPriceUpdate;

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stable callback — only reads refs, so deps array is intentionally []
  const runPoll = useCallback(async () => {
    if (document.hidden) return;

    const toFetch = stocksRef.current
      .filter((s) => visibleRef.current.has(s.id))
      .map((s) => s.symbol);

    if (toFetch.length === 0) return;

    try {
      const prices = await fetchStockPrices(toFetch);
      for (const s of stocksRef.current) {
        const p = prices[s.symbol];
        // Only propagate genuine changes — avoids spurious re-renders
        if (p != null && p !== s.currentPrice) {
          onUpdateRef.current(s.id, p);
        }
      }
    } catch {
      // Network / API failure — silently retry on next tick
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function start() {
      if (timerRef.current != null) return; // no duplicate intervals
      timerRef.current = setInterval(runPoll, POLL_MS);
    }
    function stop() {
      if (timerRef.current == null) return;
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    function onVisibility() {
      document.hidden ? stop() : start();
    }

    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) start();

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [runPoll]); // runPoll is stable — effect runs once on mount
}
