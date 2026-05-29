/**
 * Vercel Edge Function — proxy for Taiwan Stock Exchange real-time quotes.
 *
 * Uses TWSE mis.twse.com.tw (official, server-to-server, no CORS or auth needed).
 * Falls back to Yahoo Finance v8 if TWSE returns no usable data.
 *
 * GET /api/prices?symbols=2330,2412
 * Returns: { "2330": 2360.0, "2412": 78.5, ... }
 */
export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('symbols') ?? '';

  const symbols = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (symbols.length === 0) return json({});

  // ── 1. Try TWSE real-time API (most reliable for Taiwan stocks) ──────────────
  try {
    const exCh = symbols.map((s) => `tse_${s}.tw`).join('|');
    const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(exCh)}&json=1&delay=0`;

    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Referer: 'https://mis.twse.com.tw/',
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        rtcode?: string;
        msgArray?: Array<{ c?: string; z?: string }>;
      };

      if (data.rtcode === '0000' && Array.isArray(data.msgArray)) {
        const prices: Record<string, number> = {};
        for (const item of data.msgArray) {
          if (!item.c || !item.z || item.z === '-') continue;
          const price = parseFloat(item.z);
          if (!isNaN(price) && price > 0) prices[item.c] = price;
        }
        if (Object.keys(prices).length > 0) return json(prices);
      }
    }
  } catch {
    // fall through to Yahoo Finance fallback
  }

  // ── 2. Fallback: Yahoo Finance v8 ────────────────────────────────────────────
  try {
    const tickers = symbols.map((s) => `${s}.TW`).join(',');
    const url = `https://query1.finance.yahoo.com/v8/finance/quote?symbols=${tickers}&fields=regularMarketPrice`;

    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) throw new Error(`Yahoo Finance ${res.status}`);

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
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
