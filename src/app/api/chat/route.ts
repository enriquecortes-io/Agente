import { openai } from '@ai-sdk/google';
import { streamText, convertToCoreMessages } from 'ai';
import { SYSTEM_PROMPT } from '../../../agents/realEstateExecutive.js';
import { searchPropertiesInSupabase } from '../../../tools/supabaseTools.js';
import { createClientFolder } from '../../../tools/googleDriveTools.js';
import { sendCrmLeadNotification, triggerCmsPropertyPublish } from '../../../tools/webhookTools.js';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    const result = await streamText({
      model: google('gemini-1.5-pro'),
      system: SYSTEM_PROMPT,
      messages: convertToCoreMessages(messages),
      // El arsenal completo de herramientas del agente de élite
      tools: {
        buscarPropiedades: {
          description: 'Consulta el inventario disponible en Supabase filtrando por ubicación, presupuesto máximo y estilo de vida.',
          parameters: {
            type: 'object',
            properties: {
              zona: { type: 'string', description: 'Ubicación en Marbella (ej: La Zagaleta, Sierra Blanca, Nueva Andalucía).' },
              precioMax: { type: 'number', description: 'Presupuesto máximo en euros.' },
              estilo: { type: 'string', description: 'Estilo arquitectónico o tags de ambiente (ej: minimalista, vistas al mar).' }
            }
          },
          execute: async ({ zona, precioMax, estilo }) => {
            console.log(`[Core] Tool Buscar: ${zona}, ${precioMax}, ${estilo}`);
            return await searchPropertiesInSupabase({ zona, precioMax, estilo });
          }
        },
        crearCarpetaCliente: {
          description: 'Crea un espacio seguro en Google Drive para guardar el KYC, pasaporte o NDA de un inversor cualificado.',
          parameters: {
            type: 'object',
            properties: {
              nombreCliente: { type: 'string', description: 'Nombre completo del inversor o fondo.' }
            },
            required: ['nombreCliente']
          },
          execute: async ({ nombreCliente }) => {
            console.log(`[Core] Tool Drive: ${nombreCliente}`);
            return await createClientFolder(nombreCliente);
          }
        },
        notificarLeadCRM: {
          description: 'Sincroniza un perfil de inversor cualificado orgánicamente enviando sus datos esenciales al CRM corporativo.',
          parameters: {
            type: 'object',
            properties: {
              nombre: { type: 'string', description: 'Nombre completo del lead.' },
              contacto: { type: 'string', description: 'Número de WhatsApp, teléfono o email.' },
              presupuesto: { type: 'number', description: 'Presupuesto máximo detectado.' },
              estiloBuscado: { type: 'string', description: 'Preferencias de diseño o lifestyle.' },
              notasCualificacion: { type: 'string', description: 'Resumen cualitativo de la conversación y urgencia del cliente.' }
            },
            required: ['nombre', 'contacto', 'notasCualificacion']
          },
          execute: async (leadData) => {
            console.log(`[Core] Tool CRM: Enviando lead ${leadData.nombre}`);
            return await sendCrmLeadNotification(leadData);
          }
        },
        publicarPropiedadCMS: {
          description: 'Inyecta el copywriting emocional y la ficha técnica de una propiedad directamente en el CMS de la web para su publicación.',
          parameters: {
            type: 'object',
            properties: {
              titulo: { type: 'string', description: 'Título comercial de la propiedad de lujo.' },
              ubicacion: { type: 'string', description: 'Dirección o zona exacta en Marbella.' },
              precio: { type: 'number', description: 'Precio de salida al mercado en euros.' },
              copywritingEmocional: { type: 'string', description: 'Narrativa persuasiva centrada en la luz, los materiales y la exclusividad.' },
              tagsLifestyle: { type: 'array', items: { type: 'string' }, description: 'Tags de estilo de vida.' }
            },
            required: ['titulo', 'ubicacion', 'precio', 'copywritingEmocional']
          },
          execute: async (propertyData) => {
            console.log(`[Core] Tool CMS: Publicando propiedad ${propertyData.titulo}`);
            return await triggerCmsPropertyPublish(propertyData);
          }
        }
      }
    });

    return result.toDataStreamResponse();

  } catch (error) {
    console.error('Error crítico en el core del agente:', error);
    return new Response(
      JSON.stringify({ error: 'Hubo un problema en el orquestador del agente.' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
