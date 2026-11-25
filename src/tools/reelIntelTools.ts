// ═══════════════════════════════════════════════════════════════
// REEL INTEL — une Análisis de competencia + Contenido
// 1. Scrapea reels de cuentas/hashtags (Apify)
// 2. Puntúa cada reel frente a lo normal en su cuenta (outlier score)
// 3. Claude desglosa los mejores reels (gancho, formato, estructura)
// 4. Claude extrae patrones y genera un plan de guiones replicables
// ═══════════════════════════════════════════════════════════════
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type Marca = 'tem' | 'solena' | 'smc';

export interface Fuente {
  id: string;
  marca: Marca;
  tipo: 'cuenta' | 'hashtag' | 'zona';
  valor: string;
  activa: boolean;
  origen?: 'manual' | 'auto';
}

export interface ReelRow {
  id?: string;
  short_code: string;
  url: string;
  owner: string;
  fuente_id: string | null;
  marca: Marca;
  caption: string;
  hashtags: string[];
  views: number;
  likes: number;
  comments: number;
  duracion_seg: number | null;
  publicado_at: string | null;
  thumbnail_url: string | null;
  outlier_score?: number;
  engagement_rate?: number;
  analisis?: any;
}

export const BRAND_CONTEXT: Record<Marca, string> = {
  tem: `The Edit Marbella (TEM): agencia inmobiliaria ultra-lujo en Marbella / Golden Triangle (Golden Mile, Sierra Blanca, La Zagaleta, Nueva Andalucía, Benahavís). Público: compradores UHNW/HNW internacionales (UK, norte de Europa, Oriente Medio, LatAm). Tono editorial, discreto, aspiracional; nunca vendedor ni chillón. Idioma principal del contenido: inglés, con versión en español cuando aporte.`,
  solena: `Solena Inmobiliaria: marca accesible en la Costa del Sol para compradores españoles que buscan primera vivienda o vivienda habitual. Tono cercano, didáctico y de confianza; resuelve dudas (hipoteca, gastos, ITP, arras, Nota Simple). Idioma: español.`,
  smc: `SMC: proyecto de marketing/AdOps inmobiliario. Tono profesional y orientado a resultados. Idioma: español.`,
};

export function getSupabase(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// ─── 1. SCRAPING ────────────────────────────────────────────────

/**
 * Deriva hashtags semilla a partir de una zona libre ("Marbella", "Costa del Sol")
 * para poder rastrear el sector en esa zona sin que el usuario tenga que
 * buscar o teclear cuentas de competidores concretas.
 */
export function hashtagsDeZona(zona: string): string[] {
  const slug = zona
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!slug) return [];
  return [...new Set([
    slug,
    `${slug}realestate`,
    `${slug}inmobiliaria`,
    `luxury${slug}`,
  ])];
}

