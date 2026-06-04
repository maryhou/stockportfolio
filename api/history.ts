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

const BASE = 'https://www.twse.com.tw/exchangeReport/STOCK_DAY';

export default async function handler(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.trim();
  if (!symbol) return json([], 400);

  const now = new Date();
  // Fetch previous month first so result is chronological
  const months = [
    yyyymm01(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    yyyymm01(now),
  ];

  const entries: { date: string; price: number }[] = [];

  for (const date of months) {
    try {
      const url = `${BASE}?response=json&date=${date}&stockNo=${symbol}`;
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Referer: 'https://www.twse.com.tw/',
          'User-Agent': 'Mozilla/5.0',
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) continue;

      const data = (await res.json()) as {
        stat?: string;
        data?: string[][];
      };

      if (data.stat !== 'OK' || !Array.isArray(data.data)) continue;

      for (const row of data.data) {
        // row[0] = 日期 e.g. "115/06/03" (ROC year), row[6] = 收盤價
        const raw = row[6]?.replace(/,/g, '');
        const p = parseFloat(raw ?? '');
        if (!isNaN(p) && p > 0) {
          const rocDate = row[0] ?? '';
          const [rocYear, mm, dd] = rocDate.split('/');
          const isoDate = `${parseInt(rocYear) + 1911}-${mm}-${dd}`;
          entries.push({ date: isoDate, price: p });
        }
      }
    } catch {
      // skip month on error
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
