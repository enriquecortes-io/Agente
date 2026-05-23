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
    description: 'Busca propiedades en Supabase. Úsala cuando el cliente pregunte por villas, precios o zonas.',
    parameters: z.object({
      zona: z.string().describe('Zona o ciudad (ej: La Zagaleta, Sierra Blanca)'),
      precioMax: z.number().describe('Presupuesto máximo en euros (ej: 7000000)')
    }),
    execute: async (args) => {
      console.log(`\n    🔌 [TOOL SUPABASE] Harvis extrajo -> Zona: ${args.zona}, Presupuesto: ${args.precioMax}€`);
      return await searchPropertiesInSupabase(args);
    }
  }),
  crearCarpetaCliente: tool({
    description: 'Crea una carpeta segura en Google Drive para el NDA o KYC del cliente.',
    parameters: z.object({
      nombreCliente: z.string().describe('Nombre del cliente para nombrar la carpeta (ej: Charles Vance)')
    }),
    execute: async (args) => {
      console.log(`\n    🔌 [TOOL DRIVE] Harvis extrajo -> Cliente: ${args.nombreCliente}`);
      const resultado = await createClientFolder(args.nombreCliente || 'Cliente Sin Nombre');
      console.log(`    ✅ [TOOL DRIVE] Confirmación de Google:`, resultado.message);
      return resultado;
    }
  })
};

// Historial de la conversación
const historialChat: CoreMessage[] = [];

async function hablarConHarvis(mensajeCliente: string) {
  console.log(`\n╔═════════════════════════════════════════════════════════════════════════`);
  console.log(`║ 👤 CLIENTE: "${mensajeCliente}"`);
  console.log(`╚═════════════════════════════════════════════════════════════════════════`);

  // Añadimos el mensaje del usuario al historial
  historialChat.push({ role: 'user', content: mensajeCliente });

  try {
    const response = await generateText({
      model: google('gemini-2.5-flash'),
      system: SYSTEM_PROMPT,
      messages: historialChat, // Le pasamos todo el contexto
      tools: tools,
      maxSteps: 5
    });

    console.log(`\n🤖 AGENTE HARVIS:`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(response.text);
    console.log(`─────────────────────────────────────────────────────────────────────────\n`);

    // Añadimos la respuesta de Harvis al historial
    historialChat.push({ role: 'assistant', content: response.text });

  } catch (error) {
    console.error('❌ Error durante la simulación:', error);
  }
}

async function iniciarSimulador() {
  await hablarConHarvis("Hi there! I'm an investor looking for a modern, very private villa in La Zagaleta or Sierra Blanca. Budget is around 6M to 7M euros. What do you have?");
  await hablarConHarvis("Perfect, that property looks stunning. Please prepare the non-disclosure agreement (NDA) so I can review the off-market pictures. My name is Charles Vance and my WhatsApp is +44 7123 456789. Send me the link to upload my proof of funds too.");
}

iniciarSimulador();
