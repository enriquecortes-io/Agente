import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { extraerDatosPropiedad } from './propertyIngestionTools.js';

function getSupabaseSolena() {
  return createClient(
    process.env.SOLENA_SUPABASE_URL!,
    process.env.SOLENA_SERVICE_ROLE_KEY!
  );
}

function getDriveService() {
  const auth = new google.auth.GoogleAuth({
    projectId: 'harvis-496912',
    credentials: {
      type: 'service_account',
      project_id: 'harvis-496912',
      private_key: process.env.GOOGLE_PRIVATE_KEY,
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      client_id: process.env.GOOGLE_CLIENT_ID,
    } as any,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

// Subir imágenes a carpeta Solena en Drive
async function subirImagenesDriveSolena(imagenes: string[], nombrePropiedad: string): Promise<string[]> {
  const drive = getDriveService();
  const parentFolderId = process.env.SOLENA_DRIVE_FOLDER_ID || '1Jl0EBNtcFt2HWIXwT08JjKGNUo8atgC4';

  const folder = await drive.files.create({
    requestBody: {
      name: nombrePropiedad,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    },
    fields: 'id',
  });
  const carpetaId = folder.data.id!;
  console.log(`[Solena Drive] Carpeta creada: ${carpetaId}`);

  const urls: string[] = [];
  const { Readable } = await import('stream');

  for (let i = 0; i < Math.min(imagenes.length, 15); i++) {
    try {
      const imgRes = await fetch(imagenes[i], {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.google.com' },
      });
      if (!imgRes.ok) continue;

      const buffer = await imgRes.arrayBuffer();
      const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
      const ext = imagenes[i].split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
      const fileName = `${String(i + 1).padStart(3, '0')}.${ext}`;

      const file = await drive.files.create({
        requestBody: { name: fileName, parents: [carpetaId] },
        media: { mimeType, body: Readable.from(Buffer.from(buffer)) },
        fields: 'id',
      });

      await drive.permissions.create({
        fileId: file.data.id!,
        requestBody: { role: 'reader', type: 'anyone' },
      });

      urls.push(`/api/drive?id=${file.data.id}`);
      console.log(`[Solena Drive] Imagen ${i + 1}/${Math.min(imagenes.length, 30)} subida`);
    } catch (e: any) {
      console.error(`[Solena Drive] Error imagen ${i}: ${e.message}`);
    }
  }

  return urls;
}

// Generar descripción con NVIDIA
async function generarDescripcion(datos: any): Promise<{ es: string; en: string }> {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (!nvidiaKey) return { es: datos.textoLimpio.slice(0, 300), en: datos.textoLimpio.slice(0, 300) };

  const prompt = `Eres un experto en inmobiliaria en la Costa del Sol. Basándote en este texto de una propiedad, genera una descripción de venta en español e inglés (máximo 200 palabras cada una). Responde SOLO con JSON válido sin markdown:
{"es": "descripción española", "en": "english description"}

TEXTO: ${datos.textoLimpio.slice(0, 2000)}`;

  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${nvidiaKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'meta/llama-3.1-8b-instruct',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600, temperature: 0.7,
    }),
  });

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '{}';
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    return { es: datos.textoLimpio.slice(0, 200), en: datos.textoLimpio.slice(0, 200) };
  }
}

// Insertar en Supabase Solena
async function insertarPropiedadSolena(datos: any, descripcion: { es: string; en: string }, galeriaUrls: string[], slug: string) {
  const supabase = getSupabaseSolena();

  const { data, error } = await supabase.from('properties').insert({
    slug,
    titulo: { es: datos.titulo, en: datos.titulo },
    descripcion: { es: descripcion.es, en: descripcion.en },
    precio: datos.precio,
    habitaciones: datos.habitaciones,
    banos: datos.banos,
    m2_construidos: datos.m2,
    galeria_urls: galeriaUrls,
    activa: true,
    destacada: false,
    tipo: 'villa',
    zona: '',
    ubicacion: '',
    fuente_url: datos.urlOriginal,
  }).select().single();

  if (error) throw new Error(`Supabase Solena: ${error.message}`);
  console.log(`[Solena] Propiedad insertada: ${data.id}`);
  return data;
}

// FLUJO COMPLETO SOLENA
export async function ingerirPropiedadSolena(url: string, slug?: string): Promise<{
  success: boolean;
  propiedadId?: string;
  galeriaUrls?: string[];
  titulo?: string;
  error?: string;
}> {
  try {
    console.log(`[Solena Ingestion] Iniciando: ${url}`);

    const datos = await extraerDatosPropiedad(url);

    const slugFinal = slug || datos.titulo
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60);

    console.log(`[Solena] Imágenes extraídas del HTML: ${datos.imagenes.length}`);
  if (datos.imagenes.length > 0) {
    console.log(`[Solena] Primeras 3 URLs:`, datos.imagenes.slice(0, 3));
  }

  const [descripcion, galeriaUrls] = await Promise.all([
      generarDescripcion(datos),
      subirImagenesDriveSolena(datos.imagenes, datos.titulo),
    ]);

    const propiedad = await insertarPropiedadSolena(datos, descripcion, galeriaUrls, slugFinal);

    console.log(`[Solena Ingestion] ✅ Completado: ${datos.titulo}`);

    return {
      success: true,
      propiedadId: propiedad.id,
      galeriaUrls,
      titulo: datos.titulo,
    };

  } catch (error: any) {
    console.error('[Solena Ingestion] Error:', error.message);
    return { success: false, error: error.message };
  }
}
