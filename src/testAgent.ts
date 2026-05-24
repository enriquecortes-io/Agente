import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import { createClientFolder } from './tools/googleDriveTools.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// 🔥 EL HACK: Definimos nosotros el tipo para que TypeScript se calle la boca
type CoreMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

// 🧠 CONEXIÓN A NVIDIA NIM Pura
const nvidia = createOpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY || '',
});

const modeloNvidia = nvidia('meta/llama-3.1-8b-instruct');

let historialChat: CoreMessage[] = [];

async function hablarConHarvis(mensajeCliente: string) {
  console.log(`\n╔═════════════════════════════════════════════════════════════════════════`);
  console.log(`║ 👤 CLIENTE: "${mensajeCliente}"`);
  console.log(`╚═════════════════════════════════════════════════════════════════════════`);

  historialChat.push({ role: 'user', content: mensajeCliente });

  try {
    // --- FASE 1: PENSAR ---
    const promptExtractor = `
    Eres un analizador de datos. Tu ÚNICA salida debe ser un objeto JSON válido, sin texto adicional, sin formato markdown, SOLO el JSON.
    Reglas: Deduce municipios de España (Zagaleta=Benahavis, Sotogrande=San Roque). Quédate con el presupuesto más alto en números puros.
    
    Estructura OBLIGATORIA del JSON:
    {
      "requiereBuscarPropiedades": boolean,
      "parametrosSupabase": {
        "urbanizaciones": ["string"],
        "municipiosDeducidos": ["string"],
        "presupuestoMaximoEuros": number
      },
      "requiereCrearCarpetaDrive": boolean,
      "parametrosDrive": {
        "nombreCliente": "string",
        "tipoInteraccion": "string"
      }
    }
    `;

    const { text: respuestaCruda } = await generateText({
      model: modeloNvidia,
      temperature: 0,
      system: promptExtractor,
      messages: historialChat
    });

    const jsonLimpio = respuestaCruda.replace(/```json/g, '').replace(/```/g, '').trim();
    let intencion;
    
    try {
      intencion = JSON.parse(jsonLimpio);
    } catch (parseError) {
      console.error("❌ La IA no devolvió un JSON válido:", jsonLimpio);
      return;
    }

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

    // --- FASE 3: RESPONDER ---
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

    const { text: respuestaFinal } = await generateText({
      model: modeloNvidia,
      temperature: 0.7,
      system: promptDeVenta,
      messages: historialChat
    });

    console.log(`\n🤖 AGENTE HARVIS (NVIDIA Manual Bypass):`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(respuestaFinal);
    console.log(`─────────────────────────────────────────────────────────────────────────\n`);

    historialChat.push({ role: 'assistant', content: respuestaFinal });

  } catch (error: any) {
    console.error('❌ Error Salvaje:', error.message || error);
  }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function iniciarSimulador() {
  await hablarConHarvis("Hi! I need a villa in La Zagaleta, my budget is around 6M euros. What do you have?");
  await delay(3000);
  await hablarConHarvis("Great! I am Charles Vance. Please prepare the NDA so we can move forward.");
}

iniciarSimulador();
