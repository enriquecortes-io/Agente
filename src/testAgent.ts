import { generateObject, generateText, CoreMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import { createClientFolder } from './tools/googleDriveTools.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// 🧠 CONEXIÓN A NVIDIA NIM
const nvidia = createOpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY || '',
});

// Usamos tu Llama 3.1 8B de NVIDIA
const modeloNvidia = nvidia('meta/llama-3.1-8b-instruct');

const EsquemaExtractor = z.object({
  requiereBuscarPropiedades: z.boolean(),
  parametrosSupabase: z.object({
    urbanizaciones: z.array(z.string()),
    municipiosDeducidos: z.array(z.string()),
    presupuestoMaximoEuros: z.number()
  }).optional(),
  requiereCrearCarpetaDrive: z.boolean(),
  parametrosDrive: z.object({
    nombreCliente: z.string(),
    tipoInteraccion: z.string()
  }).optional()
});

let historialChat: CoreMessage[] = [];

async function hablarConHarvis(mensajeCliente: string) {
  console.log(`\n╔═════════════════════════════════════════════════════════════════════════`);
  console.log(`║ 👤 CLIENTE: "${mensajeCliente}"`);
  console.log(`╚═════════════════════════════════════════════════════════════════════════`);

  historialChat.push({ role: 'user', content: mensajeCliente });

  try {
    // --- FASE 1: PENSAR (NVIDIA NIM MODO JSON COMPATIBLE) ---
    const { object: intencion } = await generateObject({
      model: modeloNvidia,
      mode: 'json', // 🔥 LA LÍNEA MÁGICA: Obliga a usar JSON clásico y evita el error 404
      temperature: 0,
      schema: EsquemaExtractor,
      system: `Eres un extractor de datos. Analiza el texto y devuelve un objeto JSON válido con la estructura solicitada. Deduce municipios de España si nombran zonas (ej: Zagaleta = Benahavis, Sotogrande = San Roque). Quédate con el presupuesto más alto en números puros.`,
      messages: historialChat
    });

    let contextoSupabase = null;
    let contextoDrive = null;

    if (intencion.requiereBuscarPropiedades && intencion.parametrosSupabase) {
      const p = intencion.parametrosSupabase;
      console.log(`    [⚙️ SISTEMA] Buscando DB: ${p.municipiosDeducidos?.join(',')} hasta ${p.presupuestoMaximoEuros}€`);
      contextoSupabase = await searchPropertiesInSupabase({
        urbanizacion: p.urbanizaciones?.join(','),
        municipioDeducido: p.municipiosDeducidos?.join(','),
        precioMax: p.presupuestoMaximoEuros
      });
    }

    if (intencion.requiereCrearCarpetaDrive && intencion.parametrosDrive) {
      const d = intencion.parametrosDrive;
      console.log(`    [⚙️ SISTEMA] Creando carpeta Drive para: ${d.nombreCliente}`);
      contextoDrive = await createClientFolder(d.nombreCliente, d.tipoInteraccion);
    }

    const promptDeVenta = `
    Eres Harvis, broker inmobiliario de superlujo. 
    Resultado de la base de datos: ${JSON.stringify(contextoSupabase)}
    Resultado Drive: ${JSON.stringify(contextoDrive)}

    REGLAS:
    1. Si 'tipo_coincidencia' es 'exacto', véndelo con entusiasmo y cita la referencia.
    2. Si es 'precio_aproximado' o 'zona_aproximada', dile que le ofreces alternativas similares exclusivas.
    3. Si se creó carpeta de Drive, infórmale de que la documentación está lista.
    Responde SIEMPRE de forma concisa y elegante en el idioma del usuario.
    `;

    // --- FASE 3: RESPONDER (NVIDIA NIM) ---
    const { text: respuestaFinal } = await generateText({
      model: modeloNvidia,
      temperature: 0.7,
      system: promptDeVenta,
      messages: historialChat
    });

    console.log(`\n🤖 AGENTE HARVIS (NVIDIA Llama 3.1 8B):`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(respuestaFinal);
    console.log(`─────────────────────────────────────────────────────────────────────────\n`);

    historialChat.push({ role: 'assistant', content: respuestaFinal });

  } catch (error: any) {
    console.error('❌ Error durante la simulación con NVIDIA:', error.message || error);
  }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function iniciarSimulador() {
  await hablarConHarvis("Hi! I need a villa in La Zagaleta, my budget is around 6M euros. What do you have?");
  await delay(3000);
  await hablarConHarvis("Great! I am Charles Vance. Please prepare the NDA so we can move forward.");
}

iniciarSimulador();
