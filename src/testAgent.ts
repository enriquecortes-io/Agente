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
    description: 'BÚSQUEDA OBLIGATORIA: Usa esta herramienta SIEMPRE para buscar propiedades si el cliente menciona zonas o presupuestos.',
    parameters: z.object({
      zona: z.string().describe('La zona obligatoria extraída (ej: La Zagaleta)'),
      precioMax: z.number().describe('Presupuesto máximo en euros (ej: 7000000)')
    }),
    execute: async (args) => {
      console.log(`\n    🔌 [TOOL SUPABASE] ¡Harvis ha disparado la búsqueda! ->`, args);
      return await searchPropertiesInSupabase(args);
    }
  }),
  crearCarpetaCliente: tool({
    description: 'CREACIÓN OBLIGATORIA DE CARPETA: Úsala inmediatamente cuando el cliente dé su nombre o pida un NDA.',
    parameters: z.object({
      nombreCliente: z.string().describe('Nombre del cliente extraído (ej: Charles Vance)'),
      tipoInteraccion: z.string().describe('Tipo (ej: NDA y Prueba de Fondos)')
    }),
    execute: async (args) => {
      console.log(`\n    🔌 [TOOL DRIVE] ¡Harvis está organizando Drive! -> Cliente: ${args.nombreCliente} | Interacción: ${args.tipoInteraccion}`);
      const resultado = await createClientFolder(args.nombreCliente, args.tipoInteraccion);
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
      model: google('gemini-1.5-pro'),
      system: SYSTEM_PROMPT + "\n\nREGLA SUPREMA: Es OBLIGATORIO que uses las herramientas disponibles si el mensaje del cliente coincide con su descripción. NO te limites a responder con texto sin ejecutar la herramienta primero.",
      messages: historialChat,
      tools: tools,
      maxSteps: 5 // Permite que ejecute la herramienta y luego responda en el mismo paso
    });

    console.log(`\n🤖 AGENTE HARVIS:`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(response.text || "(Harvis ejecutó la tarea en segundo plano)");
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
