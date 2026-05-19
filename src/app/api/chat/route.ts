import { openai } from '@ai-sdk/openai';
import { streamText, convertToCoreMessages } from 'ai';
import { SYSTEM_PROMPT } from '../../../agents/realEstateExecutive.js';
import { searchPropertiesInSupabase } from '../../../tools/supabaseTools.js';
import { createClientFolder } from '../../../tools/googleDriveTools.js';

// Forzamos la ejecución dinámica en el servidor
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    // Arrancamos el stream de texto con GPT-4o o tu modelo preferido
    const result = await streamText({
      model: openai('gpt-4o'),
      system: SYSTEM_PROMPT,
      messages: convertToCoreMessages(messages),
      // Inyectamos el arsenal de herramientas (Tools) que el agente puede usar de forma autónoma
      tools: {
        buscarPropiedades: {
          description: 'Consulta el inventario de propiedades disponibles en Supabase filtrando por ubicación, presupuesto máximo y estilo de vida.',
          parameters: {
            type: 'object',
            properties: {
              zona: { 
                type: 'string', 
                description: 'La ubicación en Marbella (ej: La Zagaleta, Sierra Blanca, Nueva Andalucía, Elviria).' 
              },
              precioMax: { 
                type: 'number', 
                description: 'Presupuesto máximo del inversor en euros.' 
              },
              estilo: { 
                type: 'string', 
                description: 'Estilo arquitectónico o tags de ambiente (ej: minimalista, vistas al mar, privacidad, clásica).' 
              }
            }
          },
          execute: async ({ zona, precioMax, estilo }) => {
            console.log(`[Agente Core] Ejecutando búsqueda en Supabase -> Zona: ${zona}, Precio Máx: ${precioMax}, Estilo: ${estilo}`);
            return await searchPropertiesInSupabase({ zona, precioMax, estilo });
          }
        },
        crearCarpetaCliente: {
          description: 'Crea una carpeta de seguridad en Google Drive para almacenar de forma confidencial el KYC, pasaporte o firmas de NDA de un inversor cualificado.',
          parameters: {
            type: 'object',
            properties: {
              nombreCliente: { 
                type: 'string', 
                description: 'Nombre completo del cliente o razón social del fondo inversor.' 
              }
            },
            required: ['nombreCliente']
          },
          execute: async ({ nombreCliente }) => {
            console.log(`[Agente Core] Solicitando espacio seguro en Drive para: ${nombreCliente}`);
            return await createClientFolder(nombreCliente);
          }
        }
      }
    });

    // Retornamos el stream compatible con tu frontend o middleware de WhatsApp
    return result.toDataStreamResponse();

  } catch (error) {
    console.error('Error crítico en el core del agente:', error);
    return new Response(
      JSON.stringify({ error: 'Hubo un problema al procesar la solicitud en el core del agente.' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
