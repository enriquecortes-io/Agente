// ═══════════════════════════════════════════════════════════════
// PRODUCCIÓN — del guion ganador al reel montado
// 1. Lee el material de una carpeta de Drive
// 2. Cataloga visualmente cada foto/clip con IA (una sola vez)
// 3. Empareja el catálogo con los planos del guion → plan de montaje
// ═══════════════════════════════════════════════════════════════
import { google } from 'googleapis';
import { getSupabase, llm, parseJSON, BRAND_CONTEXT, type Marca } from './reelIntelTools.js';

export interface ArchivoDrive {
  drive_file_id: string;
  nombre: string;
  mime: string;
  es_video: boolean;
  thumbnail_url: string | null;
}

export interface MediaCatalogada extends ArchivoDrive {
  id: string;
  descripcion: string | null;
  estancia: string | null;
  tipo_plano: string | null;
  momento_dia: string | null;
  calidad: number | null;
  etiquetas: string[];
}

/**
 * Cuenta de servicio: no caduca nunca, pero solo ve lo que se le haya
 * compartido. Es la vía preferente; OAuth queda como alternativa porque
 * sus refresh tokens mueren si la pantalla de consentimiento está en
 * modo "Testing".
 */
function getDriveServicio() {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) return null;
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: key.replace(/\\n/g, '\n') },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth: auth as any });
}

function getDriveOAuth() {
  const { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_REFRESH_TOKEN) return null;
  const auth = new google.auth.OAuth2(GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: GOOGLE_OAUTH_REFRESH_TOKEN });
  return google.drive({ version: 'v3', auth });
}

let driveActivo: any = null;

function getDrive() {
  return driveActivo || getDriveServicio() || getDriveOAuth();
}

/** Acepta tanto un id suelto como la URL completa de la carpeta de Drive. */
export function extraerCarpetaId(entrada: string): string {
  const m = entrada.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return (m ? m[1] : entrada).trim();
}

/**
 * Prueba cada vía de acceso y se queda con la primera que vea archivos, para
 * que un refresh token caducado no bloquee si la cuenta de servicio sí tiene
 * acceso (y al revés).
 */
export async function listarCarpeta(carpetaId: string): Promise<ArchivoDrive[]> {
  const vias: [string, any][] = [['cuenta de servicio', getDriveServicio()], ['OAuth', getDriveOAuth()]];
  const fallos: string[] = [];

  for (const [nombre, drive] of vias) {
    if (!drive) continue;
    try {
      const archivos = await listarCon(drive, carpetaId);
      if (archivos.length) {
        driveActivo = drive;
        return archivos;
      }
      fallos.push(`${nombre}: sin acceso o carpeta vacía`);
    } catch (e: any) {
      fallos.push(`${nombre}: ${e.message}`);
    }
  }

  const cuenta = process.env.GOOGLE_CLIENT_EMAIL;
  throw new Error(
    `No se pudo leer la carpeta de Drive (${fallos.join(' | ')}). ` +
    (cuenta ? `Comparte la carpeta con ${cuenta} como lector.` : 'Falta configurar el acceso a Drive.'),
  );
}

async function listarCon(drive: any, carpetaId: string): Promise<ArchivoDrive[]> {
  const archivos: ArchivoDrive[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${carpetaId}' in parents and trashed=false and (mimeType contains 'image/' or mimeType contains 'video/')`,
      fields: 'nextPageToken, files(id, name, mimeType, thumbnailLink)',
      pageSize: 200,
      pageToken,
      // Sin estos tres flags, las unidades compartidas devuelven una lista vacía.
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
    });
    for (const f of res.data.files || []) {
      if (!f.id) continue;
      archivos.push({
        drive_file_id: f.id,
        nombre: f.name || f.id,
        mime: f.mimeType || '',
        es_video: (f.mimeType || '').startsWith('video/'),
        thumbnail_url: f.thumbnailLink || null,
      });
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return archivos;
}

/**
 * Descarga una versión reducida para que la IA la mire. Las fotos originales
 * pesan varios MB y no hace falta resolución para reconocer una estancia.
 */
