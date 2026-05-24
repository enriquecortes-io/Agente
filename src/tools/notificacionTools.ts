import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const resend = new Resend(process.env.RESEND_API_KEY);

interface LeadNotificacion {
 nombre: string;
 contacto: string;
 presupuesto?: number;
 zona?: string;
 tipoLead: 'Venta' | 'Captacion' | 'Gestion';
 notasCualificacion: string;
}

export async function notificarEnrique(lead: LeadNotificacion) {
 try {
   const emailDestino = process.env.ENRIQUE_EMAIL;
   if (!emailDestino) throw new Error('Falta ENRIQUE_EMAIL en .env.local');

   const presupuestoFormateado = lead.presupuesto
     ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(lead.presupuesto)
     : 'No especificado';

   const emoji = lead.tipoLead === 'Venta' ? '🏠' : lead.tipoLead === 'Captacion' ? '📋' : '⚙️';

   const { data, error } = await resend.emails.send({
     from: 'Harvis <harvis@theeditmarbella.com>',
     to: emailDestino,
     subject: `${emoji} Nuevo lead ${lead.tipoLead} — ${lead.nombre}`,
     html: `
       <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #e8e0d0; padding: 40px; border-radius: 8px;">
         
         <div style="border-bottom: 1px solid #2a2a2a; padding-bottom: 24px; margin-bottom: 32px;">
           <p style="color: #8a7a6a; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 8px 0;">HARVIS — REAL ESTATE INTELLIGENCE</p>
           <h1 style="color: #e8e0d0; font-size: 24px; margin: 0; font-weight: normal;">Nuevo lead cualificado</h1>
         </div>

         <table style="width: 100%; border-collapse: collapse; margin-bottom: 32px;">
           <tr>
             <td style="padding: 12px 0; border-bottom: 1px solid #1a1a1a; color: #8a7a6a; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; width: 140px;">Tipo</td>
             <td style="padding: 12px 0; border-bottom: 1px solid #1a1a1a; color: #e8e0d0;">${emoji} ${lead.tipoLead}</td>
           </tr>
           <tr>
             <td style="padding: 12px 0; border-bottom: 1px solid #1a1a1a; color: #8a7a6a; font-size: 12px; letter-spacing: 1px; text-transform: uppercase;">Cliente</td>
             <td style="padding: 12px 0; border-bottom: 1px solid #1a1a1a; color: #e8e0d0; font-weight: bold;">${lead.nombre}</td>
           </tr>
           <tr>
             <td style="padding: 12px 0; border-bottom: 1px solid #1a1a1a; color: #8a7a6a; font-size: 12px; letter-spacing: 1px; text-transform: uppercase;">Contacto</td>
             <td style="padding: 12px 0; border-bottom: 1px solid #1a1a1a; color: #c8a96a;">${lead.contacto}</td>
           </tr>
           <tr>
             <td style="padding: 12px 0; border-bottom: 1px solid #1a1a1a; color: #8a7a6a; font-size: 12px; letter-spacing: 1px; text-transform: uppercase;">Presupuesto</td>
             <td style="padding: 12px 0; border-bottom: 1px solid #1a1a1a; color: #e8e0d0;">${presupuestoFormateado}</td>
           </tr>
           <tr>
             <td style="padding: 12px 0; border-bottom: 1px solid #1a1a1a; color: #8a7a6a; font-size: 12px; letter-spacing: 1px; text-transform: uppercase;">Zona</td>
             <td style="padding: 12px 0; border-bottom: 1px solid #1a1a1a; color: #e8e0d0;">${lead.zona || 'No especificada'}</td>
           </tr>
         </table>

         <div style="background: #111; border-left: 2px solid #c8a96a; padding: 20px; margin-bottom: 32px; border-radius: 0 4px 4px 0;">
           <p style="color: #8a7a6a; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 8px 0;">Notas de cualificación</p>
           <p style="color: #e8e0d0; margin: 0; line-height: 1.6;">${lead.notasCualificacion}</p>
         </div>

         <div style="text-align: center;">
           <a href="https://supabase.com/dashboard" style="display: inline-block; background: #c8a96a; color: #0a0a0a; padding: 12px 32px; text-decoration: none; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; border-radius: 2px;">Ver en CRM</a>
         </div>

         <p style="color: #3a3a3a; font-size: 11px; text-align: center; margin-top: 32px;">
           ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · Harvis Real Estate Intelligence
         </p>

       </div>
     `,
   });

   if (error) throw new Error(error.message);

   console.log(`[Resend] Notificación enviada a ${emailDestino} — lead: ${lead.nombre}`);
   return { success: true, emailId: data?.id };

 } catch (error: any) {
   console.error('[Resend] Error:', error.message);
   return { success: false, error: error.message };
 }
}
