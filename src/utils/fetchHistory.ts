/**
 * Fetch historical daily close prices for a Taiwan stock.
 *
 * Production → /api/history proxy (avoids CORS on mobile)
 * Development → direct TWSE call
 *
 * Returns an array of close prices ordered oldest → newest (up to 30 points).
 * Returns [] on any error so callers can fall back gracefully.
 */
/**
 * AbortSignal.timeout() was introduced in Safari 16 / iPadOS 16.
 * Older devices throw TypeError — this wrapper falls back to AbortController.
 */
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

export async function fetchStockHistory(symbol: string): Promise<number[]> {
  try {
    if (!import.meta.env.DEV) {
      const res = await fetch(`/api/history?symbol=${symbol}`, {
        signal: timeoutSignal(10_000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? (data as number[]) : [];
    }

    // Development: direct TWSE calls
    const BASE = 'https://www.twse.com.tw/exchangeReport/STOCK_DAY';
    const now = new Date();
    const months = [
      yyyymm01(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      yyyymm01(now),
    ];
    const prices: number[] = [];

    for (const date of months) {
      const res = await fetch(
        `${BASE}?response=json&date=${date}&stockNo=${symbol}`,
        { signal: timeoutSignal(8_000) },
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { stat?: string; data?: string[][] };
      if (data.stat !== 'OK' || !Array.isArray(data.data)) continue;
      for (const row of data.data) {
        const p = parseFloat(row[6]?.replace(/,/g, '') ?? '');
        if (!isNaN(p) && p > 0) prices.push(p);
      }
    }
    return prices.slice(-30);
  } catch {
    return [];
  }
}

function yyyymm01(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}01`;
}