async function scrapeUrl(url: string, resultsType: 'reels' | 'posts', limite: number): Promise<any[]> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) throw new Error('Falta APIFY_API_KEY');

  const payload = { directUrls: [url], resultsType, resultsLimit: limite, addParentData: false };

  // Endpoint síncrono: lanza el actor y devuelve los items (máx. ~5 min)
  const res = await fetch(
    'https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?timeout=240',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function itemsAReels(items: any[], fuente: Fuente): ReelRow[] {
  return (items || [])
    .filter(i => i && !i.error && (i.type === 'Video' || i.productType === 'clips'))
    .map((i): ReelRow => ({
      short_code: i.shortCode,
      url: i.url || `https://www.instagram.com/reel/${i.shortCode}/`,
      owner: (i.ownerUsername || fuente.valor).toLowerCase(),
      fuente_id: fuente.id,
      marca: fuente.marca,
      caption: (i.caption || '').slice(0, 4000),
      hashtags: (i.hashtags || []).slice(0, 30),
      views: Number(i.videoPlayCount || i.videoViewCount || 0),
      likes: Math.max(0, Number(i.likesCount || 0)), // IG devuelve -1 si están ocultos
      comments: Number(i.commentsCount || 0),
      duracion_seg: i.videoDuration ? Math.round(Number(i.videoDuration)) : null,
      publicado_at: i.timestamp || null,
      thumbnail_url: i.displayUrl || null,
    }))
    .filter(r => r.short_code);
}

export async function scrapeFuente(fuente: Fuente, limite = 30): Promise<ReelRow[]> {
  if (fuente.tipo === 'cuenta') {
    const url = `https://www.instagram.com/${fuente.valor.replace(/^@/, '')}/`;
    return itemsAReels(await scrapeUrl(url, 'reels', limite), fuente);
  }

  if (fuente.tipo === 'hashtag') {
    const url = `https://www.instagram.com/explore/tags/${fuente.valor.replace(/^#/, '')}/`;
    return itemsAReels(await scrapeUrl(url, 'posts', limite), fuente);
  }

  // tipo 'zona': rastrea varios hashtags derivados de la zona y combina resultados.
  // Así se descubren reels (y, de ahí, cuentas) relevantes en una zona sin
  // que el usuario tenga que localizar competidores uno a uno.
  const tags = hashtagsDeZona(fuente.valor);
  const porTag = Math.max(10, Math.ceil(limite / Math.max(tags.length, 1)));
  const vistos = new Set<string>();
  const reels: ReelRow[] = [];
  for (const tag of tags) {
    const url = `https://www.instagram.com/explore/tags/${tag}/`;
    let items: any[] = [];
    try { items = await scrapeUrl(url, 'posts', porTag); } catch (e: any) {
      console.error(`[ReelIntel] Error rastreando zona "${fuente.valor}" vía #${tag}:`, e.message);
      continue;
    }
    for (const r of itemsAReels(items, fuente)) {
      if (vistos.has(r.short_code)) continue;
      vistos.add(r.short_code);
      reels.push(r);
    }
  }
  return reels.slice(0, limite);
}

/**
 * A partir de reels descubiertos vía hashtag/zona (no vía una cuenta ya
 * conocida), registra automáticamente como nuevas fuentes tipo 'cuenta'
 * (origen 'auto') a los perfiles que más impacto tuvieron, para que el
 * sistema los siga vigilando por su cuenta en próximas ejecuciones.
 * Limitado a `maxNuevas` por ejecución para no crecer sin control.
 */
export async function descubrirCuentas(fuente: Fuente, reels: ReelRow[], maxNuevas = 5): Promise<number> {
  if (fuente.tipo === 'cuenta' || !reels.length) return 0;
  const supabase = getSupabase();

  const porCuenta = new Map<string, number>();
  for (const r of reels) porCuenta.set(r.owner, Math.max(porCuenta.get(r.owner) || 0, r.views));
  const candidatas = [...porCuenta.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxNuevas)
    .map(([owner]) => owner);
  if (!candidatas.length) return 0;

  const { data, error } = await supabase.from('ig_fuentes')
    .upsert(
      candidatas.map(valor => ({ marca: fuente.marca, tipo: 'cuenta' as const, valor, activa: true, origen: 'auto' as const })),
      { onConflict: 'marca,tipo,valor', ignoreDuplicates: true },
    )
    .select('id');
  if (error) throw new Error(`Supabase ig_fuentes (descubrir): ${error.message}`);
  return data?.length || 0;
}

export async function guardarReels(reels: ReelRow[]) {
  if (!reels.length) return 0;
  const supabase = getSupabase();
  // Upsert: si el reel ya existe, actualiza métricas (no pisa el análisis)
  const { error } = await supabase.from('ig_reels').upsert(
    reels.map(r => ({ ...r, scraped_at: new Date().toISOString() })),
    { onConflict: 'short_code', ignoreDuplicates: false },
  );
  if (error) throw new Error(`Supabase ig_reels: ${error.message}`);
  return reels.length;
}

// ─── 2. SCORING ─────────────────────────────────────────────────

function mediana(nums: number[]): number {
  const v = nums.filter(n => n > 0).sort((a, b) => a - b);
  if (!v.length) return 0;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * outlier_score = views del reel / mediana de views de su cuenta.
 * Así un reel de 40k en una cuenta que suele hacer 4k (x10) puntúa
 * más que uno de 100k en una cuenta que siempre hace 100k (x1).
 * Si la cuenta tiene <4 reels en BD, se compara con la mediana de la marca.
 */
export async function recalcularScores(marca: Marca) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('ig_reels')
    .select('id, owner, views, likes, comments')
    .eq('marca', marca)
    .limit(5000);
  if (error) throw new Error(error.message);
  const rows = data || [];

  const porCuenta = new Map<string, number[]>();
  rows.forEach(r => {
    const arr = porCuenta.get(r.owner) || [];
    arr.push(Number(r.views));
    porCuenta.set(r.owner, arr);
  });
  const medianaMarca = mediana(rows.map(r => Number(r.views))) || 1;

  const updates = rows.map(r => {
    const vistas = porCuenta.get(r.owner) || [];
    const base = vistas.length >= 4 ? mediana(vistas) || medianaMarca : medianaMarca;
    const views = Number(r.views);
    return {
      id: r.id,
      outlier_score: Number((views / base).toFixed(2)),
      engagement_rate: views > 0 ? Number(((Number(r.likes) + Number(r.comments)) / views).toFixed(4)) : 0,
    };
  });

  for (let i = 0; i < updates.length; i += 200) {
    const lote = updates.slice(i, i + 200);
    await Promise.all(lote.map(u =>
      supabase.from('ig_reels').update({ outlier_score: u.outlier_score, engagement_rate: u.engagement_rate }).eq('id', u.id),
    ));
  }
  return updates.length;
}

export async function topReels(marca: Marca, n = 12, soloSinAnalizar = false, dias = 120) {
  const supabase = getSupabase();
  const desde = new Date(Date.now() - dias * 864e5).toISOString();
  let q = supabase
    .from('ig_reels')
    .select('*')
    .eq('marca', marca)
    .gte('publicado_at', desde)
    .gte('views', 1000) // descarta ruido
    .order('outlier_score', { ascending: false })
    .limit(n);
  if (soloSinAnalizar) q = q.eq('analizado', false);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as ReelRow[];
}

// ─── 3. LLM (Claude, con NVIDIA de respaldo) ───────────────────

type Content = string | Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'url'; url: string } }>;

