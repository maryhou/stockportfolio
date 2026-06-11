/**
 * Vercel Edge Function — TWSE historical daily close prices.
 *
 * Source: https://www.twse.com.tw/exchangeReport/STOCK_DAY
 * Fetches the current + previous month, returns last 30 close prices (oldest→newest).
 *
 * GET /api/history?symbol=2330
 * Returns: [{ date: "2026-06-03", price: 180.5 }, ...]  (oldest→newest)
 */
export const config = {
  runtime: 'edge',
  regions: ['sin1', 'hnd1'],
};

const TWSE_BASE = 'https://www.twse.com.tw/exchangeReport/STOCK_DAY';
const TPEX_BASE = 'https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock';

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

async function fetchTwseMonth(symbol: string, month: Date, entries: { date: string; price: number }[]) {
  const url = `${TWSE_BASE}?response=json&date=${yyyymm01(month)}&stockNo=${symbol}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Referer: 'https://www.twse.com.tw/',
      'User-Agent': 'Mozilla/5.0',
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return;
  const data = (await res.json()) as { stat?: string; data?: string[][] };
  if (data.stat !== 'OK' || !Array.isArray(data.data)) return;
  collectRows(data.data, entries);
}

async function fetchTpexMonth(symbol: string, month: Date, entries: { date: string; price: number }[]) {
  const d = `${month.getFullYear()}/${String(month.getMonth() + 1).padStart(2, '0')}/01`;
  const url = `${TPEX_BASE}?code=${symbol}&date=${encodeURIComponent(d)}&response=json`;
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
  const symbol = searchParams.get('symbol')?.trim();
  if (!symbol) return json([], 400);

  const now = new Date();
  // Fetch previous month first so result is chronological
  const months = [new Date(now.getFullYear(), now.getMonth() - 1, 1), now];

  const entries: { date: string; price: number }[] = [];

  for (const month of months) {
    try {
      await fetchTwseMonth(symbol, month, entries);
    } catch {
      // skip month on error
    }
  }

  // Not on TWSE — try TPEx (上櫃, e.g. bond ETFs like 00679B)
  if (entries.length === 0) {
    for (const month of months) {
      try {
        await fetchTpexMonth(symbol, month, entries);
      } catch {
        // skip month on error
      }
    }
  }

  // Return last 30 data points
  return json(entries.slice(-30), 200, 'public, max-age=1800');
}

function yyyymm01(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}01`;
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
