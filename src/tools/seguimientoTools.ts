import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
);

interface LeadFollowup {
  nombre: string;
  email: string;
  ultimoMensaje: string;
  diasSinResponder: number;
}

export async function detectarLeadsSinSeguimiento(): Promise<LeadFollowup[]> {
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const hace7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Buscar conversaciones cuya última actividad fue hace 24h-7d
  const { data: conversaciones, error } = await supabase
    .from('conversaciones')
    .select('cliente_nombre, created_at, respuesta_agente')
    .lt('created_at', hace24h)
    .gt('created_at', hace7d)
    .order('created_at', { ascending: false });

  if (error || !conversaciones) {
    console.error('[Seguimiento] Error:', error?.message);
    return [];
  }

  // Agrupar por cliente y quedarnos con el último mensaje
  const ultimoPorCliente = new Map<string, any>();
  for (const conv of conversaciones) {
    if (!ultimoPorCliente.has(conv.cliente_nombre)) {
      ultimoPorCliente.set(conv.cliente_nombre, conv);
    }
  }

  // Para cada cliente único, buscar su email en leads
  const followups: LeadFollowup[] = [];
  for (const [nombre, conv] of ultimoPorCliente) {
    const { data: leads } = await supabase
      .from('leads')
      .select('email, seguimiento_enviado_at')
      .ilike('name', `%${nombre}%`)
      .limit(1);

    const lead = leads?.[0];
    if (!lead?.email) continue;

    // Saltar si ya se envió seguimiento en los últimos 5 días
    if (lead.seguimiento_enviado_at) {
      const ultimoSeguimiento = new Date(lead.seguimiento_enviado_at);
      const hace5d = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      if (ultimoSeguimiento > hace5d) continue;
    }

    const diasSinResponder = Math.floor(
      (Date.now() - new Date(conv.created_at).getTime()) / (24 * 60 * 60 * 1000)
    );

    followups.push({
      nombre,
      email: lead.email.split(',')[0].trim(),
      ultimoMensaje: conv.respuesta_agente,
      diasSinResponder,
    });
  }

  return followups;
}

export async function enviarSeguimiento(lead: LeadFollowup) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const asunto =
    lead.diasSinResponder <= 2
      ? `${lead.nombre}, ¿sigue interesado en propiedades en Marbella?`
      : `Nuevas propiedades exclusivas para usted, ${lead.nombre}`;

  const html = `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #e8e0d0; padding: 40px;">
      <p style="color: #8a7a6a; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 24px 0;">HARVIS — REAL ESTATE MARBELLA</p>
      <h1 style="color: #e8e0d0; font-weight: normal; font-size: 24px; margin: 0 0 24px 0;">${asunto}</h1>
      <p style="color: #c8b89a; font-size: 15px; line-height: 1.7; margin-bottom: 24px;">
        Estimado ${lead.nombre},
      </p>
      <p style="color: #c8b89a; font-size: 15px; line-height: 1.7; margin-bottom: 24px;">
        Hace unos días iniciamos una conversación sobre propiedades en Marbella. Quería retomar el contacto para saber si sigue interesado o si sus criterios han cambiado.
      </p>
      <p style="color: #c8b89a; font-size: 15px; line-height: 1.7; margin-bottom: 32px;">
        Tenemos nuevas oportunidades exclusivas que podrían interesarle, incluyendo propiedades off-market que no aparecen públicamente.
      </p>
      <a href="https://mdlm-xi.vercel.app" style="display: inline-block; background: #c8a96a; color: #0a0a0a; padding: 14px 36px; text-decoration: none; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; border-radius: 2px;">Ver propiedades</a>
      <p style="color: #8a7a6a; font-size: 13px; margin-top: 40px; line-height: 1.6;">
        Si prefiere una conversación personal, simplemente responda a este email y le contactaremos en menos de 24 horas.
      </p>
      <p style="color: #3a3a3a; font-size: 11px; text-align: center; margin-top: 40px;">Harvis Real Estate Intelligence · Marbella</p>
    </div>
  `;

  const result = await resend.emails.send({
    from: 'Harvis <onboarding@resend.dev>',
    to: lead.email,
    subject: asunto,
    html,
  });

  // Marcar como enviado en Supabase
  await supabase
    .from('leads')
    .update({ seguimiento_enviado_at: new Date().toISOString() })
    .ilike('name', `%${lead.nombre}%`);

  console.log(`[Seguimiento] Email enviado a ${lead.nombre} (${lead.email})`);
  return result;
}

export async function ejecutarSeguimientos() {
  const leads = await detectarLeadsSinSeguimiento();
  console.log(`[Seguimiento] ${leads.length} leads detectados`);

  const resultados = [];
  for (const lead of leads) {
    try {
      const r = await enviarSeguimiento(lead);
      resultados.push({ nombre: lead.nombre, success: true, result: r });
    } catch (e: any) {
      resultados.push({ nombre: lead.nombre, success: false, error: e.message });
    }
  }

  return { total: leads.length, resultados };
}

export async function marcarLeadsFrios() {
  const hace7d  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString();
  const hace14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // Leads sin conversación en 7-14 días → fríos
  const { data: frios } = await supabase
    .from('leads')
    .select('id, name, score')
    .lt('created_at', hace7d)
    .gt('created_at', hace14d)
    .neq('estado', 'frio')
    .neq('estado', 'perdido');

  for (const lead of frios || []) {
    await supabase.from('leads').update({ estado: 'frio', score: Math.max(0, (lead.score || 0) - 20) }).eq('id', lead.id);
    console.log('[Seguimiento] Lead frío:', lead.name);
  }

  // Leads sin conversación > 14 días → perdidos
  const { data: perdidos } = await supabase
    .from('leads')
    .select('id, name, score')
    .lt('created_at', hace14d)
    .neq('estado', 'perdido');

  for (const lead of perdidos || []) {
    await supabase.from('leads').update({ estado: 'perdido', score: 0 }).eq('id', lead.id);
    console.log('[Seguimiento] Lead perdido:', lead.name);
  }

  return { frios: frios?.length || 0, perdidos: perdidos?.length || 0 };
}
