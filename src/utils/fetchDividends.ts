/**
 * Fetch dividend history via /api/dividends proxy (prod) or Yahoo Finance (dev).
 * Returns up to 10 records, newest first. Returns [] on any error.
 */
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

export interface DividendRecord {
  date: string;        // exact ex-dividend date "YYYY-MM-DD"
  payDate?: string;    // actual payment date "YYYY-MM-DD" (TWSE/TPEx ETF sources only)
  cashPerShare: number;
}

export async function fetchStockDividends(symbol: string): Promise<DividendRecord[]> {
  try {
    if (!import.meta.env.DEV) {
      const res = await fetch(`/api/dividends?symbol=${symbol}`, {
        signal: timeoutSignal(8_000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? (data as DividendRecord[]) : [];
    }

    // Development: direct Yahoo Finance (may be blocked by CORS — use prod for testing)
    for (const suffix of ['.TW', '.TWO']) {
      try {
        const url =
          `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}${suffix}` +
          `?events=dividends&interval=1d&range=5y`;
        const res = await fetch(url, { signal: timeoutSignal(8_000) });
        if (!res.ok) continue;

        const data = await res.json() as {
          chart?: { result?: Array<{ events?: { dividends?: Record<string, { amount: number; date: number }> } }> };
        };
        const divMap = data.chart?.result?.[0]?.events?.dividends;
        if (!divMap || Object.keys(divMap).length === 0) continue;

        const results = Object.values(divMap)
          .map((d) => ({
            date: new Date(d.date * 1000).toISOString().slice(0, 10),
            cashPerShare: Math.round(d.amount * 10000) / 10000,
          }))
          .filter((d) => d.cashPerShare > 0)
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 10);

        if (results.length > 0) return results;
      } catch { continue; }
    }
    return [];
  } catch {
    return [];
  }
}
