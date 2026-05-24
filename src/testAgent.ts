import { generateText, tool, CoreMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { SYSTEM_PROMPT } from './agents/realEstateExecutive.js';
import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const tools = {
  buscarPropiedades: tool({
    description: 'Obligatorio para buscar propiedades. Extrae la urbanización, deduce el municipio y extrae el presupuesto.',
    parameters: z.object({
      urbanizacion: z.string().describe('Urbanización o zona (ej: "Sotogrande")'),
      municipio: z.string().describe('Municipio deducido (ej: "San Roque", "Benahavis", "Marbella")'),
      presupuesto: z.string().describe('Presupuesto máximo como número en texto (ej: "7000000")')
    }),
    execute: async (args) => {
      // 🛡️ BARRERA ANTI-VAGOS: Si llega undefined, le devolvemos un error para que piense
      if (!args.urbanizacion || args.urbanizacion === 'undefined' || args.urbanizacion === '') {
        console.log(`    ⚠️ [SISTEMA] Harvis mandó datos vacíos. Forzando a la IA a reintentar...`);
        return { error: 'ERROR: No has rellenado los campos. Vuelve a leer el mensaje y extrae la urbanización, el municipio y el presupuesto.' };
      }

      let precioCalculado = 0;
      if (args.presupuesto && args.presupuesto !== 'undefined') {
        const strLimpio = args.presupuesto.toLowerCase().replace(/euros|€/g, '').trim();
        if (strLimpio.includes('m') || strLimpio.includes('millon')) {
          const numero = parseFloat(strLimpio.replace(/[^\d.,]/g, '').replace(',', '.'));
          if (!isNaN(numero)) precioCalculado = numero * 1000000;
        } else {
          const numero = parseInt(strLimpio.replace(/\D/g, ''));
          if (!isNaN(numero)) precioCalculado = numero;
        }
      }

      console.log(`\n    🔌 [TOOL SUPABASE] ¡Harvis busca! -> Urba: "${args.urbanizacion}" | Municipio Deducido: "${args.municipio}" | Presupuesto: ${precioCalculado}€`);
      return await searchPropertiesInSupabase({ 
        urbanizacion: args.urbanizacion, 
        municipioDeducido: args.municipio, 
        precioMax: precioCalculado 
      });
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
      system: SYSTEM_PROMPT + "\n\nREGLA ESTRICTA: Eres un extractor de datos. DEBES usar las herramientas y rellenar TODOS los campos con datos reales. Nunca envíes 'undefined'.",
      messages: historialChat,
      tools: tools,
      toolChoice: 'required', // 🔥 LA PISTOLA EN LA CABEZA QUE SE ME OLVIDÓ
      maxSteps: 5
    });

    console.log(`\n🤖 AGENTE HARVIS:`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(response.text || "(Búsqueda y deducción completadas)");
    console.log(`─────────────────────────────────────────────────────────────────────────\n`);

    if (response.messages) historialChat = response.messages;
    else historialChat.push({ role: 'assistant', content: response.text });

  } catch (error: any) {
    console.error('❌ Error durante la simulación:', error.message || error);
  }
}

async function iniciarSimulador() {
  await hablarConHarvis("I am looking for a villa in Sotogrande or La Zagaleta, budget around 6M to 7M euros.");
}

iniciarSimulador();
