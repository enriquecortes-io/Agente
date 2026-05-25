import { createClient } from '@supabase/supabase-js';
import { calcularScore } from './scoringTools.js';
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
      // Verificar si ya existe el lead por email o teléfono
      const contactoKey = esEmail ? 'email' : 'phone';
      const contactoVal = esEmail ? lead.contacto : lead.contacto;
      const { data: existing } = await supabase.from('captacion_leads').select('id').eq(contactoKey, contactoVal).limit(1);
      if (existing && existing.length > 0) {
        console.log(`[CRM] Lead captación de ${lead.nombre} ya existe — ignorando duplicado`);
        return { success: true, message: 'Lead ya existente.' };
      }
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

      const contactoKey = esEmail ? 'email' : 'phone';
      const { data: existing } = await supabase.from('leads').select('id').eq(contactoKey, lead.contacto).limit(1);
      if (existing && existing.length > 0) {
        console.log(`[CRM] Lead de ${lead.nombre} ya existe — ignorando duplicado`);
        return { success: true, message: 'Lead ya existente.' };
      }
      const notasLower = (lead.notasCualificacion || '').toLowerCase();
      const urgencia = notasLower.includes('urgencia: alta') ? 'alta' : notasLower.includes('urgencia: media') ? 'media' : 'baja';
      const motivacion = notasLower.includes('inversor') ? 'inversor' : notasLower.includes('reubicaci') ? 'reubicacion' : 'segunda_residencia';
      const score = calcularScore({
        nombre: lead.nombre,
        presupuesto: lead.presupuesto,
        urgencia: urgencia as 'alta' | 'media' | 'baja',
        motivacion: motivacion as 'inversor' | 'reubicacion' | 'segunda_residencia',
        tieneEmail: !!(lead.contacto && lead.contacto.includes('@')),
        tieneTelefono: !!(lead.contacto && !lead.contacto.includes('@')),
      });
      const { error } = await supabase.from('leads').insert({
        name: lead.nombre,
        email: esEmail ? lead.contacto : null,
        phone: esPhone ? lead.contacto : null,
        horizon: lead.presupuesto ? `${lead.presupuesto}€` : null,
        notas: notas,
        agente: 'Harvis',
        score,
        urgencia,
        motivacion,
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
