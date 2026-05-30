/**
 * Fetch real-time (or previous-close) prices for Taiwan stocks.
 *
 * Production → Vercel Edge proxy at /api/prices → TWSE mis.twse.com.tw
 *   • z field = live price during trading hours (09:00–13:30 TST)
 *   • y field = previous close used outside trading hours
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
  const exCh = symbols.map((s) => `tse_${s}.tw`).join('|');
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(exCh)}&json=1&delay=0`;

  const res = await fetch(url, {
    headers: { Accept: 'application/json', Referer: 'https://mis.twse.com.tw/' },
    signal: timeoutSignal(8_000),
  });

  if (!res.ok) throw new Error(`TWSE ${res.status}`);

  const json = (await res.json()) as {
    rtcode?: string;
    msgArray?: Array<{ c?: string; z?: string; y?: string }>;
  };

  const out: Record<string, number> = {};
  for (const item of json?.msgArray ?? []) {
    if (!item.c) continue;
    const raw = item.z && item.z !== '-' ? item.z : item.y;
    if (!raw || raw === '-') continue;
    const price = parseFloat(raw);
    if (!isNaN(price) && price > 0) out[item.c] = price;
  }
  return out;
}
