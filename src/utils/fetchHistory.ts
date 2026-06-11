/**
 * Fetch historical daily close prices for a Taiwan stock.
 *
 * Production → /api/history proxy (avoids CORS on mobile)
 * Development → direct TWSE call
 *
 * Returns an array of { date: "YYYY-MM-DD", price: number } ordered oldest → newest (up to 30 points).
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

export async function fetchStockHistory(symbol: string): Promise<{ date: string; price: number }[]> {
  try {
    if (!import.meta.env.DEV) {
      const res = await fetch(`/api/history?symbol=${symbol}`, {
        signal: timeoutSignal(10_000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? (data as { date: string; price: number }[]) : [];
    }

    // Development: direct TWSE calls, falling back to TPEx for 上櫃 stocks
    // (e.g. bond ETFs like 00679B). Both APIs use row[0] = ROC date, row[6] = close.
    const TWSE_BASE = 'https://www.twse.com.tw/exchangeReport/STOCK_DAY';
    const TPEX_BASE = 'https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock';
    const now = new Date();
    const months = [new Date(now.getFullYear(), now.getMonth() - 1, 1), now];
    const entries: { date: string; price: number }[] = [];

    function collectRows(rows: string[][]) {
      for (const row of rows) {
        const p = parseFloat(row[6]?.replace(/,/g, '') ?? '');
        if (!isNaN(p) && p > 0) {
          const rocDate = row[0] ?? '';
          const [rocYear, mm, dd] = rocDate.split('/');
          entries.push({ date: `${parseInt(rocYear) + 1911}-${mm}-${dd}`, price: p });
        }
      }
    }

    for (const month of months) {
      const res = await fetch(
        `${TWSE_BASE}?response=json&date=${yyyymm01(month)}&stockNo=${symbol}`,
        { signal: timeoutSignal(8_000) },
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { stat?: string; data?: string[][] };
      if (data.stat !== 'OK' || !Array.isArray(data.data)) continue;
      collectRows(data.data);
    }

    if (entries.length === 0) {
      for (const month of months) {
        const d = `${month.getFullYear()}/${String(month.getMonth() + 1).padStart(2, '0')}/01`;
        const res = await fetch(
          `${TPEX_BASE}?code=${symbol}&date=${encodeURIComponent(d)}&response=json`,
          { signal: timeoutSignal(8_000) },
        );
        if (!res.ok) continue;
        const data = (await res.json()) as { tables?: Array<{ data?: string[][] }> };
        const rows = data.tables?.[0]?.data;
        if (Array.isArray(rows)) collectRows(rows);
      }
    }

    return entries.slice(-30);
  } catch {
    return [];
  }
}

function yyyymm01(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}01`;
}
