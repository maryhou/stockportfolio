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

export default async function handler(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('symbols') ?? '';

  const symbols = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (symbols.length === 0) return json({});

  // TWSE uses tse_ prefix for main board (TSE) stocks
  const exCh = symbols.map((s) => `tse_${s}.tw`).join('|');
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
