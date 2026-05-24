import { generateText, tool, CoreMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const tools = {
  buscarPropiedades: tool({
    description: 'Busca propiedades en el sistema. REGLA: Tienes que rellenar los 3 parámetros obligatoriamente.',
    parameters: z.object({
      zonas: z.string().describe('Las urbanizaciones exactas que pide el cliente (ej: "Sotogrande, La Zagaleta")'),
      municipios: z.string().describe('Los municipios españoles a los que pertenecen esas zonas (ej: "San Roque, Benahavis")'),
      presupuesto: z.string().describe('El presupuesto máximo del cliente en formato numérico (ej: "7000000")')
    }),
    execute: async (args) => {
      let precioCalculado = 0;
      if (args.presupuesto) {
        const strLimpio = args.presupuesto.toLowerCase().replace(/euros|€/g, '').trim();
        if (strLimpio.includes('m') || strLimpio.includes('millon')) {
          const numero = parseFloat(strLimpio.replace(/[^\d.,]/g, '').replace(',', '.'));
          if (!isNaN(numero)) precioCalculado = numero * 1000000;
        } else {
          const numero = parseInt(strLimpio.replace(/\D/g, ''));
          if (!isNaN(numero)) precioCalculado = numero;
        }
      }

      console.log(`\n    🔌 [TOOL SUPABASE] ¡POR FIN HARVIS TRABAJA!`);
      console.log(`    📍 Zonas extraídas:    ${args.zonas}`);
      console.log(`    🗺️ Municipios (IA):    ${args.municipios}`);
      console.log(`    💰 Presupuesto Max:    ${precioCalculado}€`);

      return await searchPropertiesInSupabase({ 
        urbanizacion: args.zonas, 
        municipioDeducido: args.municipios, 
        precioMax: precioCalculado 
      });
    }
  })
};

let historialChat: CoreMessage[] = [];

// 🛑 ELIMINAMOS EL PROMPT ANTIGUO Y USAMOS UNO 100% TÉCNICO
const PROMPT_PURO = `
Eres un procesador de datos JSON. Tu ÚNICO trabajo es leer el mensaje del cliente, entender qué zonas pide, deducir en qué municipios de España están, y transformar su presupuesto a un número.
DEBES LLAMAR A LA HERRAMIENTA 'buscarPropiedades' CON TODOS LOS PARÁMETROS RELLENOS.
Nunca envíes un objeto vacío.
`;

async function hablarConHarvis(mensajeCliente: string) {
  console.log(`\n╔═════════════════════════════════════════════════════════════════════════`);
  console.log(`║ 👤 CLIENTE: "${mensajeCliente}"`);
  console.log(`╚═════════════════════════════════════════════════════════════════════════`);

  historialChat.push({ role: 'user', content: mensajeCliente });

  try {
    const response = await generateText({
      model: google('gemini-2.5-flash'),
      temperature: 0, // 0 absoluto
      system: PROMPT_PURO,
      messages: historialChat,
      tools: tools,
      toolChoice: 'required', // Obligatorio sí o sí
      maxSteps: 5
    });

    console.log(`\n🤖 AGENTE HARVIS:`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(response.text || "(Herramienta ejecutada)");
    console.log(`─────────────────────────────────────────────────────────────────────────\n`);

  } catch (error: any) {
    console.error('❌ Error durante la simulación:', error.message || error);
  }
}

async function iniciarSimulador() {
  await hablarConHarvis("I am looking for a villa in Sotogrande or La Zagaleta, budget around 6M to 7M euros.");
}

iniciarSimulador();
