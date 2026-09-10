import AdmZip from 'adm-zip';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getDriveService() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') || '';
  const auth = new google.auth.GoogleAuth({
    projectId: 'harvis-496912',
    credentials: {
      type: 'service_account',
      project_id: 'harvis-496912',
      private_key: privateKey,
      client_email: process.env.GOOGLE_CLIENT_EMAIL || 'harvis@harvis-496912.iam.gserviceaccount.com',
      client_id: process.env.GOOGLE_CLIENT_ID || '102203927356076425365',
    } as any,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return Response.json({ error: 'No file' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    const htmlEntry = entries.find(e => e.entryName.endsWith('.html'));
    if (!htmlEntry) return Response.json({ error: 'No se encontró HTML en el ZIP' }, { status: 400 });

    let html = htmlEntry.getData().toString('utf8');

    const imgEntries = entries.filter(e => 
      !e.isDirectory && e.entryName.match(/\.(jpg|jpeg|png|gif|webp)$/i)
    );

    const drive = getDriveService();
    const parentFolderId = '1OvXA1CpwJkLnu3UuG7N9yjxQCLQuXj7F';

    // Crear carpeta para esta campaña
    const folderRes = await drive.files.create({
      requestBody: {
        name: `Campaña-${Date.now()}`,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      },
      fields: 'id',
      supportsAllDrives: true,
    });
    const campaignFolderId = folderRes.data.id!;

    let uploaded = 0;
    for (const img of imgEntries) {
      const imgName = img.entryName;
      const filename = imgName.split('/').pop()!;
      const ext = filename.split('.').pop()!.toLowerCase();
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;

      try {
        const fileRes = await drive.files.create({
          requestBody: { name: filename, parents: [campaignFolderId] },
          media: { mimeType: mime, body: require('stream').Readable.from(img.getData()) },
          fields: 'id',
          supportsAllDrives: true,
        });
        const fileId = fileRes.data.id!;
        await drive.permissions.create({
          fileId,
          requestBody: { role: 'reader', type: 'anyone' },
          supportsAllDrives: true,
        });
        const publicUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
        html = html.replaceAll(imgName, publicUrl);
        html = html.replaceAll(filename, publicUrl);
        uploaded++;
      } catch (imgErr: any) {
        console.log('[UploadZip] Error subiendo imagen', filename, imgErr.message);
      }
    }

    return Response.json({ html, imageCount: uploaded });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
