import { getSupabase } from '../../../../../tools/reelIntelTools.js';

export const dynamic = 'force-dynamic';
const ESTADOS = ['idea', 'aprobado', 'grabado', 'publicado', 'descartado'];

// PATCH { id, estado?, fecha_prevista? }
export async function PATCH(req: Request) {
  const { id, estado, fecha_prevista } = await req.json();
  const cambios: Record<string, any> = {};
  if (estado) {
    if (!ESTADOS.includes(estado)) return new Response(JSON.stringify({ error: 'Estado no válido' }), { status: 400 });
    cambios.estado = estado;
  }
  if (fecha_prevista !== undefined) cambios.fecha_prevista = fecha_prevista || null;
  const { error } = await getSupabase().from('contenido_plan').update(cambios).eq('id', id);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}
