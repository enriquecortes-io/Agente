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
    description: 'Busca propiedades. Usa esta herramienta para encontrar villas en la base de datos.',
    // AL QUITAR EL .optional(), GOOGLE GEMINI SABE QUE ES ESTRICTAMENTE OBLIGATORIO
    parameters: z.object({
      zona: z.string().describe('Ubicación exacta extraída del mensaje (ej: La Zagaleta)'),
      precioMax: z.number().describe('Presupuesto máximo en euros extraído del mensaje (ej: 7000000)')
    }),
    execute: async (args) => {
      console.log(`\n    🔌 [TOOL SUPABASE] ¡Harvis busca! -> Zona: ${args.zona}, Precio: ${args.precioMax}€`);
      return await searchPropertiesInSupabase(args);
    }
  }),
  crearCarpetaCliente: tool({
    description: 'Crea una carpeta segura en Drive. Úsala para NDA o Proof of Funds.',
    parameters: z.object({
      nombreCliente: z.string().describe('Nombre completo del cliente extraído del mensaje (ej: Charles Vance)'),
      tipoInteraccion: z.string().describe('Tipo de documento (ej: NDA y Proof of Funds)')
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

async function hablarConHarvis(mensajeCliente: string) {
  console.log(`\n╔═════════════════════════════════════════════════════════════════════════`);
  console.log(`║ 👤 CLIENTE: "${mensajeCliente}"`);
  console.log(`╚═════════════════════════════════════════════════════════════════════════`);

  historialChat.push({ role: 'user', content: mensajeCliente });

  try {
    const response = await generateText({
      model: google('gemini-2.5-flash'),
      temperature: 0.1, // MAGIA PURA: Le quitamos la creatividad para que sea un extractor perfecto
      system: SYSTEM_PROMPT + "\n\nINSTRUCCIÓN CRÍTICA: Eres una máquina de extracción de datos. Cuando llames a una herramienta, es OBLIGATORIO extraer los parámetros exactos del mensaje del usuario y rellenarlos.",
      messages: historialChat,
      tools: tools,
      maxSteps: 5
    });

    console.log(`\n🤖 AGENTE HARVIS:`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(response.text || "(Acción ejecutada en segundo plano)");
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
  await delay(5000); // Pausa corta para evitar saturar tu API key
  await hablarConHarvis("Perfect, that property looks stunning. Please prepare the non-disclosure agreement (NDA) so I can review the off-market pictures. My name is Charles Vance and my WhatsApp is +44 7123 456789. Send me the link to upload my proof of funds too.");
}

iniciarSimulador();
