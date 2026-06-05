/**
 * Fetch historical cash dividend per share from TWSE (via /api/dividends proxy in prod).
 * Returns [] on any error.
 */
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

export interface DividendRecord {
  year: string;        // CE year e.g. "2024"
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

    // Development: direct TWSE call
    const res = await fetch(
      `https://www.twse.com.tw/exchangeReport/BWIBBU_d?response=json&stockNo=${symbol}`,
      { signal: timeoutSignal(8_000) },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { stat?: string; data?: string[][] };
    if (data.stat !== 'OK' || !Array.isArray(data.data)) return [];

    const results: DividendRecord[] = [];
    for (const row of [...data.data].reverse()) {
      const rocYear = parseInt(row[0]?.trim() ?? '0');
      if (!rocYear) continue;
      const p = (i: number) => parseFloat(row[i]?.replace(/,/g, '') ?? '0') || 0;
      const stockTotal = p(3);
      const cashParts  = p(4) + p(5);
      const grandTotal = p(6);
      const cash = cashParts > 0 ? cashParts : Math.max(0, grandTotal - stockTotal);
      if (cash > 0) results.push({ year: String(rocYear + 1911), cashPerShare: Math.round(cash * 10000) / 10000 });
    }
    return results.slice(0, 5);
  } catch {
    return [];
  }
}
