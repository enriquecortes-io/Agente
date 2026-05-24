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
    description: 'Búsqueda de propiedades. Extrae la urbanización, DEDUCE el municipio y extrae el presupuesto.',
    parameters: z.object({
      urbanizacion: z.string().describe('Urbanización o zona exacta (ej: "La Zagaleta", "Sotogrande")'),
      municipioDeducido: z.string().describe('DEDUCE TÚ MISMO el municipio al que pertenece en España (ej: si es Zagaleta pon "Benahavis", si es Sotogrande pon "San Roque", si es Sierra Blanca pon "Marbella")'),
      precioMaxString: z.string().describe('Presupuesto máximo como texto (ej: "7M", "7000000")')
    }),
    execute: async (args) => {
      let precioCalculado = 0;
      if (args.precioMaxString && args.precioMaxString !== 'undefined') {
        const strLimpio = args.precioMaxString.toLowerCase().replace(/euros|€/g, '').trim();
        if (strLimpio.includes('m') || strLimpio.includes('millon')) {
          const numero = parseFloat(strLimpio.replace(/[^\d.,]/g, '').replace(',', '.'));
          if (!isNaN(numero)) precioCalculado = numero * 1000000;
        } else {
          const numero = parseInt(strLimpio.replace(/\D/g, ''));
          if (!isNaN(numero)) precioCalculado = numero;
        }
      }

      console.log(`\n    🔌 [TOOL SUPABASE] ¡Harvis busca! -> Urba: "${args.urbanizacion}" | Municipio Deducido: "${args.municipioDeducido}" | Presupuesto: ${precioCalculado}€`);
      return await searchPropertiesInSupabase({ 
        urbanizacion: args.urbanizacion, 
        municipioDeducido: args.municipioDeducido, 
        precioMax: precioCalculado 
      });
    }
  }),
  crearCarpetaCliente: tool({
    description: 'Crea carpeta de Drive para clientes.',
    parameters: z.object({
      nombreCliente: z.string().describe('Nombre del cliente (ej: "Charles Vance")'),
      tipoInteraccion: z.string().describe('Documento requerido (ej: "NDA")')
    }),
    execute: async (args) => {
      console.log(`\n    🔌 [TOOL DRIVE] ¡Harvis organiza! -> Cliente: ${args.nombreCliente} | Interacción: ${args.tipoInteraccion}`);
      const resultado = await createClientFolder(args.nombreCliente, args.tipoInteraccion);
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
      system: SYSTEM_PROMPT + "\n\nREGLA: Extrae el nombre de la urbanización, usa tus conocimientos para deducir a qué municipio de España pertenece, y extrae el presupuesto.",
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
  await hablarConHarvis("I am looking for a villa in Sotogrande or La Zagaleta, budget around 6M to 7M euros.");
}

iniciarSimulador();
