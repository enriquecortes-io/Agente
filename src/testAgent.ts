import { generateText, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { SYSTEM_PROMPT } from './agents/realEstateExecutive.js';
import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import { createClientFolder } from './tools/googleDriveTools.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const tools = {
  buscarPropiedades: tool({
    description: 'Consulta el inventario disponible en Supabase filtrando por ubicación, presupuesto máximo y estilo de vida.',
    parameters: z.object({
      zona: z.string().optional().describe('Ubicación en Marbella (ej: La Zagaleta, Sierra Blanca).'),
      precioMax: z.number().optional().describe('Presupuesto máximo del inversor en euros.'),
      estilo: z.string().optional().describe('Estilo arquitectónico o tags de ambiente.')
    }),
    execute: async ({ zona, precioMax, estilo }) => {
      console.log(`\n    🔌 [TOOL SUPABASE] Buscando DB -> Zona: ${zona || 'Todas'}, Máx: ${precioMax || 'Sin límite'}€, Estilo: ${estilo || 'Todos'}`);
      return await searchPropertiesInSupabase({ zona, precioMax, estilo });
    }
  }),
  crearCarpetaCliente: tool({
    description: 'Crea un espacio seguro en Google Drive para guardar el KYC o NDA de un inversor.',
    parameters: z.object({
      nombreCliente: z.string().describe('Nombre completo del cliente o fondo inversor (ej: Charles Vance).')
    }),
    execute: async ({ nombreCliente }) => {
      console.log(`\n    🔌 [TOOL DRIVE] Generando espacio confidencial para: ${nombreCliente}`);
      const resultado = await createClientFolder(nombreCliente);
      console.log(`    ✅ [TOOL DRIVE] Resultado de Google:`, resultado.message);
      return resultado;
    }
  })
};

async function simularConversacion(mensajeCliente: string) {
  console.log(`\n╔═════════════════════════════════════════════════════════════════════════`);
  console.log(`║ 👤 CLIENTE: "${mensajeCliente}"`);
  console.log(`╚═════════════════════════════════════════════════════════════════════════`);

  try {
    const response = await generateText({
      model: google('gemini-2.5-flash'),
      system: SYSTEM_PROMPT,
      prompt: mensajeCliente,
      tools: tools,
      maxSteps: 5
    });

    console.log(`\n🤖 AGENTE HARVIS:`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(response.text);
    console.log(`─────────────────────────────────────────────────────────────────────────\n`);

  } catch (error) {
    console.error('❌ Error durante la simulación:', error);
  }
}

async function iniciarSimulador() {
  await simularConversacion("Hi there! I'm an investor looking for a modern, very private villa in La Zagaleta or Sierra Blanca. Budget is around 6M to 7M euros. What do you have?");
  await simularConversacion("Perfect, that property looks stunning. Please prepare the non-disclosure agreement (NDA) so I can review the off-market pictures. My name is Charles Vance and my WhatsApp is +44 7123 456789. Send me the link to upload my proof of funds too.");
}

iniciarSimulador();
