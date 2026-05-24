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
    description: 'OBLIGATORIO: Usa esto para buscar casas en la base de datos.',
    parameters: z.object({
      zona: z.string().describe('El nombre de la ciudad o zona (Ejemplo: "La Zagaleta" o "Sierra Blanca")'),
      precioMax: z.number().describe('Presupuesto máximo en número (Ejemplo: 7000000)')
    }),
    execute: async (args) => {
      console.log(`\n    🔌 [TOOL SUPABASE] ¡Harvis busca! -> Zona: ${args.zona}, Precio: ${args.precioMax}€`);
      return await searchPropertiesInSupabase(args);
    }
  }),
  crearCarpetaCliente: tool({
    description: 'OBLIGATORIO: Usa esto para crear carpetas en Google Drive cuando el cliente da su nombre.',
    parameters: z.object({
      nombreCliente: z.string().describe('El nombre y apellido del cliente (Ejemplo: "Charles Vance")'),
      tipoInteraccion: z.string().describe('El motivo de la carpeta (Ejemplo: "NDA" o "Prueba de Fondos")')
    }),
    execute: async (args) => {
      console.log(`\n    🔌 [TOOL DRIVE] ¡Harvis organiza! -> Cliente: ${args.nombreCliente} | Interacción: ${args.tipoInteraccion}`);
      const resultado = await createClientFolder(args.nombreCliente, args.tipoInteraccion);
      console.log(`    ✅ [TOOL DRIVE] Google dice:`, resultado.message || resultado.error);
      return resultado;
    }
  })
};

let historialChat: CoreMessage[] = [];

// Aquí le hacemos el lavado de cerebro a Harvis
const INSTRUCCIONES_ESTRICTAS = `
ERES UN AGENTE EJECUTOR. ESTÁS OBLIGADO A USAR LAS HERRAMIENTAS.
REGLAS INQUEBRANTABLES:
1. Si el cliente busca propiedades, MENCIONA zonas (como Zagaleta) o presupuesto, DEBES usar la herramienta "buscarPropiedades". 
   - No digas que no puedes buscar. Tienes la herramienta, ¡ÚSALA!
   - Extrae la zona como texto y el precioMax como número.
2. Si el cliente te da su nombre (ej. "Charles Vance") y pide un NDA, DEBES usar "crearCarpetaCliente".
   - Extrae exactamente el nombre del texto.
NUNCA envíes valores vacíos o undefined. Lee atentamente el mensaje del cliente y extrae los datos.
`;

async function hablarConHarvis(mensajeCliente: string) {
  console.log(`\n╔═════════════════════════════════════════════════════════════════════════`);
  console.log(`║ 👤 CLIENTE: "${mensajeCliente}"`);
  console.log(`╚═════════════════════════════════════════════════════════════════════════`);

  historialChat.push({ role: 'user', content: mensajeCliente });

  try {
    const response = await generateText({
      model: google('gemini-2.5-flash'),
      temperature: 0, // 0 absoluto: Cero creatividad, 100% obediencia
      system: SYSTEM_PROMPT + "\n\n" + INSTRUCCIONES_ESTRICTAS,
      messages: historialChat,
      tools: tools,
      maxSteps: 5
    });

    console.log(`\n🤖 AGENTE HARVIS:`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(response.text || "(Herramienta ejecutada silenciosamente)");
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
