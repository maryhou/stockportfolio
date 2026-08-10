/**
 * Vercel Edge Function — Taiwan stock name lookup.
 *
 * The bundled src/data/twStocks.json is a static snapshot, so a stock listed
 * within the last few days (e.g. 009826) is missing from it and the add-stock
 * search shows no suggestion. The live TWSE mis endpoint, however, already
 * knows the name (`n`) the moment a symbol starts trading — so we look it up
 * on demand for codes the local list doesn't cover.
 *
 * Prices never depended on twStocks.json (they go by symbol through /api/prices),
 * so a new stock's price already resolves; this endpoint closes the name gap.
 *
 * GET /api/lookup?symbol=009826
 * Returns: { "code": "009826", "name": "貝萊德世界股票" }  — or { error } / {} if unknown.
 *
 * NOTE: symbol validation regex kept in sync with api/prices.ts + api/history.ts +
 * api/dividends.ts — see HANDOFF.md 維護規則.
 */
export const config = {
  runtime: 'edge',
  regions: ['sin1', 'hnd1'], // Singapore → Tokyo fallback (closest to Taiwan)
};

const TWSE_URL = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp';

// TW symbols: 4–6 digits + optional suffix, e.g. 2330, 00679B, 2887Z1 (特別股)
const SYMBOL_RE = /^[0-9]{4,6}[A-Z]?[0-9]?$/;

/** A single row from the mis.twse getStockInfo response (name fields only). */
interface MisItem {
  c?: string; // stock code
  n?: string; // short name (e.g. 貝萊德世界股票)
}

export default async function handler(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get('symbol') ?? '').trim().toUpperCase();

  if (!symbol) return json({});
  if (!SYMBOL_RE.test(symbol)) return json({ error: 'invalid symbol' }, 400);

  // Query both boards: tse_ for TWSE-listed, otc_ for TPEx-listed. The symbol
  // exists on only one — the other returns an empty record we skip.
  const exCh = [`tse_${symbol}.tw`, `otc_${symbol}.tw`].join('|');
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

    if (!res.ok) return json({ error: `TWSE ${res.status}` }, 502);

    const data = (await res.json()) as { rtcode?: string; msgArray?: MisItem[] };

    for (const item of data?.msgArray ?? []) {
      if (item.c && item.n) {
        return json({ code: item.c, name: item.n });
      }
    }

    // Reachable but unknown symbol — empty object, caller falls back to manual entry.
    return json({});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 502);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    // Names are effectively static once listed — cache briefly at the edge.
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  });
}
