import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { SYSTEM_PROMPT } from './agents/realEstateExecutive.js';
import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import { createClientFolder } from './tools/googleDriveTools.js';
import { sendCrmLeadNotification, triggerCmsPropertyPublish } from './tools/webhookTools.js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config({ path: '.env.local' });

if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  console.error('\n❌ ERROR: No se ha encontrado GOOGLE_GENERATIVE_AI_API_KEY en el archivo .env.local');
  console.error('Por favor, asegúrate de añadir tus credenciales antes de ejecutar el test.\n');
  process.exit(1);
}

const tools = {
  buscarPropiedades: {
    description: 'Consulta el inventario disponible en Supabase filtrando por ubicación, presupuesto máximo y estilo de vida.',
    parameters: {
      type: 'object',
      properties: {
        zona: { type: 'string' },
        precioMax: { type: 'number' },
        estilo: { type: 'string' }
      }
    },
    execute: async ({ zona, precioMax, estilo }: any) => {
      console.log(`\n    🔌 [TOOL SUPABASE] Buscando en DB -> Zona: ${zona || 'Cualquiera'}, Máx: ${precioMax || 'Sin límite'}, Estilo: ${estilo || 'Cualquiera'}`);
      return await searchPropertiesInSupabase({ zona, precioMax, estilo });
    }
  },
  crearCarpetaCliente: {
    description: 'Crea un espacio seguro en Google Drive para guardar el KYC, pasaporte o NDA de un inversor cualificado.',
    parameters: {
      type: 'object',
      properties: {
        nombreCliente: { type: 'string' }
      },
      required: ['nombreCliente']
    },
    execute: async ({ nombreCliente }: any) => {
      console.log(`\n    🔌 [TOOL DRIVE] Generando espacio confidencial para: ${nombreCliente}`);
      return await createClientFolder(nombreCliente);
    }
  },
  notificarLeadCRM: {
    description: 'Sincroniza un perfil de inversor cualificado orgánicamente enviando sus datos esenciales al CRM corporativo.',
    parameters: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        contacto: { type: 'string' },
        presupuesto: { type: 'number' },
        estiloBuscado: { type: 'string' },
        notasCualificacion: { type: 'string' }
      },
      required: ['nombre', 'contacto', 'notasCualificacion']
    },
    execute: async (leadData: any) => {
      console.log(`\n    🔌 [TOOL CRM] Disparando webhook de cualificación para: ${leadData.nombre}`);
      return await sendCrmLeadNotification(leadData);
    }
  },
  publicarPropiedadCMS: {
    description: 'Inyecta el copywriting emocional y la ficha técnica de una propiedad directamente en el CMS de la web.',
    parameters: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        ubicacion: { type: 'string' },
        precio: { type: 'number' },
        copywritingEmocional: { type: 'string' },
        tagsLifestyle: { type: 'array', items: { type: 'string' } }
      },
      required: ['titulo', 'ubicacion', 'precio', 'copywritingEmocional']
    },
    execute: async (propertyData: any) => {
      console.log(`\n    🔌 [TOOL CMS] Enviando nueva propiedad al pipeline de publicación: ${propertyData.titulo}`);
      return await triggerCmsPropertyPublish(propertyData);
    }
  }
};

async function simularConversacion(mensajeCliente: string) {
  console.log(`\n╔═════════════════════════════════════════════════════════════════════════`);
  console.log(`║ 👤 CLIENTE: "${mensajeCliente}"`);
  console.log(`╚═════════════════════════════════════════════════════════════════════════`);

  try {
    const response = await generateText({
      model: google('gemini-1.5-pro-latest'),
      system: SYSTEM_PROMPT,
      prompt: mensajeCliente,
      tools: tools,
      maxSteps: 5 // Permite el ciclo completo: Pensar -> Llamar Tool -> Recibir info -> Responder
    });

    console.log(`\n🤖 AGENTE REE:`);
    console.log(`─────────────────────────────────────────────────────────────────────────`);
    console.log(response.text);
    console.log(`─────────────────────────────────────────────────────────────────────────\n`);

  } catch (error) {
    console.error('❌ Error durante la simulación:', error);
  }
}

async function iniciarSimulador() {
  console.log('🚀 INICIANDO ENTORNO DE PRUEBAS - THE ELITE REAL ESTATE EXECUTIVE');
  
  // ESCENARIO 1: Consulta de Inventario (Debería activar Supabase)
  await simularConversacion(
    "Hi there! I'm an investor looking for a modern, very private villa in La Zagaleta or Sierra Blanca. Budget is around 6M to 7M euros. What do you have?"
  );

  // ESCENARIO 2: Cierre y Cualificación (Debería activar Drive y CRM)
  await simularConversacion(
    "Perfect, that property looks stunning. Please prepare the non-disclosure agreement (NDA) so I can review the off-market pictures. My name is Charles Vance and my WhatsApp is +44 7123 456789. Send me the link to upload my proof of funds too."
  );
}

iniciarSimulador();
