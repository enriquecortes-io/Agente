import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getSupabase(project: string) {
  if (project === 'solena') {
    return createClient(process.env.SOLENA_SUPABASE_URL!, process.env.SOLENA_SERVICE_ROLE_KEY!);
  }
  if (project === 'smc') {
    return createClient(process.env.SMC_SUPABASE_URL!, process.env.SMC_SERVICE_ROLE_KEY!);
  }
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function getResendConfig(remitente: string) {
  if (remitente === 'solena') {
    return { apiKey: process.env.SOLENA_RESEND_API_KEY!, from: process.env.SOLENA_FROM_EMAIL || 'info@solenainmo.es' };
  }
  if (remitente === 'smc') {
    return { apiKey: process.env.SANTAMARIA_RESEND_API_KEY!, from: process.env.SANTAMARIA_FROM_EMAIL || 'info@santamaria-collection.com' };
  }
  return { apiKey: process.env.RESEND_API_KEY!, from: 'info@theeditmarbella.com' };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { proyecto, remitente, asunto, html } = body;

    if (!asunto || !html) {
      return Response.json({ error: 'Falta asunto o HTML' }, { status: 400 });
    }

    const project = proyecto || remitente || 'tem';
    const supabase = getSupabase(project);
    const { apiKey, from } = getResendConfig(remitente || project);

    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, name, email')
      .eq('proyecto', project)
      .neq('fase', 'email_enviado')
      .not('email', 'is', null)
      .neq('email', '');

    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!leads || leads.length === 0) {
      return Response.json({ message: 'No hay contactos pendientes', sent: 0 });
    }

    let sent = 0;
    let failed = 0;

    for (const lead of leads) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: lead.email,
            subject: asunto,
            html,
          }),
        });
        if (res.ok) {
          sent++;
          await supabase.from('leads').update({ fase: 'email_enviado' }).eq('id', lead.id);
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    return Response.json({ message: `Campaña enviada`, sent, failed, total: leads.length });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
