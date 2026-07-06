import { createClient } from '@supabase/supabase-js';
import { inngest } from '../../../../inngest/client.js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SOLENA_SUPABASE_URL!,
    process.env.SOLENA_SERVICE_ROLE_KEY!
  );
}

function clasificarTemperatura(tiempoMercado: number, plazoDeseado: string): 'caliente' | 'templado' {
  const esAhora = ['ahora', 'ya', 'inmediato', 'urgente'].some(p => plazoDeseado?.toLowerCase().includes(p));
  if (tiempoMercado > 3 || esAhora) return 'caliente';
  return 'templado';
}

function normalizePhone(raw: string | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('34') && digits.length === 11) return `+${digits}`;
  if (digits.length === 9) return `+34${digits}`;
  return `+${digits}`;
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabase();
    const body = await req.json();

    const name            = body.nombre ?? body.full_name ?? body.name ?? '';
    const email           = body.email ?? '';
    const phone           = normalizePhone(body.whatsapp ?? body.phone_number ?? body.phone);
    const zona            = body.zona ?? body.location ?? '';
    const tipo_propiedad  = body.tipo_propiedad ?? body.property_type ?? '';
    const precio_estimado = parseFloat(body.precio ?? body.precio_estimado ?? '0') || null;
    const tiempo_mercado  = parseInt(body.tiempo_publicado ?? body.tiempo_mercado ?? '0', 10) || 0;
    const plazo_deseado   = body.plazo ?? body.plazo_deseado ?? '';

    if (!name) return Response.json({ error: 'name es obligatorio' }, { status: 400 });

    const temperatura = clasificarTemperatura(tiempo_mercado, plazo_deseado);

    const { data: lead, error } = await supabase
      .from('leads')
      .insert({
        name, email, phone, zona, tipo_propiedad,
        precio_estimado, tiempo_mercado, plazo_deseado,
        temperatura, fuente: 'meta_ads',
        fase: 'nuevo', estado: 'activo', agente: 'Solena',
      })
      .select()
      .single();

    if (error) {
      console.error('[Ingest] Supabase error:', error);
      return Response.json({ error: 'Error guardando lead', detail: error.message }, { status: 500 });
    }

    if (temperatura === 'caliente') {
      await inngest.send({ name: 'leads/notificar-caliente', data: { lead } });
    } else {
      await inngest.send({ name: 'leads/procesar-templado', data: { lead } });
    }

    console.log(`[Ingest] ${temperatura.toUpperCase()} — ${lead.id} ${name}`);
    return Response.json({ success: true, lead_id: lead.id, temperatura });

  } catch (err: any) {
    console.error('[Ingest] Error:', err.message);
    return Response.json({ error: 'Error interno', detail: err.message }, { status: 500 });
  }
}
