import { getSupabase } from '../../../../tools/reelIntelTools.js';
import { extraerCarpetaId } from '../../../../tools/produccionTools.js';
import { inngest } from '../../../../inngest/client.js';

export const dynamic = 'force-dynamic';
const json = (d: any, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
const MARCAS = ['tem', 'solena', 'smc'];

// GET /api/admin/produccion?marca=tem → producciones de esa marca
export async function GET(req: Request) {
  const marca = new URL(req.url).searchParams.get('marca') || 'tem';
  if (!MARCAS.includes(marca)) return json({ error: 'Marca no válida' }, 400);
  const { data, error } = await getSupabase()
    .from('producciones')
    .select('id, guion_id, carpeta_id, estado, paso, plan_montaje, video_url, error, created_at, actualizado_at')
    .eq('marca', marca)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) return json({ error: error.message }, 500);
  return json({ producciones: data });
}

// POST /api/admin/produccion { produccionId } → relanza una producción existente
//      /api/admin/produccion { marca, guionId, carpeta } → crea y lanza una nueva
export async function POST(req: Request) {
  const { marca, guionId, carpeta, produccionId } = await req.json();

  if (produccionId) {
    const sb = getSupabase();
    const { data: prod, error: e1 } = await sb.from('producciones')
      .select('id, carpeta_id').eq('id', produccionId).single();
    if (e1 || !prod) return json({ error: 'Producción no encontrada' }, 404);
    await sb.from('producciones')
      .update({ estado: 'preparando', paso: 'En cola', error: null, actualizado_at: new Date().toISOString() })
      .eq('id', produccionId);
    await inngest.send({ name: 'produccion/preparar', data: { produccionId, carpetaId: prod.carpeta_id } });
    return json({ ok: true, id: produccionId, mensaje: 'Relanzando producción.' });
  }

  if (!MARCAS.includes(marca)) return json({ error: 'Marca no válida' }, 400);
  const carpetaId = extraerCarpetaId(String(carpeta || ''));
  if (!guionId || !carpetaId) return json({ error: 'Faltan el guion o la carpeta de Drive' }, 400);

  const { data, error } = await getSupabase()
    .from('producciones')
    .insert({ marca, guion_id: guionId, carpeta_id: carpetaId, estado: 'preparando', paso: 'En cola' })
    .select('id')
    .single();
  if (error) return json({ error: error.message }, 500);

  await inngest.send({ name: 'produccion/preparar', data: { produccionId: data.id, carpetaId } });
  return json({ ok: true, id: data.id, mensaje: 'Preparando producción. Tarda unos minutos la primera vez.' });
}
