import { getSupabase } from '../../../../tools/reelIntelTools.js';
import { inngest } from '../../../../inngest/client.js';

export const dynamic = 'force-dynamic';
const json = (d: any, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
const MARCAS = ['tem', 'solena', 'smc'];

// GET /api/admin/intel?marca=tem → todo lo necesario para la pestaña Inteligencia
export async function GET(req: Request) {
  const marca = new URL(req.url).searchParams.get('marca') || 'tem';
  if (!MARCAS.includes(marca)) return json({ error: 'Marca no válida' }, 400);
  const sb = getSupabase();
  const [fuentes, reels, patron, plan] = await Promise.all([
    sb.from('ig_fuentes').select('*').eq('marca', marca).order('created_at'),
    sb.from('ig_reels').select('id,url,owner,caption,views,likes,comments,duracion_seg,publicado_at,thumbnail_url,outlier_score,engagement_rate,analizado,analisis')
      .eq('marca', marca).order('outlier_score', { ascending: false }).limit(30),
    sb.from('ig_patrones').select('*').eq('marca', marca).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('contenido_plan').select('*').eq('marca', marca).neq('estado', 'descartado').order('created_at', { ascending: false }).limit(40),
  ]);
  const err = fuentes.error || reels.error || patron.error || plan.error;
  if (err) return json({ error: err.message }, 500);
  return json({ fuentes: fuentes.data, reels: reels.data, patron: patron.data, plan: plan.data });
}

// POST /api/admin/intel { marca, nGuiones?, propiedades? } → lanza el pipeline en Inngest
export async function POST(req: Request) {
  const { marca, nGuiones = 6, propiedades = [], fuenteId } = await req.json();
  if (!MARCAS.includes(marca)) return json({ error: 'Marca no válida' }, 400);
  await inngest.send({ name: 'reels/intel', data: { marca, nGuiones, propiedades, fuenteId } });
  return json({ ok: true, mensaje: 'Pipeline lanzado. Tarda unos minutos.' });
}
