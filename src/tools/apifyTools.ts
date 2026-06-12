import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

export interface ReelAnalysis {
 url: string;
 username: string;
 likes: number;
 comments: number;
 views: number;
 caption: string;
 timestamp: string;
 hashtags: string[];
 score?: number;
}

export async function scrapeInstagramReels(username: string, maxReels = 10): Promise<ReelAnalysis[]> {
 const apiKey = process.env.APIFY_API_KEY;
 if (!apiKey) throw new Error('Falta APIFY_API_KEY en .env.local');

 console.log(`[Apify] Scraping reels de @${username}...`);

 // Lanzar el actor de Instagram Scraper
 const runRes = await fetch('https://api.apify.com/v2/acts/apify~instagram-scraper/runs', {
   method: 'POST',
   headers: {
     'Content-Type': 'application/json',
     'Authorization': `Bearer ${apiKey}`,
   },
   body: JSON.stringify({
     directUrls: [`https://www.instagram.com/${username}/`],
     resultsType: 'posts',
     resultsLimit: maxReels,
     onlyPostsWithHashtag: '',
     searchType: 'user',
     searchLimit: maxReels,
   }),
 });

 if (!runRes.ok) throw new Error(`Apify error: ${runRes.status}`);
 const run = await runRes.json();
 const runId = run.data?.id;
 if (!runId) throw new Error('No se obtuvo runId de Apify');

 console.log(`[Apify] Run iniciado: ${runId} — esperando resultados...`);

 // Esperar a que termine el run (polling cada 3 segundos, máx 60s)
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

 // Obtener resultados del dataset
 const dataRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items`, {
   headers: { 'Authorization': `Bearer ${apiKey}` },
 });
 const data = await dataRes.json();

 return (data || []).map((item: any): ReelAnalysis => ({
   url: item.url || item.shortCode ? `https://www.instagram.com/reel/${item.shortCode}/` : '',
   username: item.ownerUsername || username,
   likes: item.likesCount || 0,
   comments: item.commentsCount || 0,
   views: item.videoViewCount || item.videoPlayCount || 0,
   caption: item.caption || '',
   timestamp: item.timestamp || '',
   hashtags: item.hashtags || [],
 }));
}

export async function analizarReelsConGemini(reels: ReelAnalysis[], contexto: string): Promise<string> {
 const geminiKey = process.env.GEMINI_API_KEY;
 if (!geminiKey) throw new Error('Falta GEMINI_API_KEY');

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
1. PATRONES QUE FUNCIONAN — qué tienen en común los reels con más views/engagement
2. HOOKS MÁS EFECTIVOS — cómo empiezan los mejores reels
3. HASHTAGS CLAVE — los más recurrentes en posts con alto engagement
4. OPORTUNIDADES — qué hace la competencia mal que tú puedes hacer mejor
5. RECOMENDACIONES CONCRETAS — 3 ideas de reels para The Edit Marbella basadas en este análisis

Sé específico y accionable. No generalices.`;

 const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({
     contents: [{ role: 'user', parts: [{ text: prompt }] }],
     generationConfig: { maxOutputTokens: 2000, temperature: 0.7 },
   }),
 });

 const data = await res.json();
 return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin análisis disponible';
}

export async function analizarCompetencia(username: string, maxReels = 10): Promise<{ reels: ReelAnalysis[]; analisis: string }> {
 const reels = await scrapeInstagramReels(username, maxReels);
 console.log(`[Apify] ${reels.length} reels obtenidos de @${username}`);
 const analisis = await analizarReelsConGemini(reels, 'The Edit Marbella — agencia inmobiliaria de lujo en Marbella');
 return { reels, analisis };
}
