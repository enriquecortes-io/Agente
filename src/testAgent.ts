import { generateObject, CoreMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// 1. Definimos el esquema estricto del "Cerebro" de Harvis
const EsquemaHarvis = z.object({
  herramientaAUsar: z.enum(['buscarPropiedades', 'ninguna']).describe('Qué acción debe tomar el agente'),
  parametrosBusqueda: z.object({
    urbanizaciones: z.array(z.string()).describe('Lista de urbanizaciones (ej: ["Sotogrande", "La Zagaleta"])'),
    municipiosDeducidos: z.array(z.string()).describe('Municipios españoles deducidos (ej: ["San Roque", "Benahavis"])'),
    presupuestoMaximoEuros: z.number().describe('Presupuesto numérico puro (ej: 7000000)')
  }).optional().describe('Rellenar SOLO si herramientaAUsar es buscarPropiedades'),
  respuestaCliente: z.string().describe('Lo que Harvis le diría al cliente')
});

let historialChat: CoreMessage[] = [];

async function hablarConHarvis(mensajeCliente: string) {
  console.log(`\n╔═════════════════════════════════════════════════════════════════════════`);
  console.log(`║ 👤 CLIENTE: "${mensajeCliente}"`);
  console.log(`╚═════════════════════════════════════════════════════════════════════════`);

  historialChat.push({ role: 'user', content: mensajeCliente });

  try {
    // 2. Usamos generateObject para forzar la estructura de datos SIN el motor de herramientas
    const { object } = await generateObject({
      model: google('gemini-2.5-flash'),
      temperature: 0,
      schema: EsquemaHarvis,
      system: `Eres el cerebro de un agente inmobiliario de lujo. 
      Lee el mensaje del cliente, deduce los municipios de las urbanizaciones que pida, convierte su presupuesto a números y decide qué herramienta usar.`,
      messages: historialChat
    });

    console.log(`\n🧠 [CEREBRO AI] Decisión: ${object.herramientaAUsar}`);

    // 3. Ejecutamos la herramienta MANUALMENTE si la IA lo decide
    if (object.herramientaAUsar === 'buscarPropiedades' && object.parametrosBusqueda) {
      const p = object.parametrosBusqueda;
      console.log(`    🔌 [ENRUTADOR] Disparando Supabase manualmente...`);
      console.log(`    📍 Zonas:      ${p.urbanizaciones.join(', ')}`);
      console.log(`    🗺️ Municipios: ${p.municipiosDeducidos.join(', ')}`);
      console.log(`    💰 Presupuesto:${p.presupuestoMaximoEuros}€`);

      await searchPropertiesInSupabase({
        urbanizacion: p.urbanizaciones.join(','),
        municipioDeducido: p.municipiosDeducidos.join(','),
        precioMax: p.presupuestoMaximoEuros
      });
    }

    console.log(`\n🤖 AGENTE HARVIS (Respuesta al cliente):`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(object.respuestaCliente);
    console.log(`─────────────────────────────────────────────────────────────────────────\n`);

    historialChat.push({ role: 'assistant', content: object.respuestaCliente });

  } catch (error: any) {
    console.error('❌ Error durante la simulación:', error.message || error);
  }
}

async function iniciarSimulador() {
  await hablarConHarvis("I am looking for a villa in Sotogrande or La Zagaleta, budget around 6M to 7M euros.");
}

iniciarSimulador();
