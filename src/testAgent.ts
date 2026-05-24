import { generateObject, CoreMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import { createClientFolder } from './tools/googleDriveTools.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// 🧠 EL ESQUEMA TOTAL: Harvis puede tomar múltiples decisiones estructuradas
const EsquemaHarvis = z.object({
  requiereBuscarPropiedades: z.boolean().describe('True si el cliente busca propiedades, zonas o presupuestos'),
  parametrosSupabase: z.object({
    urbanizaciones: z.array(z.string()).describe('Lista de zonas (ej: ["Sotogrande"])'),
    municipiosDeducidos: z.array(z.string()).describe('Municipios deducidos (ej: ["San Roque"])'),
    presupuestoMaximoEuros: z.number().describe('Presupuesto máximo numérico (ej: 7000000)')
  }).optional().describe('Rellenar solo si requiereBuscarPropiedades es true'),

  requiereCrearCarpetaDrive: z.boolean().describe('True si el cliente da sus datos personales, pide un NDA o Proof of Funds'),
  parametrosDrive: z.object({
    nombreCliente: z.string().describe('Nombre completo del lead (ej: "Charles Vance")'),
    tipoInteraccion: z.string().describe('Motivo o tipo de documento (ej: "NDA y Proof of Funds")')
  }).optional().describe('Rellenar solo si requiereCrearCarpetaDrive es true'),

  respuestaCliente: z.string().describe('La respuesta comercial, educada y profesional que se le enviará al cliente')
});

let historialChat: CoreMessage[] = [];

async function hablarConHarvis(mensajeCliente: string) {
  console.log(`\n╔═════════════════════════════════════════════════════════════════════════`);
  console.log(`║ 👤 CLIENTE: "${mensajeCliente}"`);
  console.log(`╚═════════════════════════════════════════════════════════════════════════`);

  historialChat.push({ role: 'user', content: mensajeCliente });

  try {
    const { object } = await generateObject({
      model: google('gemini-2.5-flash'),
      temperature: 0,
      schema: EsquemaHarvis,
      system: `Eres Harvis, el agente ejecutivo de IA para una inmobiliaria de lujo en la Costa del Sol.
      Tu trabajo es procesar las peticiones de los leads inversores de alto standing.
      
      REGLAS DE NEGOCIO GEOGRÁFICAS Y FINANCIERAS:
      1. Si piden urbanizaciones, deduce sus municipios españoles automáticamente (ej: Zagaleta -> Benahavís, Sierra Blanca -> Marbella, Sotogrande -> San Roque).
      2. Si te dan un rango de presupuesto (ej: 6M a 7M), quédate SIEMPRE con el número más alto (7000000) para acotar la búsqueda en Supabase.
      3. Si el cliente te facilita su nombre de pila o completo, o te solicita un acuerdo de confidencialidad (NDA) o link para Proof of Funds, activa la creación de carpeta en Drive de inmediato de forma obligatoria.`,
      messages: historialChat
    });

    // 🔌 ACCIÓN 1: BÚSQUEDA EN SUPABASE (Si procede)
    if (object.requiereBuscarPropiedades && object.parametrosSupabase) {
      const p = object.parametrosSupabase;
      console.log(`\n    🔌 [ENRUTADOR SUPABASE] ¡Disparando cruce con la Base de Datos!`);
      console.log(`    📍 Zonas:      ${p.urbanizaciones.join(', ')}`);
      console.log(`    🗺️ Municipios: ${p.municipiosDeducidos.join(', ')}`);
      console.log(`    💰 Presupuesto:${p.presupuestoMaximoEuros}€`);

      const resultadoSupabase = await searchPropertiesInSupabase({
        urbanizacion: p.urbanizaciones.join(','),
        municipioDeducido: p.municipiosDeducidos.join(','),
        precioMax: p.presupuestoMaximoEuros
      });
      // Aquí puedes mapear o procesar los registros devueltos si lo deseas
    }

    // 🔌 ACCIÓN 2: CREACIÓN DE CARPETA EN DRIVE (Si procede)
    if (object.requiereCrearCarpetaDrive && object.parametrosDrive) {
      const d = object.parametrosDrive;
      console.log(`\n    🔌 [ENRUTADOR GOOGLE DRIVE] ¡Organizando el papeleo del lead!`);
      console.log(`    👤 Lead:        ${d.nombreCliente}`);
      console.log(`    📁 Trámite:     ${d.tipoInteraccion}`);

      const resultadoDrive = await createClientFolder(d.nombreCliente, d.tipoInteraccion);
      console.log(`    ✅ [DRIVE] Resultado:`, resultadoDrive.message || resultadoDrive.error);
    }

    console.log(`\n🤖 AGENTE HARVIS:`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(object.respuestaCliente);
    console.log(`─────────────────────────────────────────────────────────────────────────\n`);

    historialChat.push({ role: 'assistant', content: object.respuestaCliente });

  } catch (error: any) {
    console.error('❌ Error durante la simulación:', error.message || error);
  }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function iniciarSimulador() {
  // Primer mensaje: Búsqueda geográfica y financiera estricta
  await hablarConHarvis("Hi there! I'm an investor looking for a modern, very private villa in La Zagaleta or Sierra Blanca. Budget is around 6M to 7M euros. What do you have?");
  
  await delay(3000); // Pequeña pausa de seguridad para el simulador
  
  // Segundo mensaje: Captura de datos personales y activación de Drive
  await hablarConHarvis("Perfect, that property looks stunning. Please prepare the non-disclosure agreement (NDA) so I can review the off-market pictures. My name is Charles Vance and my WhatsApp is +44 7123 456789. Send me the link to upload my proof of funds too.");
}

iniciarSimulador();
