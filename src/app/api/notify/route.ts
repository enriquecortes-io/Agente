import { notificarEnrique } from '../../../tools/notificacionTools.js';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Supabase envía { type, table, record, old_record }
    const record = body.record;
    if (!record) {
      return new Response(JSON.stringify({ error: 'Sin record' }), { status: 400 });
    }

    const tabla = body.table || 'leads';
    const tipoLead = tabla === 'captacion_leads' ? 'Captacion' : 'Venta';

    const nombre = record.name || 'Cliente';
    const contacto = record.email || record.phone || 'Sin contacto';
    const presupuesto = record.horizon
      ? parseFloat(record.horizon.replace(/[^\d.]/g, '')) || undefined
      : record.precio_estimado
      ? parseFloat(record.precio_estimado.replace(/[^\d.]/g, '')) || undefined
      : undefined;
    const notas = record.notas || record.mensaje || 'Lead nuevo desde Harvis';

    console.log(`[notify] Nuevo lead ${tipoLead}: ${nombre} / ${contacto}`);

    const result = await notificarEnrique({
      nombre,
      contacto,
      presupuesto,
      tipoLead: tipoLead as 'Venta' | 'Captacion' | 'Gestion',
      notasCualificacion: notas,
    });

    console.log(`[notify] Resend result:`, JSON.stringify(result));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[notify] Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
