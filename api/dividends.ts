/**
 * Vercel Edge Function — TWSE historical cash dividend per share.
 *
 * Source: https://www.twse.com.tw/exchangeReport/BWIBBU_d
 * Returns last 5 years of cash dividend records (newest first).
 *
 * GET /api/dividends?symbol=0056
 * Returns: [{ year: "2024", cashPerShare: 2.8 }, ...]
 */
export const config = {
  runtime: 'edge',
  regions: ['sin1', 'hnd1'],
};

const BASE = 'https://www.twse.com.tw/exchangeReport/BWIBBU_d';

export default async function handler(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.trim();
  if (!symbol) return json([], 400);

  try {
    const url = `${BASE}?response=json&stockNo=${symbol}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Referer: 'https://www.twse.com.tw/',
        'User-Agent': 'Mozilla/5.0',
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) return json([], 200);

    const data = (await res.json()) as {
      stat?: string;
      data?: string[][];
      // fields: 年度, 股票股利, 公積股利, 股票小計, 現金公積, 現金盈餘, 合計, ...
    };

    if (data.stat !== 'OK' || !Array.isArray(data.data)) return json([], 200);

    const results: { year: string; cashPerShare: number }[] = [];

    for (const row of [...data.data].reverse()) {
      // row[0] = ROC year (e.g. "113"), row[4] = 現金公積, row[5] = 現金盈餘
      const rocYear = parseInt(row[0]?.trim() ?? '0');
      if (!rocYear) continue;
      const ceYear = String(rocYear + 1911);
      const cash =
        (parseFloat(row[4]?.replace(/,/g, '') ?? '0') || 0) +
        (parseFloat(row[5]?.replace(/,/g, '') ?? '0') || 0);
      if (cash > 0) {
        results.push({ year: ceYear, cashPerShare: cash });
      }
    }

    // newest first, cap at 5
    return json(results.slice(0, 5), 200, 'public, max-age=43200');
  } catch {
    return json([], 200);
  }
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
