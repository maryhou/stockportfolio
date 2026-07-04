/**
 * Vercel Edge Function — historical daily close prices for TPEx-listed
 * symbols (bond ETFs etc.), from the TPEx tradingStock API.
 *
 * TWSE-listed symbols are NOT handled here: www.twse.com.tw firewalls
 * datacenter IPs (403/timeout from Vercel) but has open CORS, so the client
 * fetches STOCK_DAY directly from the browser and only calls this proxy
 * when that returns nothing (i.e. OTC symbols — TPEx has no CORS).
 *
 * Fetches the current + previous month, returns last 30 close prices.
 *
 * GET /api/history?symbol=00679B
 * Returns: [{ date: "2026-06-03", price: 26.48 }, ...]  (oldest→newest)
 */
export const config = {
  runtime: 'edge',
  regions: ['sin1', 'hnd1'],
};

const TPEX_BASE = 'https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock';

// TW symbols: 4–6 digits + optional suffix, e.g. 2330, 00679B, 2887Z1 (特別股)
const SYMBOL_RE = /^[0-9]{4,6}[A-Z]?[0-9]?$/;

/** Parse rows shared by TWSE/TPEx: row[0] = ROC date "115/06/03", row[6] = 收盤價. */
function collectRows(rows: string[][], entries: { date: string; price: number }[]) {
  for (const row of rows) {
    const raw = row[6]?.replace(/,/g, '');
    const p = parseFloat(raw ?? '');
    if (!isNaN(p) && p > 0) {
      const rocDate = row[0] ?? '';
      const [rocYear, mm, dd] = rocDate.split('/');
      entries.push({ date: `${parseInt(rocYear) + 1911}-${mm}-${dd}`, price: p });
    }
  }
}

async function fetchTpexMonth(symbol: string, month: Date, entries: { date: string; price: number }[]) {
  const d = `${month.getFullYear()}/${String(month.getMonth() + 1).padStart(2, '0')}/01`;
  const url = `${TPEX_BASE}?code=${encodeURIComponent(symbol)}&date=${encodeURIComponent(d)}&response=json`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Referer: 'https://www.tpex.org.tw/',
      'User-Agent': 'Mozilla/5.0',
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return;
  const data = (await res.json()) as { tables?: Array<{ data?: string[][] }> };
  const rows = data.tables?.[0]?.data;
  if (Array.isArray(rows)) collectRows(rows, entries);
}

export default async function handler(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.trim().toUpperCase();
  if (!symbol || !SYMBOL_RE.test(symbol)) return json([], 400);

  const now = new Date();
  // Fetch previous month first so result is chronological
  const months = [new Date(now.getFullYear(), now.getMonth() - 1, 1), now];

  const entries: { date: string; price: number }[] = [];

  for (const month of months) {
    try {
      await fetchTpexMonth(symbol, month, entries);
    } catch {
      // skip month on error
    }
  }

  // Return last 30 data points
  return json(entries.slice(-30), 200, 'public, max-age=1800');
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
