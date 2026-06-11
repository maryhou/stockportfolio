/** Temporary diagnostics — same probes from a US edge region. */
import { probe } from './debug-twse';

export const config = {
  runtime: 'edge',
  regions: ['iad1'],
};

export default async function handler(): Promise<Response> {
  return new Response(JSON.stringify(await probe(), null, 2), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
