export const dynamic = 'force-dynamic';
const json = (d: any, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });

const API = 'https://api.inngest.com/v1';

async function inngestApi(ruta: string) {
  const key = process.env.INNGEST_SIGNING_KEY;
  if (!key) throw new Error('Falta INNGEST_SIGNING_KEY');
  const res = await fetch(`${API}${ruta}`, { headers: { Authorization: `Bearer ${key}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Inngest ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

/**
 * GET /api/admin/inngest?evento=produccion/preparar&limite=3
 * Estado y errores de los últimos runs, para diagnosticar sin entrar al dashboard.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const evento = searchParams.get('evento') || 'reels/intel';
  const limite = Math.min(Number(searchParams.get('limite') || 3), 10);

  try {
    const eventos = await inngestApi(`/events?name=${encodeURIComponent(evento)}&limit=${limite}`);
    const lista = eventos.data || [];

    const runs = [];
    for (const ev of lista) {
      const r = await inngestApi(`/events/${ev.internal_id || ev.id}/runs`);
      for (const run of r.data || []) {
        runs.push({
          evento,
          run_id: run.run_id,
          estado: run.status,
          empezado: run.run_started_at,
          terminado: run.ended_at,
          // El output de un run fallido trae el mensaje y la traza
          error: run.status === 'Failed' ? (run.output?.message || run.output?.error || run.output) : null,
        });
      }
    }

    return json({ evento, runs });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
}
