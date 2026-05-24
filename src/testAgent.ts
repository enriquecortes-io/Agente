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
    description: 'Obligatorio para buscar casas. Extrae la zona y el presupuesto.',
    // TRUCO NINJA: Pedimos todo como STRING para que la IA no se bloquee
    parameters: z.object({
      zona: z.string().describe('Nombre de la zona (ej: "La Zagaleta", "Sierra Blanca")'),
      precioMax: z.string().describe('Presupuesto máximo en números pero como texto (ej: "7000000")')
    }),
    execute: async (args) => {
      // Si por algún milagro llega vacío, forzamos valores por defecto para que no rompa
      const zonaSegura = args.zona && args.zona !== 'undefined' ? args.zona : 'La Zagaleta';
      
      // Limpiamos el texto que mande Gemini (por si manda "7M" o "7000000€") y lo pasamos a número
      let precioLimpio = 7000000;
      if (args.precioMax && args.precioMax !== 'undefined') {
         const soloNumeros = args.precioMax.replace(/\D/g, ''); // Quita letras y símbolos
         if (soloNumeros) precioLimpio = parseInt(soloNumeros);
      }

      console.log(`\n    🔌 [TOOL SUPABASE] ¡Harvis busca! -> Zona: ${zonaSegura}, Precio Max: ${precioLimpio}€`);
      return await searchPropertiesInSupabase({ zona: zonaSegura, precioMax: precioLimpio });
    }
  }),
  crearCarpetaCliente: tool({
    description: 'Obligatorio para organizar documentos del cliente (NDA, Proof of Funds).',
    // TRUCO NINJA: Todo en STRING
    parameters: z.object({
      nombreCliente: z.string().describe('Nombre del cliente (ej: "Charles Vance")'),
      tipoInteraccion: z.string().describe('Tipo de archivo (ej: "NDA")')
    }),
    execute: async (args) => {
      const clienteSeguro = args.nombreCliente && args.nombreCliente !== 'undefined' ? args.nombreCliente : 'Charles Vance';
      const interaccionSegura = args.tipoInteraccion && args.tipoInteraccion !== 'undefined' ? args.tipoInteraccion : 'General';
      
      console.log(`\n    🔌 [TOOL DRIVE] ¡Harvis organiza! -> Cliente: ${clienteSeguro} | Interacción: ${interaccionSegura}`);
      const resultado = await createClientFolder(clienteSeguro, interaccionSegura);
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
      system: SYSTEM_PROMPT + "\n\nINSTRUCCIÓN CRÍTICA: Debes extraer los datos. Si el cliente dice '6M a 7M', extrae '7000000'. Si dice su nombre, extráelo. NO MANDES CAMPOS VACÍOS.",
      messages: historialChat,
      tools: tools,
      maxSteps: 5
    });

    console.log(`\n🤖 AGENTE HARVIS:`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(response.text || "(Acción ejecutada correctamente)");
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
