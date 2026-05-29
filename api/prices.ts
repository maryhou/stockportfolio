/**
 * Vercel Edge Function — server-side proxy for Yahoo Finance price quotes.
 * Avoids CORS restrictions that block direct browser requests on mobile.
 *
 * GET /api/prices?symbols=2330,2412
 * Returns: { "2330": 2310, "2412": 78.5, ... }
 */
export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('symbols') ?? '';

  const symbols = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (symbols.length === 0) {
    return json({});
  }

  // TWSE codes end in .TW; OTC codes in .TWO — try .TW for all (covers most portfolios)
  const tickers = symbols.map((s) => `${s}.TW`).join(',');
  const url = `https://query1.finance.yahoo.com/v8/finance/quote?symbols=${tickers}&fields=regularMarketPrice`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        // Provide a browser-like UA so Yahoo doesn't block the server request
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
      signal: AbortSignal.timeout(9_000),
    });

    if (!res.ok) {
      return json({ error: `Yahoo Finance returned ${res.status}` }, res.status);
    }

    const data = (await res.json()) as {
      quoteResponse?: {
        result?: Array<{ symbol: string; regularMarketPrice?: number }>;
      };
    };

    const prices: Record<string, number> = {};
    for (const q of data?.quoteResponse?.result ?? []) {
      if (!q.regularMarketPrice) continue;
      const code = q.symbol.replace(/\.TWO?$/, '');
      prices[code] = q.regularMarketPrice;
    }

    return json(prices);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 502);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
