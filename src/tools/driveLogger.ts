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
  const folderName = `[${tipoLead}] ${nombreCliente}`;
  const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;

  // 1. Buscar carpeta existente
  let folderId: string | undefined;
  const q = parentId
    ? `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const folderRes = await drive.files.list({ q, fields: 'files(id, name)' });
  if (folderRes.data.files && folderRes.data.files.length > 0) {
    folderId = folderRes.data.files[0].id!;
    console.log(`[Drive] Carpeta existente: ${folderRes.data.files[0].name}`);
  }

  // 2. Crear carpeta si no existe
  if (!folderId) {
    const folderMeta: any = { name: folderName, mimeType: 'application/vnd.google-apps.folder' };
    if (parentId) folderMeta.parents = [parentId];
    const folder = await drive.files.create({ requestBody: folderMeta, fields: 'id' });
    folderId = folder.data.id!;
    console.log(`[Drive] Carpeta creada: ${folderName} → id: ${folderId}`);
  }

  // 3. Buscar historial existente
  console.log(`[Drive] Buscando historial en carpeta: ${folderId}`);
  const docRes = await drive.files.list({
    q: `'${folderId}' in parents and name='Historial_Conversacion.txt' and trashed=false`,
    fields: 'files(id)',
  });
  let docId = docRes.data.files?.[0]?.id;
  console.log(`[Drive] Historial existente: ${docId ?? 'ninguno'}`);

  // 4. Crear archivo txt si no existe
  if (!docId) {
    console.log(`[Drive] Intentando crear Historial_Conversacion.txt en carpeta ${folderId}...`);
    const contenidoInicial =
      `HISTORIAL DE CONVERSACIÓN\n` +
      `Cliente: ${nombreCliente}\n` +
      `Tipo: ${tipoLead}\n` +
      `Creado: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}\n` +
      `${'─'.repeat(50)}\n`;

    const file = await drive.files.create({
      requestBody: {
        name: 'Historial_Conversacion.txt',
        parents: [folderId],
      },
      media: {
        mimeType: 'text/plain',
        body: contenidoInicial,
      },
      fields: 'id',
    });
    docId = file.data.id!;
    console.log(`[Drive] Historial_Conversacion.txt creado → id: ${docId}`);
  }

  return { folderId, docId };
}

export async function actualizarHistorial(docId: string, mensajeUsuario: string, respuestaAgente: string) {
  const drive = getDriveService();

  let contenidoActual = '';
  try {
    const res = await drive.files.get({ fileId: docId, alt: 'media' } as any);
    contenidoActual = res.data as string;
  } catch {
    contenidoActual = '';
  }

  const timestamp = new Date().toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const nuevoBloque =
    `\n${'─'.repeat(50)}\n` +
    `📅 ${timestamp}\n` +
    `👤 Cliente: ${mensajeUsuario}\n` +
    `🤖 Harvis: ${respuestaAgente}\n`;

  await drive.files.update({
    fileId: docId,
    uploadType: 'media',
    media: { mimeType: 'text/plain', body: contenidoActual + nuevoBloque },
  });

  console.log(`[Drive] Historial actualizado — ${timestamp}`);
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
  } else {
    await drive.files.create({
      requestBody: { name: 'Log_Conversacion.txt', parents: [folderId] },
      media,
    });
  }
}

export async function borrarCarpetasAntiguas() {
  const drive = getDriveService();
  const res = await drive.files.list({
    q: "name contains 'Cliente' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: 'files(id, name)',
  });
  const carpetas = res.data.files || [];
  for (const file of carpetas) {
    await drive.files.delete({ fileId: file.id! });
    console.log(`[Drive] Borrada: ${file.name}`);
  }
}
