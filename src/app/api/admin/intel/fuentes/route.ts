import { getSupabase } from '../../../../../tools/reelIntelTools.js';

export const dynamic = 'force-dynamic';
const json = (d: any, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });

// POST { marca, tipo: 'cuenta'|'hashtag', valor }
export async function POST(req: Request) {
  const { marca, tipo, valor } = await req.json();
  const limpio = String(valor || '').trim().replace(/^[@#]/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '').toLowerCase();
  if (!limpio || !['cuenta', 'hashtag'].includes(tipo)) return json({ error: 'Datos no válidos' }, 400);
  const { data, error } = await getSupabase().from('ig_fuentes')
    .upsert({ marca, tipo, valor: limpio, activa: true }, { onConflict: 'marca,tipo,valor' }).select().single();
  if (error) return json({ error: error.message }, 500);
  return json({ fuente: data });
}

// PATCH { id, activa }
export async function PATCH(req: Request) {
  const { id, activa } = await req.json();
  const { error } = await getSupabase().from('ig_fuentes').update({ activa: !!activa }).eq('id', id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

// DELETE ?id=
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'Falta id' }, 400);
  const { error } = await getSupabase().from('ig_fuentes').delete().eq('id', id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
