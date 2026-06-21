import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function getDriveService() {
 const supabase = getSupabase();
 const { data } = await supabase.from('oauth_tokens').select('refresh_token').eq('id', 'google_drive').single();
 const refreshToken = data?.refresh_token || process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
 const auth = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
 auth.setCredentials({ refresh_token: refreshToken });
 auth.on('tokens', async (tokens) => {
   if (tokens.refresh_token) {
     await supabase.from('oauth_tokens').upsert({ id: 'google_drive', refresh_token: tokens.refresh_token, updated_at: new Date().toISOString() });
     console.log('[Drive] Refresh token actualizado en Supabase');
   }
 });
 return google.drive({ version: 'v3', auth });
}

// 1. EXTRAER DATOS DE LA WEB
export async function extraerDatosPropiedad(url: string) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  const html = await res.text();
  const urlBase = new URL(url);

  // Extraer imágenes — formato clásico (src/data-src/srcset con extensión)
  const imageSet = new Set<string>();
  const srcMatches = html.matchAll(/(?:src|data-src|data-lazy)=["']([^"']+\.(jpg|jpeg|png|webp|avif)[^"']*)/gi);
  for (const m of srcMatches) {
    const imgUrl = m[1].startsWith('http') ? m[1] : `${urlBase.origin}${m[1].startsWith('/') ? '' : '/'}${m[1]}`;
    imageSet.add(imgUrl.split('?')[0]);
  }
  const srcsetMatches = html.matchAll(/srcset=["']([^"']+)/gi);
  for (const m of srcsetMatches) {
    m[1].split(',').forEach(s => {
      const u = s.trim().split(' ')[0];
      if (u.match(/\.(jpg|jpeg|png|webp|avif)/i)) {
        const imgUrl = u.startsWith('http') ? u : `${urlBase.origin}${u.startsWith('/') ? '' : '/'}${u}`;
        imageSet.add(imgUrl.split('?')[0]);
      }
    });
  }

  // Extraer imágenes de CDNs sin extensión en la URL (Uploadcare, Imgix, Cloudinary, etc.)
  // Patrón: dominio-cdn.com/{uuid}/ con transformaciones tipo /-/format/webp/
  const cdnMatches = html.matchAll(/https:\/\/(?:uploadcare\.[a-z.]+|[\w-]+\.cloudinary\.com|[\w-]+\.imgix\.net)\/[a-f0-9-]{36}\/[^"'\s)]*/gi);
  for (const m of cdnMatches) {
    // Normalizar a la versión de mayor calidad/resolución disponible
    const base = m[0].split('/-/')[0];
    imageSet.add(`${base}/-/format/jpeg/-/resize/2000x/-/quality/best/`);
  }

  const imagenes = Array.from(imageSet).filter(u =>
    !u.includes('icon') && !u.includes('logo') && !u.includes('favicon') &&
    !u.includes('avatar') && !u.includes('spinner') && u.length > 20
  );

  // Extraer texto visible
  const textoLimpio = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);

  // Extraer precio
  const precioMatch = textoLimpio.match(/(\d[\d.,]+)\s*(?:€|EUR|euros?)/i);
  const precio = precioMatch ? parseFloat(precioMatch[1].replace(/\./g, '').replace(',', '.')) : 0;

  // Extraer habitaciones
  const habMatch = textoLimpio.match(/(\d+)\s*(?:hab|bedroom|dormitor)/i);
  const habitaciones = habMatch ? parseInt(habMatch[1]) : 0;

  // Extraer baños
  const banosMatch = textoLimpio.match(/(\d+)\s*(?:ba[ñn]|bathroom|aseo)/i);
  const banos = banosMatch ? parseInt(banosMatch[1]) : 0;

  // Extraer m2
  const m2Match = textoLimpio.match(/(\d+)\s*m[²2]/i);
  const m2 = m2Match ? parseInt(m2Match[1]) : 0;

  // Extraer título de la página
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const titulo = titleMatch ? titleMatch[1].replace(/\s*[-|].*$/, '').trim() : 'Propiedad';

  console.log(`[Ingestion] Extraído: ${titulo} | €${precio} | ${habitaciones}hab | ${imagenes.length} imágenes`);

  return { titulo, precio, habitaciones, banos, m2, imagenes, textoLimpio, urlOriginal: url };
}

// 2. GENERAR DESCRIPCIÓN EDITORIAL CON NVIDIA
async function generarDescripcion(datos: any): Promise<{ es: string; en: string }> {
  const nvidiaKey = process.env.NVIDIA_API_KEY!;

  const prompt = `Eres el editor de contenidos de The Edit Marbella, agencia inmobiliaria de lujo en la Costa del Sol.

Basándote en esta información de una propiedad, genera una descripción editorial de lujo:

DATOS:
${datos.textoLimpio.slice(0, 2000)}

REGLAS:
- Tono editorial, aspiracional, nunca comercial
- 150-200 palabras
- Destaca la experiencia de vivir ahí, no solo las características
- En español e inglés
- Mantén los datos reales (precio, habitaciones, m2) pero adapta el estilo

Responde SOLO en JSON:
{
  "es": "descripción en español",
  "en": "description in english"
}`;

  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${nvidiaKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'meta/llama-3.1-8b-instruct',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      temperature: 0.7,
    }),
  });

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '{}';
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return { es: datos.textoLimpio.slice(0, 200), en: datos.textoLimpio.slice(0, 200) };
  }
}

