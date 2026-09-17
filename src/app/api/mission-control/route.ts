import { missionSnapshot } from '@/lib/mission-control';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const u = new URL(request.url);
  const filters = Object.fromEntries(['agent','source','severity','task','search','since','until'].map(k => [k, u.searchParams.get(k) || undefined]));
  try { return Response.json(await missionSnapshot(filters), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: 'Operational data unavailable: database could not be read.' }, { status: 503 }); }
}
