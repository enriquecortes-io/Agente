import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import { prepararEntornoCliente, actualizarHistorial, syncLogToDrive, borrarCarpetasAntiguas } from './tools/driveLogger.js';
import { sendCrmLeadNotification, triggerCmsPropertyPublish } from './tools/webhookTools.js';

const OK   = '✅';
const FAIL = '❌';
const WARN = '⚠️ ';
const SEP  = '─'.repeat(60);

function log(label: string, result: unknown) {
  const success = (result as any)?.success !== false;
  console.log(`\n${success ? OK : FAIL} ${label}`);
  console.log(JSON.stringify(result, null, 2));
}

function header(title: string) {
  console.log(`\n${SEP}`);
  console.log(`  🧪 ${title.toUpperCase()}`);
  console.log(SEP);
}

async function testSupabase() {
  header('Supabase — Búsqueda de propiedades');
  log('Búsqueda exacta (La Zagaleta, 5M€)', await searchPropertiesInSupabase({ urbanizacion: 'La Zagaleta', municipioDeducido: 'Benahavís', precioMax: 5_000_000 }));
  log('Búsqueda sin zona (solo precio 3M€)', await searchPropertiesInSupabase({ precioMax: 3_000_000 }));
  log('Búsqueda sin filtros', await searchPropertiesInSupabase({}));
}

async function testDrive() {
  header('Google Drive — Entorno de cliente');
  const nombre = `Test Cliente ${Date.now()}`;
  try {
    const entorno = await prepararEntornoCliente(nombre, 'Venta');
    log('prepararEntornoCliente', { success: true, ...entorno });
    await actualizarHistorial(entorno.docId, 'Mensaje de prueba', 'Respuesta de prueba');
    log('actualizarHistorial', { success: true });
  } catch (e: any) {
    log('prepararEntornoCliente', { success: false, error: e.message });
  }
}

async function testWebhooks() {
  header('Webhooks — CRM y CMS');
  log('sendCrmLeadNotification', await sendCrmLeadNotification({
    nombre: 'Test Investor', contacto: '+34 600 000 000',
    presupuesto: 4_500_000, estiloBuscado: 'Minimalista',
    notasCualificacion: 'Muy cualificado. Timeline: 3 meses.',
    tipoLead: 'Venta',
  }));
  log('triggerCmsPropertyPublish', await triggerCmsPropertyPublish({
    titulo: 'Villa Silencio', ubicacion: 'La Zagaleta', precio: 8_900_000,
    copywritingEmocional: 'Donde el silencio es el verdadero lujo.',
    tagsLifestyle: ['privacidad', 'off-market'],
  }));
}

async function cleanupDrive() {
  header('Cleanup — Borrar carpetas antiguas');
  try {
    await borrarCarpetasAntiguas();
    log('borrarCarpetasAntiguas', { success: true });
  } catch (e: any) {
    log('borrarCarpetasAntiguas', { success: false, error: e.message });
  }
}

async function testAgenteDirecto(mensaje = 'Hola, soy Carlos García, busco una villa en La Zagaleta con presupuesto de 5 millones') {
  header('Agente Directo — con tools');

  const { google } = await import('@ai-sdk/google');
  const { streamText } = await import('ai');
  const { SYSTEM_PROMPT } = await import('./agents/realEstateExecutive.js');
  const { z } = await import('zod');

  console.log(`\n💬 Usuario: "${mensaje}"\n`);

  const result = streamText({
    model: google('gemini-2.5-flash'),
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: mensaje }],
    maxSteps: 10,
    tools: {
      registrarCliente: {
        description: 'Registra al cliente en Drive. Llama esto en cuanto tengas el nombre y el tipo de gestión.',
        parameters: z.object({
          nombreCliente: z.string().describe('Nombre completo del cliente.'),
          tipoLead: z.enum(['Venta', 'Captacion', 'Gestion']).describe('Tipo de gestión.'),
        }),
        execute: async ({ nombreCliente, tipoLead }) => {
          console.log(`  [Tool] registrarCliente → ${nombreCliente} (${tipoLead})`);
          const r = await prepararEntornoCliente(nombreCliente, tipoLead);
          return { ...r, ok: true };
        },
      },
      guardarConversacion: {
        description: 'Guarda el turno de conversación en el historial del cliente.',
        parameters: z.object({
          docId: z.string(),
          mensajeUsuario: z.string(),
          respuestaAgente: z.string(),
        }),
        execute: async ({ docId, mensajeUsuario, respuestaAgente }) => {
          console.log(`  [Tool] guardarConversacion → docId: ${docId}`);
          await actualizarHistorial(docId, mensajeUsuario, respuestaAgente);
          return { success: true };
        },
      },
      buscarPropiedades: {
        description: 'Busca propiedades en Supabase.',
        parameters: z.object({
          zona: z.string().optional(),
          precioMax: z.number().optional(),
        }),
        execute: async ({ zona, precioMax }) => {
          console.log(`  [Tool] buscarPropiedades → ${zona}, ${precioMax}`);
          return await searchPropertiesInSupabase({ urbanizacion: zona, municipioDeducido: zona, precioMax });
        },
      },
      notificarLeadCRM: {
        description: 'Registra el lead en Supabase CRM.',
        parameters: z.object({
          nombre: z.string(),
          contacto: z.string(),
          presupuesto: z.number().optional(),
          notasCualificacion: z.string(),
          tipoLead: z.enum(['Venta', 'Captacion', 'Gestion']).optional(),
        }),
        execute: async (lead) => {
          console.log(`  [Tool] notificarLeadCRM → ${lead.nombre}`);
          return await sendCrmLeadNotification(lead);
        },
      },
    },
  });

  // Leer el stream completo
  let textoCompleto = '';
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
    textoCompleto += chunk;
  }

  console.log(`\n`);
  log('Agente directo', { success: true, chars: textoCompleto.length });
}

async function main() {
  const arg     = process.argv[2]?.toLowerCase();
  const chatMsg = process.argv[3];

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  🏠 AGENTE REAL ESTATE — TEST SUITE`);
  console.log(`  ${new Date().toLocaleString('es-ES')}`);
  console.log(`${'═'.repeat(60)}`);

  try {
    if      (arg === 'cleanup')  { await cleanupDrive(); }
    else if (arg === 'supabase') { await testSupabase(); }
    else if (arg === 'drive')    { await testDrive(); }
    else if (arg === 'webhook')  { await testWebhooks(); }
    else if (arg === 'agente')   { await testAgenteDirecto(chatMsg); }
    else {
      await testSupabase();
      await testDrive();
      await testWebhooks();
    }
  } catch (e: any) {
    console.error(`\n${FAIL} Error:`, e.message);
    process.exit(1);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Tests completados.`);
  console.log(`${'═'.repeat(60)}\n`);
}

main();
