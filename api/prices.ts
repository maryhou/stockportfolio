/**
 * Vercel Edge Function — Taiwan stock price proxy.
 *
 * Source: TWSE mis.twse.com.tw (official exchange, no auth required).
 *   z = real-time price during trading hours (09:00–13:30 TST)
 *   y = previous close when z = "-" (pre/post market)
 *
 * Deployed to Singapore region (sin1) for reliable access to TWSE servers.
 *
 * GET /api/prices?symbols=2330,2412
 * Returns: { "2330": 2360.0, "2412": 78.5, ... }
 */
export const config = {
  runtime: 'edge',
  regions: ['sin1', 'hnd1'], // Singapore → Tokyo fallback (closest to Taiwan)
};

const TWSE_URL = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp';

// TW symbols: 4–6 digits + optional suffix, e.g. 2330, 00679B, 2887Z1 (特別股)
const SYMBOL_RE = /^[0-9]{4,6}[A-Z]?[0-9]?$/;
const MAX_SYMBOLS = 50;

export default async function handler(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('symbols') ?? '';

  const symbols = raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (symbols.length === 0) return json({});
  if (symbols.length > MAX_SYMBOLS || symbols.some((s) => !SYMBOL_RE.test(s))) {
    return json({ error: 'invalid symbols' }, 400);
  }

  // Query both boards: tse_ for TWSE-listed, otc_ for TPEx-listed (e.g. bond
  // ETFs like 00679B). Each symbol exists on only one — the other returns an
  // empty record that the parser skips.
  const exCh = symbols.flatMap((s) => [`tse_${s}.tw`, `otc_${s}.tw`]).join('|');
  const url = `${TWSE_URL}?ex_ch=${encodeURIComponent(exCh)}&json=1&delay=0`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'zh-TW,zh;q=0.9',
        Referer: 'https://mis.twse.com.tw/',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(9_000),
    });

    if (!res.ok) {
      return json({ error: `TWSE ${res.status}` }, 502);
    }

    const data = (await res.json()) as {
      rtcode?: string;
      msgArray?: Array<{
        c?: string;  // stock code
        z?: string;  // real-time price ("-" when market closed)
        y?: string;  // previous close price
      }>;
    };

    const prices: Record<string, number> = {};

    for (const item of data?.msgArray ?? []) {
      if (!item.c) continue;

      // Prefer live price (z), fall back to previous close (y) when market is closed
      const raw = item.z && item.z !== '-' ? item.z : item.y;
      if (!raw || raw === '-') continue;

      const price = parseFloat(raw);
      if (!isNaN(price) && price > 0) prices[item.c] = price;
    }

    // Return whatever we have — empty {} is fine (caller treats it as "no change")
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
