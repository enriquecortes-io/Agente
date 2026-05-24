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
    description: 'Búsqueda de propiedades. Extrae la zona y el presupuesto máximo.',
    parameters: z.object({
      zona: z.string().describe('Ubicación exacta (ej: "La Zagaleta", "Sierra Blanca")'),
      // Pedimos STRING para que la IA no se cuelgue procesando JSON numéricos
      precioMaxString: z.string().describe('El presupuesto máximo tal cual lo dice el cliente (ej: "7M", "7 millones", "7000000")')
    }),
    execute: async (args) => {
      // 🧠 CEREBRO FINANCIERO: Convertir "7M" o "7 millones" en 7000000
      let precioCalculado = 0;
      if (args.precioMaxString) {
        const strLimpio = args.precioMaxString.toLowerCase().replace(/euros|€/g, '').trim();
        
        if (strLimpio.includes('m') || strLimpio.includes('millon')) {
          // Extrae solo el dígito (ej: "7") y lo multiplica
          const numero = parseFloat(strLimpio.replace(/[^\d.,]/g, '').replace(',', '.'));
          if (!isNaN(numero)) precioCalculado = numero * 1000000;
        } else {
          // Si ya viene como 7000000
          const numero = parseInt(strLimpio.replace(/\D/g, ''));
          if (!isNaN(numero)) precioCalculado = numero;
        }
      }

      console.log(`\n    🔌 [TOOL SUPABASE] ¡Harvis busca! -> Zona IA: "${args.zona}" | Presupuesto Traducido: ${precioCalculado}€`);
      return await searchPropertiesInSupabase({ zona: args.zona, precioMax: precioCalculado });
    }
  }),
  crearCarpetaCliente: tool({
    description: 'Crea carpeta de Drive para clientes nuevos.',
    parameters: z.object({
      nombreCliente: z.string().describe('Nombre del cliente (ej: "Charles Vance")'),
      tipoInteraccion: z.string().describe('Documento requerido (ej: "NDA")')
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
      temperature: 0.1,
      // Instrucción brutalmente clara
      system: SYSTEM_PROMPT + "\n\nREGLA ESTRICTA: Cuando el cliente diga su presupuesto (ej. '6M to 7M'), debes extraer el valor MÁS ALTO (ej. '7M') y enviarlo en el campo precioMaxString. Extrae siempre la zona.",
      messages: historialChat,
      tools: tools,
      maxSteps: 5
    });

    console.log(`\n🤖 AGENTE HARVIS:`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(response.text || "(Procesado correctamente)");
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
