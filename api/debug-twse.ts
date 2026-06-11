/** Temporary diagnostics — which TWSE hosts are reachable from the edge? */
export const config = {
  runtime: 'edge',
  regions: ['sin1', 'hnd1'],
};

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

export async function probe(): Promise<Record<string, unknown>> {
  const targets = [
    'https://www.twse.com.tw/rwd/zh/ETF/etfDiv?stkNo=0056&startDate=20250101&endDate=20261001&response=json',
    'https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL',
    'https://mops.twse.com.tw/mops/api/t05st09_2',
  ];
  const results: Record<string, unknown> = {};
  await Promise.all(targets.map(async (url) => {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': UA },
        signal: AbortSignal.timeout(8_000),
      });
      const body = await res.text();
      results[url] = { status: res.status, bodyStart: body.slice(0, 120) };
    } catch (e) {
      results[url] = { error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
    }
  }));
  return results;
}

export default async function handler(): Promise<Response> {
  return new Response(JSON.stringify(await probe(), null, 2), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
