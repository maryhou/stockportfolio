/**
 * Fetch historical daily close prices for a Taiwan stock.
 *
 * 1. TWSE STOCK_DAY, fetched directly from the browser — www.twse.com.tw has
 *    open CORS but firewalls datacenter IPs, so the Vercel proxy can never
 *    reach it. Covers TWSE-listed symbols.
 * 2. /api/history proxy — TPEx data for OTC-listed symbols (bond ETFs etc.).
 *    In dev there is no proxy; tries TPEx directly (usually CORS-blocked).
 *
 * Returns an array of { date: "YYYY-MM-DD", price: number } ordered oldest → newest (up to 30 points).
 * Returns [] on any error so callers can fall back gracefully.
 */
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

type HistoryEntry = { date: string; price: number };

/** Shared row parser: row[0] = ROC date "115/06/03", row[6] = 收盤價. */
function collectRows(rows: string[][], entries: HistoryEntry[]) {
  for (const row of rows) {
    const p = parseFloat(row[6]?.replace(/,/g, '') ?? '');
    if (!isNaN(p) && p > 0) {
      const rocDate = row[0] ?? '';
      const [rocYear, mm, dd] = rocDate.split('/');
      entries.push({ date: `${parseInt(rocYear) + 1911}-${mm}-${dd}`, price: p });
    }
  }
}

function lastTwoMonths(): Date[] {
  const now = new Date();
  return [new Date(now.getFullYear(), now.getMonth() - 1, 1), now];
}

async function fetchTwseDirect(symbol: string): Promise<HistoryEntry[]> {
  const entries: HistoryEntry[] = [];
  for (const month of lastTwoMonths()) {
    try {
      const res = await fetch(
        `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${yyyymm01(month)}&stockNo=${symbol}`,
        { signal: timeoutSignal(8_000) },
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { stat?: string; data?: string[][] };
      if (data.stat !== 'OK' || !Array.isArray(data.data)) continue;
      collectRows(data.data, entries);
    } catch {
      // skip month on error
    }
  }
  return entries;
}

export async function fetchStockHistory(symbol: string): Promise<HistoryEntry[]> {
  try {
    const entries = await fetchTwseDirect(symbol);
    if (entries.length > 0) return entries.slice(-30);

    if (!import.meta.env.DEV) {
      const res = await fetch(`/api/history?symbol=${symbol}`, {
        signal: timeoutSignal(10_000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? (data as HistoryEntry[]) : [];
    }

    // Development: try TPEx directly for OTC symbols (best effort, may be CORS-blocked)
    for (const month of lastTwoMonths()) {
      const d = `${month.getFullYear()}/${String(month.getMonth() + 1).padStart(2, '0')}/01`;
      const res = await fetch(
        `https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code=${symbol}&date=${encodeURIComponent(d)}&response=json`,
        { signal: timeoutSignal(8_000) },
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { tables?: Array<{ data?: string[][] }> };
      const rows = data.tables?.[0]?.data;
      if (Array.isArray(rows)) collectRows(rows, entries);
    }
    return entries.slice(-30);
  } catch {
    return [];
  }
}

function yyyymm01(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}01`;
}
