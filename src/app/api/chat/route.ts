import { google } from '@ai-sdk/google';
import { streamText, convertToCoreMessages } from 'ai';
import { z } from 'zod';
import { SYSTEM_PROMPT } from '../../../agents/realEstateExecutive.js';
import { searchPropertiesInSupabase } from '../../../tools/supabaseTools.js';
import { prepararEntornoCliente, actualizarHistorial } from '../../../tools/driveLogger.js';
import { sendCrmLeadNotification, triggerCmsPropertyPublish } from '../../../tools/webhookTools.js';

export const dynamic = 'force-dynamic';

function isAuthorized(req: Request): boolean {
  const secret = process.env.AGENT_API_SECRET;
  if (!secret) return true;
  return req.headers.get('x-agent-key') === secret;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'No autorizado.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let messages: unknown;
  try {
    ({ messages } = await req.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Body inválido.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const requestId = crypto.randomUUID().slice(0, 8);

  try {
    const result = await streamText({
      model: google('gemini-2.5-flash'),
      system: SYSTEM_PROMPT,
      messages: convertToCoreMessages(messages as any),
      maxSteps: 5,
      tools: {

        // ── TOOL: Registrar cliente y clasificar lead ─────────────────────────
        // Harvis llama a esta tool en cuanto conoce el nombre del cliente
        // y ha detectado el tipo de gestión (Venta, Captacion, Gestion)
        registrarCliente: {
          description: `Registra al cliente en Google Drive creando su carpeta y doc de historial.
Llama a esta tool en cuanto sepas el nombre del cliente y el tipo de gestión:
- Venta: el cliente quiere comprar una propiedad
- Captacion: el cliente quiere vender o valorar su propiedad
- Gestion: cualquier otro asunto administrativo
La carpeta y el doc son únicos por cliente — si ya existen los reutiliza.`,
          parameters: z.object({
            nombreCliente: z.string().describe('Nombre completo del cliente tal como se ha presentado.'),
            tipoLead: z.enum(['Venta', 'Captacion', 'Gestion']).describe('Tipo de gestión detectado.'),
          }),
          execute: async ({ nombreCliente, tipoLead }) => {
            console.log(`[${requestId}] registrarCliente → ${nombreCliente} (${tipoLead})`);
            try {
              const entorno = await prepararEntornoCliente(nombreCliente, tipoLead);
              return { success: true, ...entorno, mensaje: `Entorno de ${nombreCliente} listo en Drive.` };
            } catch (e: any) {
              return { success: false, error: e.message };
            }
          },
        },

        // ── TOOL: Guardar turno de conversación ───────────────────────────────
        guardarConversacion: {
          description: `Guarda un turno de conversación en el historial del cliente en Drive.
Llama a esta tool después de cada respuesta relevante para mantener el historial actualizado.
Requiere el docId obtenido previamente con registrarCliente.`,
          parameters: z.object({
            docId: z.string().describe('ID del documento de historial obtenido al registrar el cliente.'),
            mensajeUsuario: z.string().describe('Mensaje exacto del cliente en este turno.'),
            respuestaAgente: z.string().describe('Resumen de tu respuesta en este turno.'),
          }),
          execute: async ({ docId, mensajeUsuario, respuestaAgente }) => {
            console.log(`[${requestId}] guardarConversacion → docId: ${docId}`);
            try {
              await actualizarHistorial(docId, mensajeUsuario, respuestaAgente);
              return { success: true, mensaje: 'Turno guardado en historial.' };
            } catch (e: any) {
              return { success: false, error: e.message };
            }
          },
        },

        // ── TOOL: Buscar Propiedades ──────────────────────────────────────────
        buscarPropiedades: {
          description: 'Consulta el inventario disponible en Supabase filtrando por ubicación y presupuesto.',
          parameters: z.object({
            zona: z.string().optional().describe('Zona en Marbella (ej: La Zagaleta, Sierra Blanca).'),
            precioMax: z.number().optional().describe('Presupuesto máximo en euros.'),
            estilo: z.string().optional().describe('Estilo arquitectónico o lifestyle.'),
          }),
          execute: async ({ zona, precioMax }) => {
            console.log(`[${requestId}] buscarPropiedades → zona: ${zona}, precioMax: ${precioMax}`);
            return await searchPropertiesInSupabase({
              urbanizacion: zona,
              municipioDeducido: zona,
              precioMax,
            });
          },
        },

        // ── TOOL: Notificar Lead CRM ──────────────────────────────────────────
        notificarLeadCRM: {
          description: 'Envía el perfil del inversor cualificado al CRM corporativo.',
          parameters: z.object({
            nombre: z.string(),
            contacto: z.string(),
            presupuesto: z.number().optional(),
            estiloBuscado: z.string().optional(),
            notasCualificacion: z.string(),
          }),
          execute: async (leadData) => {
            console.log(`[${requestId}] notificarLeadCRM → ${leadData.nombre}`);
            return await sendCrmLeadNotification(leadData);
          },
        },

        // ── TOOL: Publicar Propiedad CMS ──────────────────────────────────────
        publicarPropiedadCMS: {
          description: 'Publica el copywriting de una propiedad en el CMS de la web.',
          parameters: z.object({
            titulo: z.string(),
            ubicacion: z.string(),
            precio: z.number(),
            copywritingEmocional: z.string(),
            tagsLifestyle: z.array(z.string()).optional(),
          }),
          execute: async (propertyData) => {
            console.log(`[${requestId}] publicarPropiedadCMS → ${propertyData.titulo}`);
            return await triggerCmsPropertyPublish({
              ...propertyData,
              tagsLifestyle: propertyData.tagsLifestyle ?? [],
            });
          },
        },
      },
    });

    return result.toDataStreamResponse();

  } catch (error) {
    console.error(`[${requestId}] Error crítico:`, error);
    return new Response(
      JSON.stringify({ error: 'Error en el orquestador del agente.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
