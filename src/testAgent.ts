import { generateText, tool, CoreMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { SYSTEM_PROMPT } from './agents/realEstateExecutive.js';
import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const tools = {
  buscarPropiedades: tool({
    description: 'Obligatorio para buscar propiedades. Extrae TODAS las zonas, deduce los municipios y el presupuesto.',
    // 🚀 EL FIX: Usamos z.array(z.string()) para que soporte múltiples zonas sin colapsar y z.number() directo
    parameters: z.object({
      zonas: z.array(z.string()).describe('Lista de TODAS las zonas/urbanizaciones pedidas (ej: ["Sotogrande", "La Zagaleta"])'),
      municipios: z.array(z.string()).describe('Lista de los municipios a los que pertenecen (ej: ["San Roque", "Benahavis"])'),
      presupuestoMaximo: z.number().describe('Presupuesto máximo convertido a número puro (ej: Si dice 7M, pon 7000000)')
    }),
    execute: async (args) => {
      console.log(`\n    🔌 [TOOL SUPABASE] ¡Harvis ha procesado los datos a la perfección!`);
      console.log(`    📍 Zonas extraídas:    ${args.zonas?.join(', ') || 'Ninguna'}`);
      console.log(`    🗺️ Municipios (IA):    ${args.municipios?.join(', ') || 'Ninguno'}`);
      console.log(`    💰 Presupuesto Max:    ${args.presupuestoMaximo || 0}€`);

      // Unimos las listas con comas para que tu script de Supabase las procese
      const zonasUnidas = args.zonas?.join(',') || '';
      const municipiosUnidos = args.municipios?.join(',') || '';

      return await searchPropertiesInSupabase({ 
        urbanizacion: zonasUnidas, 
        municipioDeducido: municipiosUnidos, 
        precioMax: args.presupuestoMaximo 
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
      temperature: 0.1, // Cero creatividad, máxima precisión
      system: SYSTEM_PROMPT + "\n\nREGLA ESTRICTA: Eres un extractor de datos de alto nivel. Extrae siempre TODAS las zonas mencionadas y el presupuesto máximo en número. Deduce los municipios españoles.",
      messages: historialChat,
      tools: tools,
      toolChoice: 'required', // Pistola cargada
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
