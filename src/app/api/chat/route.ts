import { openai } from '@ai-sdk/openai';
import { streamText, convertToCoreMessages } from 'ai';
import { SYSTEM_PROMPT } from '../../../agents/realEstateExecutive';
import { searchPropertiesInSupabase } from '../../../tools/supabaseTools';

// Forzamos que la ruta se ejecute en el entorno de Node/Edge dinámicamente
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    // Iniciamos el flujo de streaming con la IA
    const result = await streamText({
      model: openai('gpt-4o'), // O el modelo de OpenAI/Gemini que prefieras
      system: SYSTEM_PROMPT,
      messages: convertToCoreMessages(messages),
      // Declaramos las "Tools" (herramientas) que el agente puede usar de forma autónoma
      tools: {
        buscarPropiedades: {
          description: 'Consulta el inventario en Supabase filtrando por zona, presupuesto máximo y estilo arquitectónico.',
          parameters: {
            type: 'object',
            properties: {
              zona: { 
                type: 'string', 
                description: 'La zona de Marbella (ej: Nueva Andalucía, La Zagaleta, Sierra Blanca, Elviria)' 
              },
              precioMax: { 
                type: 'number', 
                description: 'Presupuesto máximo del inversor en euros.' 
              },
              estilo: { 
                type: 'string', 
                description: 'Estilo o etiqueta de lifestyle (ej: minimalista, vistas al mar, privacidad, clásica)' 
              }
            }
          },
          // La función real que configuramos en el paso anterior
          execute: async ({ zona, precioMax, estilo }) => {
            console.log(`[Agente] Ejecutando búsqueda: Zona: ${zona}, Precio Máx: ${precioMax}, Estilo: ${estilo}`);
            const propiedades = await searchPropertiesInSupabase({ zona, precioMax, estilo });
            return propiedades;
          }
        }
      }
    });

    // Devolvemos la respuesta en streaming para que la interfaz la pinte en tiempo real
    return result.toDataStreamResponse();

  } catch (error) {
    console.error('Error crítico en el endpoint de IA:', error);
    return new Response(
      JSON.stringify({ error: 'Hubo un problema al procesar tu solicitud.' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
