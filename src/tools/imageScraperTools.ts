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

export async function extraerImagenesDeWeb(url: string, nombrePropiedad: string): Promise<{ success: boolean; imagenes: number; carpetaId: string; error?: string }> {
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

    // 2. Extraer imágenes con fetch + regex
    const htmlRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    const html = await htmlRes.text();

    const urlBase = new URL(url);
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

    const imageUrls = Array.from(imageSet).filter(u =>
      !u.includes('icon') && !u.includes('logo') && !u.includes('favicon') &&
      !u.includes('avatar') && !u.includes('spinner') && u.length > 20
    );

    console.log(`[ImageScraper] ${imageUrls.length} imágenes encontradas`);

    // 3. Descargar y subir cada imagen a Drive
    let subidas = 0;
    for (let i = 0; i < Math.min(imageUrls.length, 50); i++) {
      const imgUrl = imageUrls[i];
      try {
        const response = await fetch(imgUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Referer': url },
        });
        if (!response.ok) continue;

        const buffer = await response.arrayBuffer();
        const mimeType = response.headers.get('content-type') || 'image/jpeg';
        const ext = imgUrl.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
        const validExt = ['jpg','jpeg','png','webp','avif'].includes(ext) ? ext : 'jpg';
        const fileName = `${String(i + 1).padStart(3, '0')}_imagen.${validExt}`;

        const { Readable } = await import('stream');
        const stream = Readable.from(Buffer.from(buffer));

        await drive.files.create({
          requestBody: {
            name: fileName,
            parents: [carpetaId],
          },
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