async function descargarParaAnalisis(a: ArchivoDrive): Promise<string | null> {
  if (a.thumbnail_url) {
    const grande = a.thumbnail_url.replace(/=s\d+$/, '=s1024');
    const res = await fetch(grande);
    if (res.ok) return Buffer.from(await res.arrayBuffer()).toString('base64');
  }
  try {
    const drive = getDrive();
    if (!drive) return null;
    const res = await drive.files.get(
      { fileId: a.drive_file_id, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' },
    );
    return Buffer.from(res.data as ArrayBuffer).toString('base64');
  } catch {
    return null;
  }
}

async function geminiVision(prompt: string, imagenes: { mime: string; data: string }[], maxTokens = 4000): Promise<string> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Falta GOOGLE_GENERATIVE_AI_API_KEY/GEMINI_API_KEY para analizar imágenes');
  const modelo = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  const partes: any[] = [{ text: prompt }];
  for (const img of imagenes) partes.push({ inlineData: { mimeType: img.mime, data: img.data } });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: partes }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2, responseMimeType: 'application/json' },
      }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini visión ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  const salida = (data.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
  if (!salida) throw new Error('Gemini visión no devolvió texto');
  return salida;
}

/**
 * Cataloga el material que aún no se haya analizado. Devuelve cuántas fichas
 * nuevas ha creado. Por lotes, porque una llamada por foto agotaría la cuota.
 */
export async function catalogarLote(carpetaId: string, tam = 8): Promise<{ analizadas: number; pendientes: number }> {
  const supabase = getSupabase();

  const archivos = await listarCarpeta(carpetaId);
  if (!archivos.length) throw new Error('La carpeta de Drive está vacía o la cuenta no tiene acceso');

  await supabase.from('propiedad_media').upsert(
    archivos.map(a => ({ ...a, carpeta_id: carpetaId })),
    { onConflict: 'drive_file_id', ignoreDuplicates: true },
  );

  const { data: pendientes } = await supabase
    .from('propiedad_media')
    .select('*')
    .eq('carpeta_id', carpetaId)
    .eq('analizado', false)
    .limit(tam);

  const lote = (pendientes || []) as MediaCatalogada[];
  if (!lote.length) {
    const { count } = await supabase.from('propiedad_media')
      .select('id', { count: 'exact', head: true })
      .eq('carpeta_id', carpetaId).eq('analizado', false);
    return { analizadas: 0, pendientes: count || 0 };
  }

  const imagenes: { mime: string; data: string }[] = [];
  const incluidos: MediaCatalogada[] = [];
  for (const m of lote) {
    if (m.es_video) continue; // los vídeos se catalogan por nombre, no se analizan frame a frame
    const data = await descargarParaAnalisis(m);
    if (!data) continue;
    imagenes.push({ mime: 'image/jpeg', data });
    incluidos.push(m);
  }

  if (incluidos.length) {
    const salida = await geminiVision(
      `Eres director de fotografía de una agencia inmobiliaria de lujo. Vas a ver ${incluidos.length} imágenes de una misma propiedad, en orden.
Para cada una, describe qué muestra para poder elegirla después al montar un reel.

Devuelve SOLO un array JSON con ${incluidos.length} objetos, uno por imagen y en el mismo orden:
[{
  "descripcion": "una frase: qué se ve y qué la hace atractiva",
  "estancia": "fachada | salón | cocina | dormitorio | baño | piscina | terraza | jardín | vistas | detalle | otro",
  "tipo_plano": "general | medio | detalle | aéreo",
  "momento_dia": "día | atardecer | noche | indeterminado",
  "calidad": 1-5 (cuánto impacta visualmente para abrir o cerrar un reel),
  "etiquetas": ["palabras clave"]
}]`,
      imagenes,
    );
    const fichas = parseJSON<any[]>(salida);

    for (let i = 0; i < incluidos.length; i++) {
      const f = fichas[i] || {};
      await supabase.from('propiedad_media').update({
        descripcion: f.descripcion ?? null,
        estancia: f.estancia ?? null,
        tipo_plano: f.tipo_plano ?? null,
        momento_dia: f.momento_dia ?? null,
        calidad: typeof f.calidad === 'number' ? f.calidad : null,
        etiquetas: f.etiquetas || [],
        analizado: true,
      }).eq('id', incluidos[i].id);
    }
  }

  // Lo que no se pudo descargar o es vídeo se marca igualmente para no reintentarlo en bucle
  const noAnalizados = lote.filter(m => !incluidos.find(i => i.id === m.id));
  for (const m of noAnalizados) {
    await supabase.from('propiedad_media').update({
      analizado: true,
      descripcion: m.es_video ? `Clip de vídeo: ${m.nombre}` : null,
    }).eq('id', m.id);
  }

  const { count } = await supabase.from('propiedad_media')
    .select('id', { count: 'exact', head: true })
    .eq('carpeta_id', carpetaId).eq('analizado', false);

  return { analizadas: incluidos.length, pendientes: count || 0 };
}

