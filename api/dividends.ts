/**
 * Vercel Edge Function — Yahoo Finance dividend history for Taiwan stocks.
 *
 * Tries {symbol}.TW first, falls back to {symbol}.TWO for OTC stocks.
 * Returns up to 10 most-recent dividend records, newest first.
 *
 * GET /api/dividends?symbol=00919
 * Returns: [{ date: "2024-06-21", cashPerShare: 0.7 }, ...]
 */
export const config = {
  runtime: 'edge',
  regions: ['sin1', 'hnd1'],
};

type YahooChart = {
  chart?: {
    result?: Array<{
      events?: {
        dividends?: Record<string, { amount: number; date: number }>;
      };
    }>;
    error?: unknown;
  };
};

export default async function handler(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.trim();
  if (!symbol) return json([], 400);

  // Try listed (.TW) first, then OTC (.TWO)
  for (const suffix of ['.TW', '.TWO']) {
    try {
      const url =
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}${suffix}` +
        `?events=dividends&interval=1d&range=5y`;

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible)',
          Accept: 'application/json',
        },
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

      if (results.length > 0) {
        return json(results, 200, 'public, max-age=43200'); // cache 12h
      }
    } catch {
      // try next suffix
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
