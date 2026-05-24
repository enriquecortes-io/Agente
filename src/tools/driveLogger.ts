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

/**
 * Prepara entorno del cliente:
 * - Una sola carpeta por cliente (busca antes de crear)
 * - Un solo Google Doc por cliente (busca antes de crear)
 * - Nunca genera duplicados
 */
export async function prepararEntornoCliente(nombreCliente: string, tipoLead: TipoLead) {
  const drive = getDriveService();
  const folderName = `[${tipoLead}] ${nombreCliente}`;
  const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;

  // 1. Buscar carpeta del cliente — primero con el tipo, luego sin tipo por si existe de antes
  const queries = [
    `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    `name contains '${nombreCliente}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  ];

  let folderId: string | undefined;

  for (const q of queries) {
    const fullQ = parentId ? `${q} and '${parentId}' in parents` : q;
    const res = await drive.files.list({ q: fullQ, fields: 'files(id, name)' });
    if (res.data.files && res.data.files.length > 0) {
      folderId = res.data.files[0].id!;
      console.log(`[Drive] Carpeta existente encontrada: ${res.data.files[0].name}`);
      break;
    }
  }

  // 2. Si no existe, crear carpeta
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

  // 4. Si no existe, crear doc
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
    console.log(`[Drive] Doc Historial_Conversacion creado`);
  }

  return { folderId, docId };
}

/**
 * Añade un nuevo bloque al historial del cliente con timestamp.
 * Lee el contenido actual y concatena — nunca sobreescribe el histórico.
 */
export async function actualizarHistorial(docId: string, mensajeUsuario: string, respuestaAgente: string) {
  const drive = getDriveService();

  // Leer contenido actual del doc
  let contenidoActual = '';
  try {
    const res = await drive.files.export({ fileId: docId, mimeType: 'text/plain' });
    contenidoActual = typeof res.data === 'string' ? res.data : '';
  } catch {
    contenidoActual = '';
  }

  // Construir nuevo bloque con timestamp
  const timestamp = new Date().toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const nuevoBloque = `
────────────────────────────────────────
📅 ${timestamp}
👤 Cliente: ${mensajeUsuario}
🤖 Harvis: ${respuestaAgente}
`;

  const contenidoCompleto = contenidoActual + nuevoBloque;

  // Actualizar el doc con el historial completo
  await drive.files.update({
    fileId: docId,
    uploadType: 'media',
    media: { mimeType: 'text/plain', body: contenidoCompleto },
  });

  console.log(`[Drive] Historial actualizado — ${timestamp}`);
}

/**
 * Alias para compatibilidad con imports existentes
 */
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

/**
 * Limpieza de carpetas antiguas de test
 */
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
