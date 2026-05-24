import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

function getDriveService() {
  if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error('[Drive] Faltan GOOGLE_CLIENT_EMAIL o GOOGLE_PRIVATE_KEY en .env.local');
  }
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

export type TipoLead = 'Venta' | 'Captacion' | 'Gestion';

export async function prepararEntornoCliente(nombreCliente: string, tipoLead: TipoLead) {
  const drive = getDriveService();
  const folderName = `[${tipoLead}] Cliente - ${nombreCliente}`;
  const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;

  const folderQuery = parentId
    ? `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const folderRes = await drive.files.list({ q: folderQuery, fields: 'files(id)' });
  let folderId = folderRes.data.files?.[0]?.id;

  if (!folderId) {
    const folderMeta: any = { name: folderName, mimeType: 'application/vnd.google-apps.folder' };
    if (parentId) folderMeta.parents = [parentId];
    const folder = await drive.files.create({ requestBody: folderMeta, fields: 'id' });
    folderId = folder.data.id!;
    console.log(`[Drive] Carpeta creada: ${folderName}`);
  }

  const docRes = await drive.files.list({
    q: `'${folderId}' in parents and name='Historial_Conversacion' and trashed=false`,
    fields: 'files(id)',
  });
  let docId = docRes.data.files?.[0]?.id;

  if (!docId) {
    const doc = await drive.files.create({
      requestBody: {
        name: 'Historial_Conversacion',
        mimeType: 'application/vnd.google-apps.document',
        parents: [folderId],
      },
      fields: 'id',
    });
    docId = doc.data.id!;
    console.log(`[Drive] Doc maestro creado en ${folderName}`);
  }

  return { folderId, docId };
}

export async function actualizarHistorial(docId: string, textoCompleto: string) {
  const drive = getDriveService();
  await drive.files.update({
    fileId: docId,
    uploadType: 'media',
    media: { mimeType: 'text/plain', body: textoCompleto },
  });
  console.log(`[Drive] Historial actualizado -> docId: ${docId}`);
}

export async function syncLogToDrive(folderId: string, content: string) {
  const drive = getDriveService();

  const res = await drive.files.list({
    q: `'${folderId}' in parents and name='Log_Conversacion.txt' and trashed=false`,
    fields: 'files(id)',
  });

  const existingFile = res.data.files?.[0] ?? null;
  const media = { mimeType: 'text/plain', body: content };

  if (existingFile?.id) {
    await drive.files.update({ fileId: existingFile.id, media });
    console.log(`[Drive] Log actualizado en carpeta ${folderId}`);
  } else {
    await drive.files.create({
      requestBody: { name: 'Log_Conversacion.txt', parents: [folderId] },
      media,
    });
    console.log(`[Drive] Log creado en carpeta ${folderId}`);
  }
}

export async function borrarCarpetasAntiguas() {
  const drive = getDriveService();
  const res = await drive.files.list({
    q: "name contains 'Cliente - ' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: 'files(id, name)',
  });

  const carpetas = res.data.files || [];
  for (const file of carpetas) {
    await drive.files.delete({ fileId: file.id! });
    console.log(`[Drive] Borrada: ${file.name}`);
  }
}
