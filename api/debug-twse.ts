/** Temporary diagnostics — what does www.twse.com.tw return from the edge? */
export const config = {
  runtime: 'edge',
  regions: ['sin1', 'hnd1'],
};

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

export default async function handler(): Promise<Response> {
  const targets = [
    'https://www.twse.com.tw/rwd/zh/ETF/etfDiv?stkNo=0056&startDate=20250101&endDate=20261001&response=json',
    'https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=20260601&stockNo=2330',
  ];
  const results: Record<string, unknown> = {};
  for (const url of targets) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', Referer: 'https://www.twse.com.tw/', 'User-Agent': UA },
        signal: AbortSignal.timeout(10_000),
      });
      const body = await res.text();
      results[url] = { status: res.status, contentType: res.headers.get('content-type'), bodyStart: body.slice(0, 300) };
    } catch (e) {
      results[url] = { error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
    }
  }
  return new Response(JSON.stringify(results, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
