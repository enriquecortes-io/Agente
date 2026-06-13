import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env.local' });

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
  );
}

export interface ReelAnalysis {
  url: string;
  username: string;
  likes: number;
  comments: number;
  views: number;
  caption: string;
  timestamp: string;
  hashtags: string[];
}

export async function scrapeInstagramReels(username: string, maxReels = 10): Promise<ReelAnalysis[]> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) throw new Error('Falta APIFY_API_KEY en .env.local');

  const esUrl = username.startsWith('http');
  const payload = esUrl
    ? { directUrls: [username], resultsType: 'posts', resultsLimit: maxReels }
    : { directUrls: [`https://www.instagram.com/${username}/`], resultsType: 'posts', resultsLimit: maxReels, searchType: 'user', searchLimit: maxReels };

  console.log(`[Apify] Scraping @${username}...`);

  const runRes = await fetch('https://api.apify.com/v2/acts/apify~instagram-scraper/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });

  if (!runRes.ok) throw new Error(`Apify error: ${runRes.status}`);
  const run = await runRes.json();
  const runId = run.data?.id;
  if (!runId) throw new Error('No se obtuvo runId de Apify');

  console.log(`[Apify] Run: ${runId}`);

  let intentos = 0;
  while (intentos < 20) {
    await new Promise(r => setTimeout(r, 3000));
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const status = await statusRes.json();
    const state = status.data?.status;
    console.log(`[Apify] Estado: ${state}`);
    if (state === 'SUCCEEDED') break;
    if (state === 'FAILED' || state === 'ABORTED') throw new Error(`Run ${state}`);
    intentos++;
  }

  const dataRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  const data = await dataRes.json();

  return (data || []).map((item: any): ReelAnalysis => ({
    url: item.url || (item.shortCode ? `https://www.instagram.com/reel/${item.shortCode}/` : ''),
    username: item.ownerUsername || username,
    likes: item.likesCount || 0,
    comments: item.commentsCount || 0,
    views: item.videoViewCount || item.videoPlayCount || 0,
    caption: item.caption || '',
    timestamp: item.timestamp || '',
    hashtags: item.hashtags || [],
  }));
}

export async function analizarReelsConNvidia(reels: ReelAnalysis[], contexto: string): Promise<string> {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (!nvidiaKey) throw new Error('Falta NVIDIA_API_KEY');

  const resumen = reels.map((r, i) =>
    `Reel ${i+1}: @${r.username}\n` +
    `Views: ${r.views.toLocaleString()} | Likes: ${r.likes.toLocaleString()} | Comentarios: ${r.comments}\n` +
    `Caption: ${r.caption.slice(0, 200)}\n` +
    `Hashtags: ${r.hashtags.slice(0, 10).join(', ')}\n`
  ).join('\n---\n');

  const prompt = `Eres un experto en marketing de lujo inmobiliario en la Costa del Sol.

Analiza estos reels de Instagram de la competencia y extrae aprendizajes accionables para ${contexto}.

DATOS DE REELS:
${resumen}

Proporciona:
1. PATRONES QUE FUNCIONAN
2. HOOKS MAS EFECTIVOS
3. HASHTAGS CLAVE
4. OPORTUNIDADES
5. RECOMENDACIONES CONCRETAS para The Edit Marbella

Se especifico y accionable.`;

  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${nvidiaKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'meta/llama-3.3-70b-instruct',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.7,
    }),
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content || 'Sin analisis disponible';
}

export async function guardarAnalisisCompetencia(username: string, reels: ReelAnalysis[], analisis: string) {
  const supabase = getSupabase();

  const hashtagMatches = analisis.match(/#\w+/g) || [];
  const hashtags = [...new Set(hashtagMatches)];

  const { error } = await supabase.from('competencia_analisis').insert({
    username,
    reels_analizados: reels.length,
    analisis_raw: analisis,
    hashtags: { lista: hashtags },
  });

  if (error) console.error('[Supabase] Error guardando análisis:', error.message);
  else console.log(`[Supabase] Análisis de @${username} guardado`);

  // Guardar hashtags en marketing_conocimiento
  for (const h of hashtags) {
    const { data: existing } = await supabase
      .from('marketing_conocimiento')
      .select('id, veces_visto')
      .eq('categoria', 'hashtag')
      .eq('contenido', h)
      .limit(1);

    if (existing?.length) {
      await supabase.from('marketing_conocimiento')
        .update({ veces_visto: (existing[0].veces_visto || 1) + 1, updated_at: new Date().toISOString() })
        .eq('id', existing[0].id);
    } else {
      await supabase.from('marketing_conocimiento').insert({ categoria: 'hashtag', contenido: h, fuente: username, veces_visto: 1 });
    }
  }

  console.log(`[Supabase] ${hashtags.length} hashtags actualizados`);
}

export async function analizarCompetencia(username: string, maxReels = 10): Promise<{ reels: ReelAnalysis[]; analisis: string }> {
  const reels = await scrapeInstagramReels(username, maxReels);
  console.log(`[Apify] ${reels.length} reels obtenidos de @${username}`);
  const analisis = await analizarReelsConNvidia(reels, 'The Edit Marbella — agencia inmobiliaria de lujo en Marbella');
  return { reels, analisis };
}

export async function analizarYGuardar(username: string, maxReels = 10) {
  const { reels, analisis } = await analizarCompetencia(username, maxReels);
  await guardarAnalisisCompetencia(username, reels, analisis);
  return { reels, analisis };
}
