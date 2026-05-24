import { generateObject, generateText, CoreMessage } from 'ai';
// Importamos el creador de OpenAI
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import { createClientFolder } from './tools/googleDriveTools.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// 🧠 CONFIGURACIÓN DEL NUEVO CEREBRO (NVIDIA NIM)
const nvidia = createOpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY || '',
});

// Usaremos el modelo Llama 3.1 70B alojado en NVIDIA
const modeloNvidia = nvidia('meta/llama-3.1-70b-instruct');

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
    // --- FASE 1: PENSAR (NVIDIA NIM extrayendo JSON) ---
    const { object: intencion } = await generateObject({
      model: modeloNvidia,
      temperature: 0,
      schema: EsquemaExtractor,
      system: `Analiza el texto. Deduce municipios de España si nombran zonas. Quédate con el presupuesto más alto en números.`,
      messages: historialChat
    });

    let contextoSupabase = null;
    let contextoDrive = null;

    // --- FASE 2: ACTUAR ---
    if (intencion.requiereBuscarPropiedades && intencion.parametrosSupabase) {
      const p = intencion.parametrosSupabase;
      console.log(`    [⚙️ SISTEMA] Buscando en DB: ${p.municipiosDeducidos?.join(',')} hasta ${p.presupuestoMaximoEuros}€`);
      contextoSupabase = await searchPropertiesInSupabase({
        urbanizacion: p.urbanizaciones?.join(','),
        municipioDeducido: p.municipiosDeducidos?.join(','),
        precioMax: p.presupuestoMaximoEuros
      });
    }

    if (intencion.requiereCrearCarpetaDrive && intencion.parametrosDrive) {
      const d = intencion.parametrosDrive;
      console.log(`    [⚙️ SISTEMA] Creando carpeta para: ${d.nombreCliente}`);
      contextoDrive = await createClientFolder(d.nombreCliente, d.tipoInteraccion);
    }

    // --- FASE 3: RESPONDER (NVIDIA NIM como comercial) ---
    const promptDeVenta = `
    Eres Harvis, un broker inmobiliario de superlujo. 
    Aquí tienes el resultado de la base de datos tras la petición del cliente:
    
    [DATOS DE BASE DE DATOS]: ${JSON.stringify(contextoSupabase)}
    [DATOS DE DRIVE]: ${JSON.stringify(contextoDrive)}

    REGLAS DE RESPUESTA:
    1. Si 'tipo_coincidencia' es 'exacto', véndele la propiedad con entusiasmo mencionando la REFERENCIA, la ZONA y el PRECIO.
    2. Si 'tipo_coincidencia' es 'precio_aproximado' o 'zona_aproximada', dile con elegancia que le ofreces alternativas similares muy exclusivas.
    3. Si se creó carpeta de Drive, infórmale de que el NDA/Documentación está lista.
    Sé conciso, persuasivo y elegante. NO inventes propiedades que no estén en el JSON. Responde siempre en el idioma en el que te hable el cliente.
    `;

    const { text: respuestaFinal } = await generateText({
      model: modeloNvidia,
      temperature: 0.7, 
      system: promptDeVenta,
      messages: historialChat
    });

    console.log(`\n🤖 AGENTE HARVIS (Llama 3.1 70B vía NVIDIA):`);
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
