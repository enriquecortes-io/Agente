import { generateText, tool, CoreMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const tools = {
  buscarPropiedades: tool({
    // EL TRUCO ESTÁ AQUÍ: Mencionar las variables exactas en la descripción
    description: 'MANDATORY TOOL to search for properties. YOU MUST extract and provide the following JSON keys: "zonas", "municipios", and "presupuesto". Do not leave them empty.',
    parameters: z.object({
      zonas: z.string().describe('The exact locations requested by the user. Example: "Sotogrande, La Zagaleta"'),
      municipios: z.string().describe('The Spanish municipalities for those locations. Example: "San Roque, Benahavis"'),
      presupuesto: z.string().describe('The maximum budget converted to a pure number string. Example: "7000000"')
    }).required(), // <-- Forzamos a Zod a que exija los campos en el esquema duro
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

      console.log(`\n    🔌 [TOOL SUPABASE] ¡HARVIS HA RELLENADO EL JSON!`);
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

async function hablarConHarvis(mensajeCliente: string) {
  console.log(`\n╔═════════════════════════════════════════════════════════════════════════`);
  console.log(`║ 👤 CLIENTE: "${mensajeCliente}"`);
  console.log(`╚═════════════════════════════════════════════════════════════════════════`);

  historialChat.push({ role: 'user', content: mensajeCliente });

  try {
    const response = await generateText({
      model: google('gemini-2.5-flash'),
      temperature: 0,
      system: "You are a data extraction bot. You must use the buscarPropiedades tool and fill in 'zonas', 'municipios', and 'presupuesto' perfectly.",
      messages: historialChat,
      tools: tools,
      toolChoice: 'required',
      maxSteps: 5
    });

    console.log(`\n🤖 AGENTE HARVIS:`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(response.text || "(Herramienta ejecutada con éxito)");
    console.log(`─────────────────────────────────────────────────────────────────────────\n`);

  } catch (error: any) {
    console.error('❌ Error durante la simulación:', error.message || error);
  }
}

async function iniciarSimulador() {
  await hablarConHarvis("I am looking for a villa in Sotogrande or La Zagaleta, budget around 6M to 7M euros.");
}

iniciarSimulador();
