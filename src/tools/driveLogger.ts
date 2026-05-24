import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

function getServices() {
  if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error('[Drive] Faltan GOOGLE_CLIENT_EMAIL o GOOGLE_PRIVATE_KEY en .env.local');
  }
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/documents',
    ],
  });
  const drive = google.drive({ version: 'v3', auth });
  const docs  = google.docs({ version: 'v1', auth });
  return { drive, docs };
}

export type TipoLead = 'Venta' | 'Captacion' | 'Gestion';

export async function prepararEntornoCliente(nombreCliente: string, tipoLead: TipoLead) {
  const { drive, docs } = getServices();
  const folderName = `[${tipoLead}] ${nombreCliente}`;
  const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;

  // 1. Buscar carpeta existente del cliente
  let folderId: string | undefined;

  const queries = [
    `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    `name contains '${nombreCliente}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  ];

  for (const q of queries) {
    const fullQ = parentId ? `${q} and '${parentId}' in parents` : q;
    const res = await drive.files.list({ q: fullQ, fields: 'files(id, name)' });
    if (res.data.files && res.data.files.length > 0) {
      folderId = res.data.files[0].id!;
      console.log(`[Drive] Carpeta existente: ${res.data.files[0].name}`);
      break;
    }
  }

  // 2. Crear carpeta si no existe
  if (!folderId) {
    const folderMeta: any = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentId) folderMeta.parents = [parentId];
    const folder = await drive.files.create({ requestBody: folderMeta, fields: 'id' });
    folderId = folder.data.id!;
    console.log(`[Drive] Carpeta creada: ${folderName}`);
  }

  // 3. Buscar doc de historial existente
  const docRes = await drive.files.list({
    q: `'${folderId}' in parents and name='Historial_Conversacion' and trashed=false`,
    fields: 'files(id)',
  });
  let docId = docRes.data.files?.[0]?.id;

  // 4. Crear doc con Docs API si no existe
  if (!docId) {
    const doc = await docs.documents.create({
      requestBody: { title: 'Historial_Conversacion' },
    });
    docId = doc.data.documentId!;

    // Mover el doc a la carpeta del cliente
    await drive.files.update({
      fileId: docId,
      addParents: folderId,
      removeParents: 'root',
      fields: 'id, parents',
    });

    console.log(`[Docs] Historial_Conversacion creado en carpeta ${folderName}`);
  }

  return { folderId, docId };
}

export async function actualizarHistorial(docId: string, mensajeUsuario: string, respuestaAgente: string) {
  const { docs } = getServices();

  const timestamp = new Date().toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const nuevoBloque =
    `\n────────────────────────────────────────\n` +
    `📅 ${timestamp}\n` +
    `👤 Cliente: ${mensajeUsuario}\n` +
    `🤖 Harvis: ${respuestaAgente}\n`;

  // Docs API: insertar texto al final del documento
  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text: nuevoBloque,
          },
        },
      ],
    },
  });

  console.log(`[Docs] Historial actualizado — ${timestamp}`);
}

export async function syncLogToDrive(folderId: string, content: string) {
  const { drive } = getServices();

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
  const { drive } = getServices();
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