export async function llm(system: string, content: Content, maxTokens = 4000): Promise<string> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content }],
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Claude ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    return (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  }

  // Respaldo: NVIDIA (solo texto)
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (!nvidiaKey) throw new Error('Falta ANTHROPIC_API_KEY (o NVIDIA_API_KEY)');
  const texto = typeof content === 'string'
    ? content
    : content.filter(c => c.type === 'text').map(c => (c as any).text).join('\n');
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${nvidiaKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'meta/llama-3.3-70b-instruct',
      messages: [{ role: 'system', content: system }, { role: 'user', content: texto }],
      max_tokens: maxTokens,
      temperature: 0.5,
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export function parseJSON<T = any>(texto: string): T {
  const limpio = texto.replace(/```json|```/g, '').trim();
  try { return JSON.parse(limpio); } catch { /* sigue */ }
  const ini = limpio.search(/[\[{]/);
  const fin = Math.max(limpio.lastIndexOf('}'), limpio.lastIndexOf(']'));
  if (ini >= 0 && fin > ini) return JSON.parse(limpio.slice(ini, fin + 1));
  throw new Error('La respuesta del modelo no es JSON válido');
}

function resumenReel(r: ReelRow) {
  return [
    `@${r.owner} — ${r.url}`,
    `Views ${r.views.toLocaleString('es-ES')} | x${r.outlier_score} sobre su media | likes ${r.likes} | coment. ${r.comments} | ER ${((r.engagement_rate || 0) * 100).toFixed(1)}%`,
    `Duración: ${r.duracion_seg ?? '?'} s | Publicado: ${r.publicado_at?.slice(0, 10) ?? '?'}`,
    `Caption: ${r.caption.slice(0, 600)}`,
  ].join('\n');
}

// ─── 3a. Desglose individual de cada reel ganador ───────────────

export async function analizarReel(r: ReelRow) {
  const system = `Eres un estratega de contenido en Instagram especializado en real estate. Desglosas por qué un reel funcionó para poder replicarlo. Respondes SOLO con JSON válido.`;
  const texto = `Analiza este reel que rindió muy por encima de lo normal en su cuenta. La imagen es su portada/primer frame.

${resumenReel(r)}

Devuelve JSON:
{
  "gancho": "qué ocurre/se dice en los 3 primeros segundos (deducido de portada y caption)",
  "tipo_gancho": "pregunta | precio | curiosidad | contraste | POV | dato | polémica | otro",
  "formato": "tour POV | precio reveal | antes/después | talking head | lista | storytelling | lifestyle | otro",
  "estructura": ["paso 1", "paso 2", "..."],
  "texto_en_pantalla": "estilo y uso de texto superpuesto",
  "emocion": "aspiración | curiosidad | FOMO | humor | confianza | otra",
  "cta": "llamada a la acción usada",
  "por_que_funciona": "2-3 frases",
  "replicable_con": "qué necesitaría una agencia para grabar algo equivalente"
}`;
  const content: Content = r.thumbnail_url
    ? [{ type: 'image', source: { type: 'url', url: r.thumbnail_url } }, { type: 'text', text: texto }]
    : texto;

  let salida: string;
  try {
    salida = await llm(system, content, 1500);
  } catch (e) {
    // Las URLs del CDN de Instagram caducan: reintenta sin imagen
    if (r.thumbnail_url) salida = await llm(system, texto, 1500);
    else throw e;
  }
  return parseJSON(salida);
}

export async function analizarTopReels(marca: Marca, n = 10) {
  const supabase = getSupabase();
  const reels = await topReels(marca, n, true);
  const resultados: { id: string; ok: boolean }[] = [];
  for (const r of reels) {
    try {
      const analisis = await analizarReel(r);
      await supabase.from('ig_reels').update({ analisis, analizado: true }).eq('id', r.id!);
      resultados.push({ id: r.id!, ok: true });
    } catch (e: any) {
      console.error(`[ReelIntel] Error analizando ${r.url}:`, e.message);
      resultados.push({ id: r.id!, ok: false });
    }
  }
  return resultados;
}

// ─── 3b. Patrones comunes entre los ganadores ───────────────────

export async function extraerPatrones(marca: Marca, n = 15) {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('ig_reels')
    .select('*')
    .eq('marca', marca)
    .eq('analizado', true)
    .order('outlier_score', { ascending: false })
    .limit(n);
  const reels = (data || []) as ReelRow[];
  if (!reels.length) throw new Error('No hay reels analizados todavía');

  const bloque = reels.map((r, i) => `### Reel ${i + 1}\n${resumenReel(r)}\nDesglose: ${JSON.stringify(r.analisis)}`).join('\n\n');

  const salida = await llm(
    `Eres director de contenido de una agencia inmobiliaria. Encuentras patrones repetibles entre reels ganadores. Respondes SOLO con JSON válido.`,
    `Contexto de la marca:\n${BRAND_CONTEXT[marca]}\n\nEstos son los reels que más han superado la media de su cuenta:\n\n${bloque}\n\nDevuelve JSON:
{
  "resumen": "3-4 frases con la conclusión principal",
  "ganchos_ganadores": [{"patron": "", "ejemplo": "", "frecuencia": 0}],
  "formatos_ganadores": [{"formato": "", "por_que": "", "reels": [1,2]}],
  "duracion_optima_seg": {"min": 0, "max": 0},
  "estructura_tipo": ["0-3s ...", "3-10s ...", "..."],
  "estilo_texto_pantalla": "",
  "ctas_que_funcionan": [""],
  "hashtags_recurrentes": [""],
  "evitar": [""],
  "adaptacion_a_marca": "cómo trasladar esto al tono de la marca sin copiar"
}`,
    3000,
  );
  const patrones = parseJSON(salida);
  const { data: fila, error } = await supabase
    .from('ig_patrones')
    .insert({ marca, patrones, reels_base: reels.map(r => r.id) })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return { id: fila.id as string, patrones };
}

// ─── 4. Plan de contenido replicable ────────────────────────────

export async function generarPlan(marca: Marca, patronId: string, nGuiones = 6, propiedades: string[] = []) {
  const supabase = getSupabase();
  const { data: patron } = await supabase.from('ig_patrones').select('*').eq('id', patronId).single();
  if (!patron) throw new Error('Patrón no encontrado');

  const { data: refs } = await supabase
    .from('ig_reels')
    .select('id, url, owner, outlier_score, analisis')
    .in('id', patron.reels_base || [])
    .order('outlier_score', { ascending: false })
    .limit(10);

  const salida = await llm(
    `Eres guionista de reels inmobiliarios. Escribes guiones listos para grabar con un iPhone, replicando la mecánica de reels ganadores pero con identidad propia. Respondes SOLO con JSON válido.`,
    `Marca:\n${BRAND_CONTEXT[marca]}

Patrones detectados:\n${JSON.stringify(patron.patrones)}

Reels de referencia (usa su "ref" para indicar en cuál se inspira cada guion):
${(refs || []).map((r, i) => `ref ${i}: @${r.owner} x${r.outlier_score} — ${r.analisis?.formato} — gancho: ${r.analisis?.gancho}`).join('\n')}
${propiedades.length ? `\nPropiedades disponibles para protagonizar los reels:\n${propiedades.join('\n')}` : ''}

Crea ${nGuiones} guiones distintos (varía formatos). Devuelve JSON array:
[{
  "titulo": "",
  "ref": 0,
  "formato": "",
  "gancho": "texto/acción exacta de los 3 primeros segundos",
  "duracion_seg": 0,
  "guion": [{"seg": "0-3", "plano": "qué se graba", "texto_pantalla": "", "voz": ""}],
  "caption": "caption completo con CTA",
  "hashtags": ["#..."],
  "propiedad_slug": null
}]`,
    6000,
  );
  const guiones = parseJSON<any[]>(salida);
  const filas = guiones.map(g => ({
    marca,
    patron_id: patronId,
    reel_referencia: refs?.[g.ref]?.id ?? null,
    titulo: g.titulo,
    formato: g.formato,
    gancho: g.gancho,
    guion: g.guion,
    caption: g.caption,
    hashtags: g.hashtags || [],
    duracion_seg: g.duracion_seg || null,
    propiedad_slug: g.propiedad_slug || null,
  }));
  const { error } = await supabase.from('contenido_plan').insert(filas);
  if (error) throw new Error(error.message);
  return filas.length;
}
