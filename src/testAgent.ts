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
    description: 'Busca propiedades. DEBES extraer obligatoriamente zona y precio.',
    parameters: z.object({
      zona: z.string().optional().describe('Zona extraída del cliente (ej: La Zagaleta)'),
      precioMax: z.number().optional().describe('Presupuesto máximo en euros (ej: 7000000)')
    }),
    execute: async (args) => {
      // TRAMPA ANTI-VAGOS: Si la IA manda undefined, le devolvemos un error para que reintente
      if (!args.zona || !args.precioMax) {
        console.log(`    ⚠️ [SISTEMA] Harvis intentó mandar undefined. Forzando corrección...`);
        return { error: "ERROR INTERNO: No has extraído la 'zona' o el 'precioMax'. Vuelve a leer el mensaje del cliente, extrae esos datos obligatoriamente y ejecuta la herramienta de nuevo." };
      }
      console.log(`\n    🔌 [TOOL SUPABASE] ¡Harvis busca! -> Zona: ${args.zona}, Precio: ${args.precioMax}€`);
      return await searchPropertiesInSupabase(args);
    }
  }),
  crearCarpetaCliente: tool({
    description: 'Crea carpeta en Drive. DEBES extraer obligatoriamente el nombre del cliente.',
    parameters: z.object({
      nombreCliente: z.string().optional().describe('Nombre del cliente (ej: Charles Vance)'),
      tipoInteraccion: z.string().optional().describe('Clasificación (ej: NDA)')
    }),
    execute: async (args) => {
      // TRAMPA ANTI-VAGOS
      if (!args.nombreCliente || args.nombreCliente === 'undefined') {
        console.log(`    ⚠️ [SISTEMA] Harvis intentó mandar undefined. Forzando corrección...`);
        return { error: "ERROR INTERNO: Necesito el 'nombreCliente'. Extrae el nombre del mensaje (ej: Charles Vance) y vuelve a ejecutar la herramienta." };
      }
      
      const tipo = args.tipoInteraccion || 'General';
      console.log(`\n    🔌 [TOOL DRIVE] ¡Harvis organiza! -> Cliente: ${args.nombreCliente} | Interacción: ${tipo}`);
      const resultado = await createClientFolder(args.nombreCliente, tipo);
      console.log(`    ✅ [TOOL DRIVE] Google dice:`, resultado.message || resultado.error);
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
      system: SYSTEM_PROMPT + "\n\nREGLA: NUNCA ejecutes herramientas con parámetros vacíos. Analiza bien el texto.",
      messages: historialChat,
      tools: tools,
      toolChoice: 'auto',
      maxSteps: 5 // vital para que pueda corregirse si cae en la trampa
    });

    console.log(`\n🤖 AGENTE HARVIS:`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(response.text || "(Proceso completado)");
    console.log(`─────────────────────────────────────────────────────────────────────────\n`);

    if (response.messages) historialChat = response.messages;
    else historialChat.push({ role: 'assistant', content: response.text });

  } catch (error: any) {
    console.error('❌ Error durante la simulación:', error.message || error);
  }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function iniciarSimulador() {
  await hablarConHarvis("Hi there! I'm an investor looking for a modern, very private villa in La Zagaleta or Sierra Blanca. Budget is around 6M to 7M euros. What do you have?");
  await delay(5000);
  await hablarConHarvis("Perfect, that property looks stunning. Please prepare the non-disclosure agreement (NDA) so I can review the off-market pictures. My name is Charles Vance and my WhatsApp is +44 7123 456789. Send me the link to upload my proof of funds too.");
}

iniciarSimulador();