// 3. SUBIR IMÁGENES A DRIVE Y OBTENER URLS PÚBLICAS
async function subirImagenesDrive(imagenes: string[], nombrePropiedad: string): Promise<string[]> {
  const drive = await getDriveService();
  const parentFolderId = process.env.GOOGLE_FOLDER_IMAGENES || "1ao8-TxyWx3mzD3YWvo0gDkODitJcWeYq";
  console.log("[Drive] parentFolderId:", parentFolderId);

  // Crear subcarpeta
  const folder = await drive.files.create({
    requestBody: {
      name: nombrePropiedad,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    },
    fields: 'id',
  });
  const carpetaId = folder.data.id!;

  const urls: string[] = [];
  const { Readable } = await import('stream');

  for (let i = 0; i < Math.min(imagenes.length, 30); i++) {
    try {
      const imgRes = await fetch(imagenes[i], {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.google.com' },
      });
      if (!imgRes.ok) continue;

      const buffer = await imgRes.arrayBuffer();
      const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
      const ext = imagenes[i].split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${String(i + 1).padStart(3, '0')}.${ext}`;

      const file = await drive.files.create({
        requestBody: { name: fileName, parents: [carpetaId] },
        media: { mimeType, body: Readable.from(Buffer.from(buffer)) },
        fields: 'id',
      });

      // Hacer pública la imagen
      await drive.permissions.create({
        fileId: file.data.id!,
        requestBody: { role: 'reader', type: 'anyone' },
      });

      const publicUrl = `/api/drive?id=${file.data.id}`;
      urls.push(publicUrl);
      console.log(`[Ingestion] Imagen ${i + 1}/${Math.min(imagenes.length, 30)} subida`);
    } catch (e: any) {
      console.error(`[Ingestion] Error imagen ${i}: ${e.message}`);
    }
  }

  return urls;
}

// 4. INSERTAR EN SUPABASE
async function insertarPropiedad(datos: any, descripcion: { es: string; en: string }, galeriaUrls: string[], slug: string) {
  const supabase = getSupabase();

  const { data, error } = await supabase.from('properties').insert({
    slug,
    titulo: { es: datos.titulo, en: datos.titulo, fr: datos.titulo, ru: datos.titulo },
    descripcion: { es: descripcion.es, en: descripcion.en, fr: descripcion.es, ru: descripcion.es },
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
  }).select().single();

  if (error) throw new Error(error.message);
  console.log(`[Ingestion] Propiedad insertada en Supabase: ${data.id}`);
  return data;
}

// FLUJO COMPLETO
export async function ingerirPropiedad(url: string, slug?: string): Promise<{
  success: boolean;
  propiedadId?: string;
  galeriaUrls?: string[];
  copyReel?: string;
  error?: string;
}> {
  try {
    console.log(`[Ingestion] Iniciando ingesta de: ${url}`);

    // 1. Extraer datos
    const datos = await extraerDatosPropiedad(url);

    // 2. Generar slug si no se proporciona
    const slugFinal = slug || datos.titulo
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60);

    // 3. Generar descripción y subir imágenes en paralelo
    const [descripcion, galeriaUrls] = await Promise.all([
      generarDescripcion(datos),
      subirImagenesDrive(datos.imagenes, datos.titulo),
    ]);

    // 4. Insertar en Supabase
    const propiedad = await insertarPropiedad(datos, descripcion, galeriaUrls, slugFinal);

    console.log(`[Ingestion] ✅ Flujo completado para ${datos.titulo}`);

    return {
      success: true,
      propiedadId: propiedad.id,
      galeriaUrls,
      copyReel: undefined,
    };

  } catch (error: any) {
    console.error('[Ingestion] Error:', error.message);
    return { success: false, error: error.message };
  }
}
