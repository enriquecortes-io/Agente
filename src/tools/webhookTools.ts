import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

interface LeadData {
  nombre: string;
  contacto: string;
  presupuesto?: number;
  estiloBuscado?: string;
  notasCualificacion: string;
  tipoLead?: 'Venta' | 'Captacion' | 'Gestion';
}

interface PropertyCopywriting {
  titulo: string;
  ubicacion: string;
  precio: number;
  copywritingEmocional: string;
  tagsLifestyle: string[];
}

/**
 * Lead de VENTA o GESTIÓN → tabla leads
 * Lead de CAPTACIÓN → tabla captacion_leads
 */
export async function sendCrmLeadNotification(lead: LeadData) {
  try {
    // Separar nombre y contacto
    const esEmail = lead.contacto.includes('@');
    const esPhone = !esEmail;

    if (lead.tipoLead === 'Captacion') {
      // → captacion_leads
      const { error } = await supabase.from('captacion_leads').insert({
        name: lead.nombre,
        email: esEmail ? lead.contacto : null,
        phone: esPhone ? lead.contacto : null,
        precio_estimado: lead.presupuesto ? `${lead.presupuesto}€` : null,
        ubicacion: lead.estiloBuscado || null,
        mensaje: lead.notasCualificacion,
        locale: 'es',
      });

      if (error) throw new Error(error.message);
      console.log(`[CRM] Lead captación de ${lead.nombre} insertado en captacion_leads`);

    } else {
      // Venta o Gestion → leads
      const notas = lead.tipoLead === 'Gestion'
        ? `[GESTIÓN] ${lead.notasCualificacion}`
        : lead.notasCualificacion;

      const { error } = await supabase.from('leads').insert({
        name: lead.nombre,
        email: esEmail ? lead.contacto : null,
        phone: esPhone ? lead.contacto : null,
        horizon: lead.presupuesto ? `${lead.presupuesto}€` : null,
        notas: notas,
        agente: 'Harvis',
        locale: 'es',
      });

      if (error) throw new Error(error.message);
      console.log(`[CRM] Lead ${lead.tipoLead} de ${lead.nombre} insertado en leads`);
    }

    return { success: true, message: `Lead de ${lead.nombre} registrado en Supabase.` };

  } catch (error: any) {
    console.error('[CRM] Error al insertar lead:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Publicación de propiedad — pendiente de CMS
 * Por ahora loguea y devuelve éxito para no bloquear el agente
 */
export async function triggerCmsPropertyPublish(property: PropertyCopywriting) {
  console.log(`[CMS] Propiedad pendiente de publicar: ${property.titulo}`);
  console.log(`[CMS] Configura CMS_WEBHOOK_URL en .env.local cuando tengas el endpoint`);
  return {
    success: true,
    message: 'Copywriting generado. Pendiente de configurar webhook CMS.',
    data: property,
  };
}
