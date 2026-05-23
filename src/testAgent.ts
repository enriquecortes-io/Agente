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
    description: 'Busca propiedades en la base de datos. ES OBLIGATORIO extraer zona y precio.',
    parameters: z.object({
      zona: z.string().describe('La zona mencionada (ej: La Zagaleta, Sierra Blanca).'),
      precioMax: z.number().describe('Presupuesto máximo en euros, solo números.')
    }),
    execute: async (args) => {
      console.log(`\n    🔌 [TOOL SUPABASE] Datos extraídos por Harvis:`, args);
      return await searchPropertiesInSupabase(args);
    }
  }),
  crearCarpetaCliente: tool({
    description: 'Crea una estructura de carpetas organizada en Drive. ES OBLIGATORIO extraer el cliente y clasificar la interacción.',
    parameters: z.object({
      nombreCliente: z.string().describe('Nombre del cliente (ej: Charles Vance).'),
      tipoInteraccion: z.string().describe('Clasificación del documento o gestión (ej: NDA y KYC, Prueba de Fondos, Contrato de Arras, Propuestas Off-Market).')
    }),
    execute: async (args) => {
      console.log(`\n    🔌 [TOOL DRIVE] Harvis organizando -> Cliente: ${args.nombreCliente} | Interacción: ${args.tipoInteraccion}`);
      const resultado = await createClientFolder(args.nombreCliente, args.tipoInteraccion);
      console.log(`    ✅ [TOOL DRIVE] Respuesta de Google:`, resultado.message);
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
      system: SYSTEM_PROMPT + "\n\nREGLA DE ORO: Después de usar cualquier herramienta, SIEMPRE debes responder al cliente resumiendo lo que has hecho y facilitándole los enlaces.",
      messages: historialChat,
      tools: tools,
      maxSteps: 5
    });

    console.log(`\n🤖 AGENTE HARVIS:`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(response.text || "(Harvis sigue procesando...)");
    console.log(`─────────────────────────────────────────────────────────────────────────\n`);

    if (response.messages) {
       historialChat = response.messages;
    } else {
       historialChat.push({ role: 'assistant', content: response.text });
    }

  } catch (error) {
    console.error('❌ Error durante la simulación:', error);
  }
}

async function iniciarSimulador() {
  await hablarConHarvis("Hi there! I'm an investor looking for a modern, very private villa in La Zagaleta or Sierra Blanca. Budget is around 6M to 7M euros. What do you have?");
  await hablarConHarvis("Perfect, that property looks stunning. Please prepare the non-disclosure agreement (NDA) so I can review the off-market pictures. My name is Charles Vance and my WhatsApp is +44 7123 456789. Send me the link to upload my proof of funds too.");
}

iniciarSimulador();
