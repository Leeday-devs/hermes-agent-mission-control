import { readSources } from '@/lib/mission-control';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const sources = await readSources();
    const bridge = sources.find(s => s.id === 'bridge');
    return Response.json({ online: bridge?.state === 'live', gateway: 'unverified', detail: bridge?.reason, lastSeen: bridge?.lastSuccess, sources }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ online: false, gateway: 'unavailable', lastSeen: null, detail: 'Database unavailable' }, { status: 503 }); }
}
