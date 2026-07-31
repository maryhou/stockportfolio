/**
 * Fetch real-time (or previous-close) prices for Taiwan stocks.
 *
 * Production → Vercel Edge proxy at /api/prices → TWSE mis.twse.com.tw
 *   • z field = last matched trade, but mid-session it is often "-" (no match
 *     in the current ~5 s snapshot), so we fall back to the best bid/ask
 *     midpoint before ever using y — see pickPrice().
 *   • y field = previous close, used only when the market is closed / no quotes
 * Development → direct TWSE call (usually works; CORS ignored by modern browsers
 *   when the server sends permissive headers, or fails silently in the poller).
 *
 * Returns a { symbol → price } map.
 * Throws only on genuine network/server failures so callers can surface the error.
 * Returns {} when prices are unavailable but the service is reachable.
 */
/**
 * AbortSignal.timeout() was introduced in Safari 16 / iPadOS 16.
 * Older devices throw TypeError — this wrapper falls back to AbortController.
 */
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

/** A single row from the mis.twse getStockInfo response. */
export interface MisItem {
  c?: string; // stock code
  z?: string; // last matched trade price ("-" when no match in this snapshot)
  b?: string; // best 5 bid prices, "_"-joined (highest first)
  a?: string; // best 5 ask prices, "_"-joined (lowest first)
  y?: string; // previous close
}

const num = (s?: string): number => {
  if (!s || s === '-') return NaN;
  const n = parseFloat(s);
  return n > 0 ? n : NaN;
};

/**
 * Pick the most-current price from a mis row.
 *
 * The mis `z` (last trade) field is frequently "-" during trading hours — it
 * only reflects a match inside the current ~5 s snapshot, so it goes blank
 * whenever no trade lands in that window. Falling straight to `y` then shows
 * *yesterday's close* mid-session, which can be off by many percent.
 *
 * Chain: last trade → best bid/ask midpoint (live intraday quote) → previous
 * close (only when the market is truly closed and no quotes exist).
 *
 * NOTE: kept in sync with the identical helper in api/prices.ts.
 */
export function pickPrice(item: MisItem): number | null {
  const z = num(item.z);
  if (!isNaN(z)) return z;

  const bid = num(item.b?.split('_')[0]);
  const ask = num(item.a?.split('_')[0]);
  if (!isNaN(bid) && !isNaN(ask)) return Math.round((bid + ask) * 50) / 100; // midpoint, 2dp
  if (!isNaN(bid)) return bid;
  if (!isNaN(ask)) return ask;

  const y = num(item.y);
  return isNaN(y) ? null : y;
}

export async function fetchStockPrices(
  symbols: string[],
): Promise<Record<string, number>> {
  if (symbols.length === 0) return {};

  // ── Production: server-side proxy (avoids mobile CORS restrictions) ──────────
  if (!import.meta.env.DEV) {
    const res = await fetch(
      `/api/prices?symbols=${symbols.join(',')}`,
      { signal: timeoutSignal(12_000) },
    );
    if (!res.ok) throw new Error(`Price proxy ${res.status}`);
    const data = await res.json() as Record<string, number> & { error?: string };
    if (data.error) throw new Error(data.error);
    // Remove the error key before returning (type-safe)
    const { error: _err, ...prices } = data;
    void _err;
    return prices as Record<string, number>;
  }

  // ── Development: direct TWSE call ────────────────────────────────────────────
  // Query both boards: tse_ for TWSE-listed, otc_ for TPEx-listed (bond ETFs etc.)
  const exCh = symbols.flatMap((s) => [`tse_${s}.tw`, `otc_${s}.tw`]).join('|');
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(exCh)}&json=1&delay=0`;

  const res = await fetch(url, {
    headers: { Accept: 'application/json', Referer: 'https://mis.twse.com.tw/' },
    signal: timeoutSignal(8_000),
  });

  if (!res.ok) throw new Error(`TWSE ${res.status}`);

  const json = (await res.json()) as {
    rtcode?: string;
    msgArray?: MisItem[];
  };

  const out: Record<string, number> = {};
  for (const item of json?.msgArray ?? []) {
    if (!item.c) continue;
    const price = pickPrice(item);
    if (price !== null) out[item.c] = price;
  }
  return out;
}
