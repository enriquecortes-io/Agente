import { inngest } from './client.js';
import { ingerirPropiedad } from '../tools/propertyIngestionTools.js';
import { createClient } from '@supabase/supabase-js';
import { sendEmail, templateImpacto3 } from '../email.js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── Existente ───────────────────────────────
export const ingestProperty = inngest.createFunction(
  { id: 'ingest-property', triggers: [{ event: 'property/ingest' }] },
  async ({ event, step }: any) => {
    const { url, slug } = event.data;
    const result = await step.run('ingerir-propiedad', async () => {
      return await ingerirPropiedad(url, slug);
    });
    return result;
  }
);

// ─── Lead Caliente ───────────────────────────
export const notificarCaliente = inngest.createFunction(
  { id: 'leads-notificar-caliente', triggers: [{ event: 'leads/notificar-caliente' }] },
  async ({ event, step }: any) => {
    const lead = event.data.lead;
    const supabase = getSupabase();

    await step.run('email-caliente', async () => {
      if (!lead.email) throw new Error(`Lead ${lead.id} sin email`);
      await sendEmail({
        to: lead.email,
        subject: `${lead.name}, te contactamos desde Solena`,
        html: templateImpacto3(lead.name, lead.zona),
      });
    });

    await step.run('registrar', async () => {
      await supabase.from('lead_seguimientos').insert({
        lead_id: lead.id,
        tipo: 'email_enviado',
        contenido: `Email caliente enviado a ${lead.email}`,
      });
      await supabase.from('leads').update({ fase: 'contacto_pendiente' }).eq('id', lead.id);
    });

    return { success: true };
  }
);

// ─── Lead Templado ───────────────────────────
export const procesarTemplado = inngest.createFunction(
  { id: 'leads-procesar-templado', triggers: [{ event: 'leads/procesar-templado' }] },
  async ({ event, step }: any) => {
    const lead = event.data.lead;
    const supabase = getSupabase();

    await step.run('enviar-email', async () => {
      if (!lead.email) throw new Error(`Lead ${lead.id} sin email`);
      await sendEmail({
        to: lead.email,
        subject: `${lead.name}, tenemos propiedades en ${lead.zona || 'la Costa del Sol'} que encajan contigo`,
        html: templateImpacto3(lead.name, lead.zona),
      });
    });

    await step.run('registrar-email', async () => {
      await supabase.from('lead_seguimientos').insert({
        lead_id: lead.id,
        tipo: 'email_enviado',
        contenido: `Email Impacto 3 → ${lead.email}`,
      });
      await supabase.from('leads').update({
        fase: 'email_enviado',
        seguimiento_enviado_at: new Date().toISOString(),
      }).eq('id', lead.id);
    });

    await step.sleep('esperar-24h', '24h');

    await step.run('recordatorio-24h', async () => {
      await sendEmail({
        to: process.env.ENRIQUE_EMAIL!,
        subject: `Follow-up pendiente: ${lead.name} — ${lead.zona}`,
        html: `<p>Han pasado 24h desde el primer email a <strong>${lead.name}</strong> (${lead.zona}). Estado actualizado a contacto_pendiente.</p>`,
      });
      await supabase.from('lead_seguimientos').insert({
        lead_id: lead.id,
        tipo: 'email_enviado',
        contenido: `Recordatorio 24h enviado a Enrique`,
      });
      await supabase.from('leads').update({ fase: 'contacto_pendiente' }).eq('id', lead.id);
    });

    return { success: true };
  }
);