/**
 * Cruza los planos del guion con el catálogo y decide qué archivo va en cada
 * plano. Es razonamiento sobre texto: el trabajo visual ya se hizo al catalogar.
 */
export async function emparejarGuion(produccionId: string) {
  const supabase = getSupabase();

  const { data: prod } = await supabase.from('producciones').select('*').eq('id', produccionId).single();
  if (!prod) throw new Error('Producción no encontrada');

  const { data: guion } = await supabase.from('contenido_plan').select('*').eq('id', prod.guion_id).single();
  if (!guion) throw new Error('Guion no encontrado');

  const { data: media } = await supabase
    .from('propiedad_media')
    .select('*')
    .eq('carpeta_id', prod.carpeta_id)
    .eq('analizado', true)
    .not('descripcion', 'is', null);

  const catalogo = (media || []) as MediaCatalogada[];
  if (!catalogo.length) throw new Error('No hay material catalogado para esta carpeta');

  const listado = catalogo.map((m, i) =>
    `${i}: [${m.estancia} · ${m.tipo_plano} · ${m.momento_dia} · calidad ${m.calidad}${m.es_video ? ' · VÍDEO' : ''}] ${m.descripcion}`,
  ).join('\n');

  const planos = (guion.guion || []) as any[];

  const salida = await llm(
    `Eres montador de reels inmobiliarios. Eliges qué material real usar en cada plano de un guion. Respondes SOLO con JSON válido.`,
    `Marca:\n${BRAND_CONTEXT[prod.marca as Marca]}

Guion "${guion.titulo}" (${guion.formato}, ${guion.duracion_seg ?? 20}s):
${planos.map((p, i) => `plano ${i}: [${p.seg}] ${p.plano} | texto en pantalla: "${p.texto_pantalla || ''}" | voz: "${p.voz || ''}"`).join('\n')}

Material disponible de la propiedad (índice: [estancia · tipo · momento · calidad] descripción):
${listado}

Reglas:
- Sé breve en los textos: una respuesta larga se corta y se pierde entera.
- Usa el índice del material, nunca inventes uno que no esté en la lista.
- El plano de apertura necesita el material de más impacto (calidad 5).
- No repitas el mismo material en dos planos salvo que no haya alternativa.
- Si un plano necesita algo que no existe en el material, indícalo en "falta".
- Las duraciones deben sumar aproximadamente la duración del guion.

Devuelve JSON:
{
  "planos": [{
    "plano": 0,
    "media": 12,
    "duracion_seg": 3.5,
    "movimiento": "push-in | push-out | paneo izquierda | paneo derecha | estático",
    "texto_pantalla": "texto exacto a superponer, o null",
    "voz": "texto exacto a narrar, o null",
    "motivo": "máximo 10 palabras"
  }],
  "falta": ["qué material haría falta y no existe"],
  "portada": 12
}`,
    8000,
  );

  const plan = parseJSON<any>(salida);
  // Resuelve los índices a archivos reales para que el montaje no dependa del orden del catálogo
  plan.planos = (plan.planos || []).map((p: any) => {
    const m = catalogo[p.media];
    return { ...p, drive_file_id: m?.drive_file_id ?? null, nombre: m?.nombre ?? null, descripcion_media: m?.descripcion ?? null };
  });
  plan.portada_file_id = catalogo[plan.portada]?.drive_file_id ?? null;

  await supabase.from('producciones').update({
    plan_montaje: plan,
    estado: 'emparejado',
    paso: 'Material emparejado con el guion',
    actualizado_at: new Date().toISOString(),
  }).eq('id', produccionId);

  return plan;
}

export async function marcarPasoProduccion(id: string, paso: string) {
  try {
    await getSupabase().from('producciones')
      .update({ paso, actualizado_at: new Date().toISOString() }).eq('id', id);
  } catch { /* el progreso no debe tumbar el pipeline */ }
}

export async function cerrarProduccionConError(id: string, detalle: string) {
  try {
    await getSupabase().from('producciones')
      .update({ estado: 'error', error: detalle, actualizado_at: new Date().toISOString() }).eq('id', id);
  } catch { /* ídem */ }
}
