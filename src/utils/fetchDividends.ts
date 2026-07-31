/**
 * Fetch dividend history with real payment dates.
 *
 * 1. TWSE etfDiv, fetched directly from the browser — www.twse.com.tw has
 *    open CORS but firewalls datacenter IPs, so the Vercel proxy can never
 *    reach it. Covers TWSE-listed ETFs (0050, 0056, …) with 除息日/發放日.
 * 2. /api/dividends proxy — TPEx 收益分配公告 (OTC bond ETFs, with pay dates)
 *    and Yahoo Finance (regular stocks, ex-date only).
 *    In dev there is no proxy; falls back to direct Yahoo (usually CORS-blocked).
 *
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
  cashPerShare: number | null; // null = ex-date announced but 收益分配金額 not published yet
}

/** "115年04月23日" or "115/04/23" → "2026-04-23" */
function rocToISO(roc: string): string | null {
  const m = roc.match(/(\d{2,3})[年/](\d{1,2})[月/](\d{1,2})/);
  if (!m) return null;
  return `${parseInt(m[1]) + 1911}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

async function fetchTwseEtfDivDirect(symbol: string): Promise<DividendRecord[]> {
  try {
    const now = new Date();
    const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}01`;
    const start = fmt(new Date(now.getFullYear() - 3, now.getMonth(), 1));
    const end = fmt(new Date(now.getFullYear(), now.getMonth() + 4, 1));
    const res = await fetch(
      `https://www.twse.com.tw/rwd/zh/ETF/etfDiv?stkNo=${symbol}&startDate=${start}&endDate=${end}&response=json`,
      { signal: timeoutSignal(8_000) },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { status?: string; data?: string[][] };
    if (data.status !== 'ok' || !Array.isArray(data.data)) return [];
    return parseEtfDivRows(data.data, now);
  } catch {
    return [];
  }
}

/**
 * Parse TWSE etfDiv `data` rows → DividendRecords. Exported for testing.
 * row = [代號, 簡稱, 除息交易日, 基準日, 收益分配發放日, 金額, …]
 *
 * - Drops rows whose ex-date year is outside a sane window (the API occasionally
 *   emits dirty ROC dates like 「106年」 or even 「-1893年」).
 * - Keeps rows whose amount is not yet published (empty/0 near announcement) as
 *   cashPerShare=null, so the suggestion list can still surface the ex-date and
 *   let the user fill in the amount by hand.
 */
export function parseEtfDivRows(rows: string[][], now: Date = new Date()): DividendRecord[] {
  const minYear = now.getFullYear() - 4;
  const maxYear = now.getFullYear() + 1;

  const out: DividendRecord[] = [];
  for (const row of rows) {
    const exDate = rocToISO(row[2] ?? '');
    if (!exDate) continue;
    const exYear = parseInt(exDate.slice(0, 4));
    if (exYear < minYear || exYear > maxYear) continue;
    const payDate = rocToISO(row[4] ?? '');
    const cash = parseFloat(row[5] ?? '');
    const cashPerShare = !isNaN(cash) && cash > 0 ? cash : null;
    out.push({ date: exDate, ...(payDate ? { payDate } : {}), cashPerShare });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
}

export async function fetchStockDividends(symbol: string): Promise<DividendRecord[]> {
  try {
    const direct = await fetchTwseEtfDivDirect(symbol);
    if (direct.length > 0) return direct;

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
