import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

function getDriveService() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  );
  auth.setCredentials({
    refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
  });
  return google.drive({ version: 'v3', auth });
}

// ─── Extrae imágenes de HTML estático (regex) ─────────────────────────────
function extraerImagenesDeHTML(html: string, urlBase: URL): string[] {
  const imageSet = new Set<string>();

  // src, data-src, data-lazy
  const srcMatches = html.matchAll(/(?:src|data-src|data-lazy)=[\"']([^\"']+\.(jpg|jpeg|png|webp|avif)[^\"']*)/gi);
  for (const m of srcMatches) {
    const imgUrl = m[1].startsWith('http') ? m[1] : `${urlBase.origin}${m[1].startsWith('/') ? '' : '/'}${m[1]}`;
    imageSet.add(imgUrl.split('?')[0]);
  }

  // srcset
  const srcsetMatches = html.matchAll(/srcset=[\"']([^\"']+)/gi);
  for (const m of srcsetMatches) {
    m[1].split(',').forEach(s => {
      const u = s.trim().split(' ')[0];
      if (u.match(/\.(jpg|jpeg|png|webp|avif)/i)) {
        const imgUrl = u.startsWith('http') ? u : `${urlBase.origin}${u.startsWith('/') ? '' : '/'}${u}`;
        imageSet.add(imgUrl.split('?')[0]);
      }
    });
  }

  // meta og:image y twitter:image (SPAs que renderizan en servidor o SSR parcial)
  const metaMatches = html.matchAll(/<meta[^>]+(?:property|name)=[\"'](?:og:image|twitter:image)[\"'][^>]+content=[\"']([^\"']+)[\"']/gi);
  for (const m of metaMatches) {
    if (m[1].match(/\.(jpg|jpeg|png|webp|avif)/i) || m[1].includes('/storage/') || m[1].includes('/images/')) {
      imageSet.add(m[1].split('?')[0]);
    }
  }
  // Variante: content antes de property
  const metaMatches2 = html.matchAll(/<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+(?:property|name)=[\"'](?:og:image|twitter:image)[\"']/gi);
  for (const m of metaMatches2) {
    if (m[1].match(/\.(jpg|jpeg|png|webp|avif)/i) || m[1].includes('/storage/') || m[1].includes('/images/')) {
      imageSet.add(m[1].split('?')[0]);
    }
  }

  return Array.from(imageSet).filter(u =>
    !u.includes('icon') && !u.includes('logo') && !u.includes('favicon') &&
    !u.includes('avatar') && !u.includes('spinner') && u.length > 20
  );
}

// ─── Fallback: Apify Playwright (renderiza JS) ────────────────────────────
async function extraerImagenesConApify(url: string): Promise<string[]> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) throw new Error('Falta APIFY_API_KEY');

  console.log('[ImageScraper] Usando Apify Playwright para renderizado JS...');

  const payload = {
    startUrls: [{ url }],
    pageFunction: `async function pageFunction(context) {
      const { page } = context;
      await page.waitForTimeout(3000);
      const images = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        const srcsets = Array.from(document.querySelectorAll('[srcset]'));
        const urls = new Set();
        imgs.forEach(img => {
          if (img.src) urls.add(img.src.split('?')[0]);
          if (img.dataset.src) urls.add(img.dataset.src.split('?')[0]);
          if (img.dataset.lazy) urls.add(img.dataset.lazy.split('?')[0]);
        });
        srcsets.forEach(el => {
          const ss = el.getAttribute('srcset') || '';
          ss.split(',').forEach(s => {
            const u = s.trim().split(' ')[0];
            if (u) urls.add(u.split('?')[0]);
          });
        });
        return Array.from(urls);
      });
      return { url, images };
    }`,
    maxRequestsPerCrawl: 1,
  };

  const runRes = await fetch('https://api.apify.com/v2/acts/apify~playwright-scraper/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });

  if (!runRes.ok) throw new Error(`Apify run error: ${runRes.status}`);
  const run = await runRes.json();
  const runId = run.data?.id;
  if (!runId) throw new Error('No se obtuvo runId de Apify');

  console.log(`[ImageScraper] Apify run: ${runId}`);

  // Esperar resultado (max 60s)
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const status = await statusRes.json();
    const state = status.data?.status;
    console.log(`[ImageScraper] Apify estado: ${state}`);
    if (state === 'SUCCEEDED') break;
    if (state === 'FAILED' || state === 'ABORTED') throw new Error(`Apify run ${state}`);
  }

  const dataRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  const data = await dataRes.json();
  const images: string[] = data?.[0]?.images || [];

  return images.filter(u =>
    u.match(/\.(jpg|jpeg|png|webp|avif)/i) &&
    !u.includes('icon') && !u.includes('logo') && !u.includes('favicon') &&
    !u.includes('avatar') && !u.includes('spinner') && u.length > 20
  );
}

// ─── Función principal ────────────────────────────────────────────────────
export async function extraerImagenesDeWeb(
  url: string,
  nombrePropiedad: string
): Promise<{ success: boolean; imagenes: number; carpetaId: string; error?: string }> {
  try {
    const drive = getDriveService();
    const parentFolderId = process.env.GOOGLE_FOLDER_IMAGENES!;

    // 1. Crear subcarpeta para la propiedad
    const folder = await drive.files.create({
      requestBody: {
        name: nombrePropiedad,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      },
      fields: 'id',
    });
    const carpetaId = folder.data.id!;
    console.log(`[ImageScraper] Carpeta creada: ${nombrePropiedad} (${carpetaId})`);

    // 2. Intentar fetch estático primero
    let imageUrls: string[] = [];

    const htmlRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    const html = await htmlRes.text();
    const urlBase = new URL(url);

    imageUrls = extraerImagenesDeHTML(html, urlBase);
    console.log(`[ImageScraper] HTML estático: ${imageUrls.length} imágenes`);

    // 3. Si hay pocas imágenes (SPA), usar Apify para renderizar JS
    if (imageUrls.length < 3 && process.env.APIFY_API_KEY) {
      console.log('[ImageScraper] Pocas imágenes en HTML estático → fallback a Apify JS rendering');
      try {
        const apifyUrls = await extraerImagenesConApify(url);
        console.log(`[ImageScraper] Apify: ${apifyUrls.length} imágenes`);
        // Combinar ambas listas (eliminar duplicados)
        const merged = new Set([...imageUrls, ...apifyUrls]);
        imageUrls = Array.from(merged);
      } catch (apifyErr: any) {
        console.error(`[ImageScraper] Apify falló: ${apifyErr.message} — usando lo que hay del HTML estático`);
      }
    }

    console.log(`[ImageScraper] Total imágenes a subir: ${imageUrls.length}`);

    // 4. Descargar y subir cada imagen a Drive
    let subidas = 0;
    for (let i = 0; i < Math.min(imageUrls.length, 50); i++) {
      const imgUrl = imageUrls[i];
      try {
        const response = await fetch(imgUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            'Referer': url,
          },
        });
        if (!response.ok) continue;

        const buffer = await response.arrayBuffer();
        const mimeType = response.headers.get('content-type') || 'image/jpeg';
        const ext = imgUrl.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
        const validExt = ['jpg', 'jpeg', 'png', 'webp', 'avif'].includes(ext) ? ext : 'jpg';
        const fileName = `${String(i + 1).padStart(3, '0')}_imagen.${validExt}`;

        const { Readable } = await import('stream');
        const stream = Readable.from(Buffer.from(buffer));

        await drive.files.create({
          requestBody: { name: fileName, parents: [carpetaId] },
          media: { mimeType, body: stream },
          fields: 'id',
        });

        subidas++;
        console.log(`[ImageScraper] ${subidas}/${Math.min(imageUrls.length, 50)}: ${fileName}`);
      } catch (e: any) {
        console.error(`[ImageScraper] Error con imagen ${i}: ${e.message}`);
      }
    }

    return { success: true, imagenes: subidas, carpetaId };

  } catch (error: any) {
    console.error('[ImageScraper] Error:', error.message);
    return { success: false, imagenes: 0, carpetaId: '', error: error.message };
  }
}
