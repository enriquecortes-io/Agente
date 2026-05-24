import { generateObject, generateText, CoreMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import { createClientFolder } from './tools/googleDriveTools.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// PASO 1: ESQUEMA DEL CEREBRO LÓGICO (Solo extrae datos, NO responde)
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
    // --- FASE 1: PENSAR (Extraer la intención) ---
    const { object: intencion } = await generateObject({
      model: google('gemini-2.5-flash'),
      temperature: 0,
      schema: EsquemaExtractor,
      system: `Analiza el texto. Deduce municipios de España si nombran zonas. Quédate con el presupuesto más alto en números.`,
      messages: historialChat
    });

    let contextoSupabase = null;
    let contextoDrive = null;

    // --- FASE 2: ACTUAR (Ejecutar herramientas) ---
    if (intencion.requiereBuscarPropiedades && intencion.parametrosSupabase) {
      const p = intencion.parametrosSupabase;
      console.log(`    [⚙️ SISTEMA] Buscando en DB: ${p.municipiosDeducidos.join(',')} hasta ${p.presupuestoMaximoEuros}€`);
      contextoSupabase = await searchPropertiesInSupabase({
        urbanizacion: p.urbanizaciones.join(','),
        municipioDeducido: p.municipiosDeducidos.join(','),
        precioMax: p.presupuestoMaximoEuros
      });
    }

    if (intencion.requiereCrearCarpetaDrive && intencion.parametrosDrive) {
      const d = intencion.parametrosDrive;
      console.log(`    [⚙️ SISTEMA] Creando carpeta para: ${d.nombreCliente}`);
      contextoDrive = await createClientFolder(d.nombreCliente, d.tipoInteraccion);
    }

    // --- FASE 3: RESPONDER (El Comercial habla usando los datos de la Base de Datos) ---
    const promptDeVenta = `
    Eres Harvis, un broker inmobiliario de superlujo. 
    Aquí tienes el resultado de la base de datos tras la petición del cliente:
    
    [DATOS DE BASE DE DATOS]: ${JSON.stringify(contextoSupabase)}
    [DATOS DE DRIVE]: ${JSON.stringify(contextoDrive)}

    REGLAS DE RESPUESTA:
    1. Si 'tipo_coincidencia' es 'exacto', véndele la propiedad con entusiasmo mencionando la REFERENCIA, la ZONA y el PRECIO.
    2. Si 'tipo_coincidencia' es 'precio_aproximado' o 'zona_aproximada', dile con mucha elegancia que no hay resultados exactos por ese precio, PERO que le ofreces alternativas similares muy exclusivas.
    3. Si se creó carpeta de Drive, infórmale de que el NDA/Documentación está lista.
    Sé conciso, persuasivo y elegante. NO inventes propiedades que no estén en el JSON.
    `;

    const { text: respuestaFinal } = await generateText({
      model: google('gemini-2.5-flash'),
      temperature: 0.7, // Aquí SÍ le damos creatividad para que tenga labia de vendedor
      system: promptDeVenta,
      messages: historialChat
    });

    console.log(`\n🤖 AGENTE HARVIS:`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(respuestaFinal);
    console.log(`─────────────────────────────────────────────────────────────────────────\n`);

    historialChat.push({ role: 'assistant', content: respuestaFinal });

  } catch (error: any) {
    console.error('❌ Error durante la simulación:', error.message || error);
  }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function iniciarSimulador() {
  await hablarConHarvis("Hi! I need a villa in La Zagaleta, my budget is around 6M euros. What do you have?");
  await delay(3000);
  await hablarConHarvis("Great! I am Charles Vance. Please prepare the NDA so we can move forward.");
}

iniciarSimulador();
