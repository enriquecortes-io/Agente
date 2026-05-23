import { generateText, tool, CoreMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { SYSTEM_PROMPT } from './agents/realEstateExecutive.js';
import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import { createClientFolder } from './tools/googleDriveTools.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const tools = {
  buscarPropiedades: tool({
    description: 'BÚSQUEDA OBLIGATORIA: Usa esta herramienta SIEMPRE que el cliente pregunte por propiedades, presupuesto o zonas.',
    parameters: z.object({
      zona: z.string().optional().describe('Zona extraída (ej: La Zagaleta)'),
      precioMax: z.number().optional().describe('Presupuesto máximo (ej: 7000000)')
    }),
    execute: async (args) => {
      // Trampa anti-vagos
      if (!args.zona && !args.precioMax) {
        return { error: "ERROR INTERNO: Harvis, no has extraído ni la zona ni el precio. Vuelve a leer el mensaje del cliente y usa la herramienta correctamente." };
      }
      console.log(`\n    🔌 [TOOL SUPABASE] Datos extraídos por Harvis:`, args);
      return await searchPropertiesInSupabase(args);
    }
  }),
  crearCarpetaCliente: tool({
    description: 'CREACIÓN DE CARPETA: Úsala cuando el cliente envíe su nombre o pida firmar un NDA/KYC.',
    parameters: z.object({
      nombreCliente: z.string().optional().describe('Nombre del cliente (ej: Charles Vance)'),
      tipoInteraccion: z.string().optional().describe('Tipo (ej: NDA, Off-Market)')
    }),
    execute: async (args) => {
      // Trampa anti-vagos
      if (!args.nombreCliente || args.nombreCliente === 'undefined') {
        return { error: "ERROR INTERNO: Harvis, es IMPRESCINDIBLE que extraigas el nombre del cliente del texto (ej: Charles Vance) para crear la carpeta. ¡Inténtalo de nuevo!" };
      }
      
      const interaccion = args.tipoInteraccion || 'General';
      console.log(`\n    🔌 [TOOL DRIVE] Harvis organizando -> Cliente: ${args.nombreCliente} | Interacción: ${interaccion}`);
      const resultado = await createClientFolder(args.nombreCliente, interaccion);
      console.log(`    ✅ [TOOL DRIVE] Respuesta de Google:`, resultado.message || resultado.error);
      return resultado;
    }
  })
};

let historialChat: CoreMessage[] = [];

async function hablarConHarvis(mensajeCliente: string) {
  console.log(`\n╔═════════════════════════════════════════════════════════════════════════`);
  console.log(`║ 👤 CLIENTE: "${mensajeCliente}"`);
  console.log(`╚═════════════════════════════════════════════════════════════════════════`);

  historialChat.push({ role: 'user', content: mensajeCliente });

  try {
    const response = await generateText({
      model: google('gemini-2.5-flash'),
      system: SYSTEM_PROMPT + "\n\nINSTRUCCIÓN CRÍTICA: SIEMPRE debes intentar extraer la información del cliente para usar las herramientas. Si usas una herramienta, EXPLÍCALE al cliente el resultado después.",
      messages: historialChat,
      tools: tools,
      maxSteps: 5 // Esto le da a Harvis hasta 5 intentos internos si cae en nuestra trampa
    });

    console.log(`\n🤖 AGENTE HARVIS:`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(response.text || "(Respuesta vacía)");
    console.log(`─────────────────────────────────────────────────────────────────────────\n`);

    if (response.messages) {
       historialChat = response.messages;
    } else {
       historialChat.push({ role: 'assistant', content: response.text });
    }

  } catch (error) {
    console.error('❌ Error durante la simulación:', error);
  }
}

async function iniciarSimulador() {
  await hablarConHarvis("Hi there! I'm an investor looking for a modern, very private villa in La Zagaleta or Sierra Blanca. Budget is around 6M to 7M euros. What do you have?");
  await hablarConHarvis("Perfect, that property looks stunning. Please prepare the non-disclosure agreement (NDA) so I can review the off-market pictures. My name is Charles Vance and my WhatsApp is +44 7123 456789. Send me the link to upload my proof of funds too.");
}

iniciarSimulador();
