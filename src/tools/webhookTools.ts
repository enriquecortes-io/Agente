import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

interface LeadData {
  nombre: string;
  contacto: string;
  presupuesto?: number;
  estiloBuscado?: string;
  notasCualificacion: string;
}

interface PropertyCopywriting {
  titulo: string;
  ubicacion: string;
  precio: number;
  copywritingEmocional: string;
  tagsLifestyle: string[];
}

/**
 * Envía un lead cualificado orgánicamente por el agente hacia el CRM o canal de alertas
 */
export async function sendCrmLeadNotification(lead: LeadData) {
  try {
    const webhookUrl = process.env.CRM_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn('[Webhook Tool] CRM_WEBHOOK_URL no configurada en .env.local');
      return { success: false, error: 'Falta la configuración del webhook del CRM.' };
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'lead_qualified_by_ai',
        timestamp: new Date().toISOString(),
        data: lead
      })
    });

    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);

    console.log(`[Webhook Tool] Lead de ${lead.nombre} enviado correctamente al CRM.`);
    return { success: true, message: 'Perfil de inversor sincronizado con el CRM con éxito.' };
  } catch (error) {
    console.error('Error al disparar webhook de CRM:', error);
    return { success: false, error: 'Error de conectividad externa con el CRM.' };
  }
}

/**
 * Envía el copywriting optimizado de una propiedad para su publicación automática en la web
 */
export async function triggerCmsPropertyPublish(property: PropertyCopywriting) {
  try {
    const webhookUrl = process.env.CMS_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn('[Webhook Tool] CMS_WEBHOOK_URL no configurada en .env.local');
      return { success: false, error: 'Falta la configuración del webhook del CMS.' };
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'property_onboarding_ai',
        timestamp: new Date().toISOString(),
        data: property
      })
    });

    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);

    console.log(`[Webhook Tool] Publicación de "${property.titulo}" enviada al CMS.`);
    return { success: true, message: 'Copywriting y ficha técnica inyectados en el CMS correctamente.' };
  } catch (error) {
    console.error('Error al disparar webhook de CMS:', error);
    return { success: false, error: 'Error de conectividad externa con el CMS de la web.' };
  }
}
