import { generateText, tool, CoreMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { SYSTEM_PROMPT } from './agents/realEstateExecutive.js';
import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const tools = {
  buscarPropiedades: tool({
    description: 'Obligatorio para buscar propiedades. Extrae zonas y presupuestos.',
    // 🧠 EL HACK: Todo es TEXTO (String). Cero arrays, cero números. Así la IA no falla nunca.
    parameters: z.object({
      zonas_texto: z.string().describe('Urbanizaciones separadas por coma (ej: "Sotogrande, La Zagaleta")'),
      municipios_texto: z.string().describe('Municipios deducidos separados por coma (ej: "San Roque, Benahavis")'),
      presupuesto_texto: z.string().describe('Presupuesto en números como texto (ej: "7000000")')
    }),
    execute: async (args) => {
      // 1. Calculamos el precio
      let precioCalculado = 0;
      if (args.presupuesto_texto) {
        const strLimpio = args.presupuesto_texto.toLowerCase().replace(/euros|€/g, '').trim();
        if (strLimpio.includes('m') || strLimpio.includes('millon')) {
          const numero = parseFloat(strLimpio.replace(/[^\d.,]/g, '').replace(',', '.'));
          if (!isNaN(numero)) precioCalculado = numero * 1000000;
        } else {
          const numero = parseInt(strLimpio.replace(/\D/g, ''));
          if (!isNaN(numero)) precioCalculado = numero;
        }
      }

      console.log(`\n    🔌 [TOOL SUPABASE] ¡Harvis ha procesado los datos a la perfección!`);
      console.log(`    📍 Zonas extraídas:    ${args.zonas_texto}`);
      console.log(`    🗺️ Municipios (IA):    ${args.municipios_texto}`);
      console.log(`    💰 Presupuesto Max:    ${precioCalculado}€`);

      return await searchPropertiesInSupabase({ 
        urbanizacion: args.zonas_texto, 
        municipioDeducido: args.municipios_texto, 
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
      temperature: 0, // Literalmente cero creatividad.
      system: SYSTEM_PROMPT + "\n\nREGLA: Usa las herramientas. Extrae la info como texto plano.",
      messages: historialChat,
      tools: tools,
      toolChoice: 'required',
      maxSteps: 5
    });

    console.log(`\n🤖 AGENTE HARVIS:`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(response.text || "(Búsqueda ejecutada en segundo plano)");
    console.log(`─────────────────────────────────────────────────────────────────────────\n`);

  } catch (error: any) {
    console.error('❌ Error durante la simulación:', error.message || error);
  }
}

async function iniciarSimulador() {
  await hablarConHarvis("I am looking for a villa in Sotogrande or La Zagaleta, budget around 6M to 7M euros.");
}

iniciarSimulador();
