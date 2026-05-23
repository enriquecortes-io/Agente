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
    // Con .min(2) y .positive() hacemos que el SDK rechace la ejecución si envía undefined
    parameters: z.object({
      zona: z.string().min(2, "Debes extraer la zona").describe('La zona (ej: La Zagaleta)'),
      precioMax: z.number().positive("Debe haber un precio").describe('Presupuesto máximo')
    }),
    execute: async (args) => {
      console.log(`\n    🔌 [TOOL SUPABASE] ¡Harvis busca! ->`, args);
      return await searchPropertiesInSupabase(args);
    }
  }),
  crearCarpetaCliente: tool({
    description: 'CREACIÓN OBLIGATORIA DE CARPETA: Úsala cuando el cliente dé su nombre.',
    parameters: z.object({
      nombreCliente: z.string().min(2, "Falta el nombre").describe('Nombre del cliente extraído (ej: Charles Vance)'),
      tipoInteraccion: z.string().min(2, "Falta el tipo").describe('Tipo (ej: NDA y Prueba de Fondos)')
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
      model: google('gemini-1.5-flash'),
      system: SYSTEM_PROMPT + "\n\nREGLA: NUNCA envíes parámetros vacíos a las herramientas. Extrae la info.",
      messages: historialChat,
      tools: tools,
      maxSteps: 5
    });

    console.log(`\n🤖 AGENTE HARVIS:`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(response.text || "(Harvis ejecutó la tarea en segundo plano sin decir nada)");
    console.log(`─────────────────────────────────────────────────────────────────────────\n`);

    if (response.messages) {
       historialChat = response.messages;
    } else {
       historialChat.push({ role: 'assistant', content: response.text });
    }

  } catch (error: any) {
    console.error('❌ Error durante la simulación:', error.message || error);
  }
}

// Función para pausar el código y no saturar la API
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function iniciarSimulador() {
  await hablarConHarvis("Hi there! I'm an investor looking for a modern, very private villa in La Zagaleta or Sierra Blanca. Budget is around 6M to 7M euros. What do you have?");
  
  console.log("\n⏳ [SISTEMA] Pausa de 15 segundos para enfriar los servidores de Google API...");
  await delay(15000);
  
  await hablarConHarvis("Perfect, that property looks stunning. Please prepare the non-disclosure agreement (NDA) so I can review the off-market pictures. My name is Charles Vance and my WhatsApp is +44 7123 456789. Send me the link to upload my proof of funds too.");
}

iniciarSimulador();
