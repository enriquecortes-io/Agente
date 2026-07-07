import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

function getSupabaseSolena() {
  return createClient(
    process.env.SOLENA_SUPABASE_URL!,
    process.env.SOLENA_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: Request) {
  try {
    const { propiedadId } = await req.json();
    if (!propiedadId) return Response.json({ error: 'propiedadId requerido' }, { status: 400 });

    const supabase = getSupabaseSolena();

    // Leer propiedad de Supabase
    const { data: propiedad, error } = await supabase
      .from('properties')
      .select('id, slug, titulo, galeria_urls')
      .eq('id', propiedadId)
      .single();

    if (error || !propiedad) {
      return Response.json({ error: 'Propiedad no encontrada' }, { status: 404 });
    }

    const urlsOriginales: string[] = propiedad.galeria_urls || [];
    if (urlsOriginales.length === 0) {
      return Response.json({ error: 'Sin imágenes para subir' }, { status: 400 });
    }

    // Solo procesar URLs externas (no las de Drive que ya están subidas)
    const urlsExternas = urlsOriginales.filter((u: string) => !u.includes('drive.google') && !u.includes('/api/drive'));
    if (urlsExternas.length === 0) {
      return Response.json({ message: 'Todas las imágenes ya están en Drive', total: urlsOriginales.length });
    }

    const drive = getDriveService();
    const parentFolderId = process.env.SOLENA_DRIVE_FOLDER_ID || '1Jl0EBNtcFt2HWIXwT08JjKGNUo8atgC4';
    const titulo = typeof propiedad.titulo === 'object' ? propiedad.titulo.es || propiedad.slug : propiedad.slug;

    // Crear carpeta en Drive
    const folder = await drive.files.create({
      requestBody: {
        name: titulo,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      },
      fields: 'id',
    });
    const carpetaId = folder.data.id!;

    const { Readable } = await import('stream');
    const driveUrls: string[] = [];
    const fallbackUrls: string[] = [];

    for (let i = 0; i < Math.min(urlsExternas.length, 20); i++) {
      const imgUrl = urlsExternas[i];
      try {
        // Intentar múltiples estrategias de descarga
        const headers: Record<string, string>[] = [
          {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': new URL(imgUrl).origin + '/',
            'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          },
          {
            'User-Agent': 'Googlebot-Image/1.0',
          },
          {
            'User-Agent': 'facebookexternalhit/1.1',
          },
        ];

        let imgRes: Response | null = null;
        for (const h of headers) {
          const r = await fetch(imgUrl, { headers: h });
          if (r.ok && r.headers.get('content-type')?.startsWith('image')) {
            imgRes = r;
            break;
          }
        }

        if (!imgRes?.ok) {
          console.log(`[Upload] Bloqueada: ${imgUrl}`);
          fallbackUrls.push(imgUrl);
          continue;
        }

        const buffer = await imgRes.arrayBuffer();
        const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
        const ext = imgUrl.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
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

        driveUrls.push(`/api/drive?id=${file.data.id}`);
        console.log(`[Upload] ${i + 1}/${Math.min(urlsExternas.length, 20)} subida a Drive`);

      } catch (e: any) {
        console.error(`[Upload] Error imagen ${i}:`, e.message);
        fallbackUrls.push(imgUrl);
      }
    }

    // Actualizar Supabase con URLs de Drive (+ fallback para las que no se pudieron subir)
    const galeriaFinal = [...driveUrls, ...fallbackUrls];
    await supabase
      .from('properties')
      .update({ galeria_urls: galeriaFinal })
      .eq('id', propiedadId);

    return Response.json({
      success: true,
      subidas: driveUrls.length,
      fallback: fallbackUrls.length,
      total: galeriaFinal.length,
      carpetaDrive: carpetaId,
    });

  } catch (err: any) {
    console.error('[Upload] Error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
