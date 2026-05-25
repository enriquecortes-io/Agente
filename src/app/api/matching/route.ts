import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const supabase = createClient(
 process.env.SUPABASE_URL!,
 process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
 try {
   const body = await req.json();
   const propiedad = body.record;
    // titulo es jsonb — extraer texto
    if (propiedad.titulo && typeof propiedad.titulo === 'object') {
      propiedad.titulo = propiedad.titulo.es || propiedad.titulo.en || 'Propiedad exclusiva';
    }
   if (!propiedad) return new Response(JSON.stringify({ error: 'Sin record' }), { status: 400 });

   console.log(`[Matching] Nueva propiedad: ${propiedad.titulo} — ${propiedad.precio}€`);

   // Buscar leads compatibles por presupuesto y zona
   const precioNum = parseFloat(propiedad.precio) || 0;
   const margenInf = precioNum * 0.8;
   const margenSup = precioNum * 1.2;

   const { data: leads } = await supabase
     .from('leads')
     .select('name, email, horizon, score, urgencia, motivacion')
     .neq('estado', 'perdido')
     .not('email', 'is', null)
     .gt('score', 0)
     .order('score', { ascending: false });

   if (!leads?.length) {
     console.log('[Matching] Sin leads cualificados');
     return new Response(JSON.stringify({ success: true, matches: 0 }), { status: 200 });
   }

   // Filtrar leads compatibles por presupuesto
   const compatibles = leads.filter(lead => {
     if (!lead.horizon) return false;
     const presupuesto = parseFloat(lead.horizon.replace(/[^\d.]/g, '')) || 0;
     return presupuesto >= margenInf && presupuesto <= margenSup;
   });

   console.log(`[Matching] ${compatibles.length} leads compatibles de ${leads.length}`);

   // Notificar a Enrique
   const resend = new Resend(process.env.RESEND_API_KEY);
   if (compatibles.length > 0) {
     await resend.emails.send({
       from: 'Harvis <onboarding@resend.dev>',
       to: process.env.ENRIQUE_EMAIL!,
       subject: `🏠 Nueva propiedad — ${compatibles.length} leads compatibles`,
       html: `
         <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #e8e0d0; padding: 40px;">
           <p style="color: #8a7a6a; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 24px 0;">HARVIS — MATCHING AUTOMÁTICO</p>
           <h1 style="color: #e8e0d0; font-weight: normal; font-size: 22px; margin: 0 0 8px 0;">${propiedad.titulo}</h1>
           <p style="color: #c8a96a; margin: 0 0 32px 0;">€${Number(propiedad.precio).toLocaleString('es-ES')} · ${propiedad.municipio || 'Marbella'}</p>
           <p style="color: #c8b89a; margin-bottom: 24px;">${compatibles.length} leads en tu CRM son compatibles con esta propiedad:</p>
           <table style="width: 100%; border-collapse: collapse;">
             ${compatibles.map(l => `
               <tr style="border-bottom: 1px solid #1a1a1a;">
                 <td style="padding: 12px 0; color: #e8e0d0;">${l.name}</td>
                 <td style="padding: 12px 0; color: #8a7a6a; font-size: 12px;">${l.email}</td>
                 <td style="padding: 12px 0; color: #c8a96a; font-size: 12px;">Score: ${l.score}</td>
               </tr>`).join('')}
           </table>
           ${propiedad.slug ? `<br><a href="https://mdlm-xi.vercel.app/es/propiedades/${propiedad.slug}" style="display: inline-block; background: #c8a96a; color: #0a0a0a; padding: 12px 32px; text-decoration: none; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; border-radius: 2px; margin-top: 24px;">Ver propiedad</a>` : ''}
           <p style="color: #3a3a3a; font-size: 11px; text-align: center; margin-top: 40px;">Harvis Real Estate Intelligence · Marbella</p>
         </div>
       `,
     });
   }

   // Email a cada lead compatible
   for (const lead of compatibles) {
     await resend.emails.send({
       from: 'Harvis <onboarding@resend.dev>',
       to: lead.email,
       subject: `Nueva propiedad exclusiva que podría interesarle — ${propiedad.titulo}`,
       html: `
         <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #e8e0d0; padding: 40px;">
           <p style="color: #8a7a6a; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 24px 0;">THE EDIT MARBELLA</p>
           <h1 style="color: #e8e0d0; font-weight: normal; font-size: 22px; margin: 0 0 8px 0;">${propiedad.titulo}</h1>
           <p style="color: #c8a96a; margin: 0 0 32px 0;">€${Number(propiedad.precio).toLocaleString('es-ES')} · ${propiedad.municipio || 'Marbella'} · ${propiedad.habitaciones || '—'} habitaciones</p>
           <p style="color: #c8b89a; font-size: 15px; line-height: 1.7; margin-bottom: 32px;">
             Estimado ${lead.name},<br><br>
             Acabamos de incorporar una nueva propiedad a nuestra selección que se ajusta a su perfil de búsqueda. Dada su exclusividad, nos ha parecido oportuno informarle antes de que esté disponible públicamente.
           </p>
           ${propiedad.slug ? `<a href="https://mdlm-xi.vercel.app/es/propiedades/${propiedad.slug}" style="display: inline-block; background: #c8a96a; color: #0a0a0a; padding: 14px 36px; text-decoration: none; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; border-radius: 2px;">Ver propiedad</a>` : ''}
           <p style="color: #8a7a6a; font-size: 13px; margin-top: 40px;">Para concertar una visita privada, simplemente responda a este email.</p>
           <p style="color: #3a3a3a; font-size: 11px; text-align: center; margin-top: 40px;">Harvis Real Estate Intelligence · Marbella</p>
         </div>
       `,
     });
     console.log(`[Matching] Email enviado a ${lead.name} (${lead.email})`);
   }

   return new Response(
     JSON.stringify({ success: true, matches: compatibles.length }),
     { status: 200, headers: { 'Content-Type': 'application/json' } }
   );

 } catch (error: any) {
   console.error('[Matching] Error:', error.message);
   return new Response(JSON.stringify({ error: error.message }), { status: 500 });
 }
}
