/**
 * Vercel Edge Function — dividend history with real payment dates.
 *
 * Sources, in order:
 *   1. TPEx ETF 訊息中心 — TPEx-listed ETFs (bond ETFs like 00679B): parsed
 *      from 收益分配 announcements
 *   2. Yahoo Finance    — anything else (regular stocks): ex-date only
 *
 * TWSE-listed ETFs are NOT handled here: www.twse.com.tw firewalls
 * datacenter IPs (403/timeout from Vercel) but has open CORS, so the
 * client fetches etfDiv directly from the browser instead.
 *
 * GET /api/dividends?symbol=00919
 * Returns: [{ date: "2026-05-22", payDate: "2026-06-12", cashPerShare: 0.28 }, ...]
 *   `date` is the ex-dividend date; `payDate` is omitted when unknown (Yahoo).
 */
export const config = {
  runtime: 'edge',
  regions: ['sin1', 'hnd1'],
};

interface DividendRecord {
  date: string;       // ex-dividend date YYYY-MM-DD
  payDate?: string;   // actual payment date YYYY-MM-DD
  cashPerShare: number;
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

/** "115年04月23日" or "115/04/23" → "2026-04-23" */
function rocToISO(roc: string): string | null {
  const m = roc.match(/(\d{2,3})[年/](\d{1,2})[月/](\d{1,2})/);
  if (!m) return null;
  return `${parseInt(m[1]) + 1911}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

// ── Source 1: TPEx-listed ETFs (收益分配公告) ─────────────────────────────────
async function fetchTpexEtfDiv(symbol: string): Promise<DividendRecord[]> {
  const listRes = await fetch('https://info.tpex.org.tw/api/etfMaInfo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: 'type=distribution',
    signal: AbortSignal.timeout(15_000),
  });
  if (!listRes.ok) return [];

  const list = (await listRes.json()) as Array<{ params?: string }>;
  // Newest first; take the most recent announcements for this fund
  const mine = list.filter((x) => x.params?.includes(`fund=${symbol}&`)).slice(0, 12);
  if (mine.length === 0) return [];

  const details = await Promise.all(mine.map(async (x) => {
    try {
      const res = await fetch('https://info.tpex.org.tw/api/etfMaInfoDetail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: x.params!,
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return null;
      const arr = (await res.json()) as Array<{ description?: string }>;
      return arr[0]?.description ?? null;
    } catch {
      return null;
    }
  }));

  const out: DividendRecord[] = [];
  const seen = new Set<string>();
  for (const desc of details) {
    if (!desc) continue;
    const ex = desc.match(/除息交易日[:：]\s*(\d{2,3}\/\d{1,2}\/\d{1,2})/);
    const pay = desc.match(/收益分配發放日(?:期)?[:：]\s*(\d{2,3}\/\d{1,2}\/\d{1,2})/);
    // Wording varies by issuer: 「配發金額:新臺幣0.28元」「預估配發金額為新臺幣0.072元」
    const amt = desc.match(/每受益權單位[^\d。\r\n]{0,12}配發金額[^\d]{0,10}([\d.]+)\s*元/);
    const exDate = ex && rocToISO(ex[1]);
    const payDate = pay && rocToISO(pay[1]);
    const cash = amt ? parseFloat(amt[1]) : NaN;
    if (!exDate || isNaN(cash) || cash <= 0) continue;
    // Same ex-date can appear in 預估 + 實際 announcements — keep the newest
    if (seen.has(exDate)) continue;
    seen.add(exDate);
    out.push({ date: exDate, ...(payDate ? { payDate } : {}), cashPerShare: cash });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
}

// ── Source 2: Yahoo Finance fallback (ex-date only) ──────────────────────────
type YahooChart = {
  chart?: {
    result?: Array<{ events?: { dividends?: Record<string, { amount: number; date: number }> } }>;
  };
};

async function fetchYahoo(symbol: string): Promise<DividendRecord[]> {
  for (const suffix of ['.TW', '.TWO']) {
    try {
      const url =
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}${suffix}` +
        `?events=dividends&interval=1d&range=5y`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible)', Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) continue;

      const data = (await res.json()) as YahooChart;
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
    } catch {
      // try next suffix
    }
  }
  return [];
}

export default async function handler(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.trim();
  if (!symbol) return json([], 400);

  for (const source of [fetchTpexEtfDiv, fetchYahoo]) {
    try {
      const results = await source(symbol);
      if (results.length > 0) return json(results, 200, 'public, max-age=43200'); // cache 12h
    } catch {
      // try next source
    }
  }
  return json([], 200);
}

function json(body: unknown, status = 200, cacheControl = 'no-store'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl,
    },
  });
}
