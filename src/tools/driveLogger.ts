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
  return {
    drive: google.drive({ version: 'v3', auth }),
    docs:  google.docs({ version: 'v1', auth }),
  };
}

export type TipoLead = 'Venta' | 'Captacion' | 'Gestion';

function getFolderIdParaTipo(tipoLead: TipoLead): string {
  const map: Record<TipoLead, string | undefined> = {
    Venta:     process.env.GOOGLE_FOLDER_VENTA,
    Captacion: process.env.GOOGLE_FOLDER_CAPTACION,
    Gestion:   process.env.GOOGLE_FOLDER_GESTION,
  };
  const id = map[tipoLead];
  if (!id) throw new Error(`Falta GOOGLE_FOLDER_${tipoLead.toUpperCase()} en .env.local`);
  return id;
}

function getDocIdParaTipo(tipoLead: TipoLead): string {
  const map: Record<TipoLead, string | undefined> = {
    Venta:     process.env.GOOGLE_DOC_VENTA,
    Captacion: process.env.GOOGLE_DOC_CAPTACION,
    Gestion:   process.env.GOOGLE_DOC_GESTION,
  };
  const id = map[tipoLead];
  if (!id) throw new Error(`Falta GOOGLE_DOC_${tipoLead.toUpperCase()} en .env.local`);
  return id;
}

export async function prepararEntornoCliente(nombreCliente: string, tipoLead: TipoLead) {
  const { drive, docs } = getServices();
  const parentFolderId = getFolderIdParaTipo(tipoLead);
  const docId = getDocIdParaTipo(tipoLead);

  // Buscar carpeta del cliente en TODAS las carpetas tipo
  // Esto evita crear duplicados cuando un cliente cambia de tipo de lead
  const todasLasCarpetas = [
    process.env.GOOGLE_FOLDER_VENTA,
    process.env.GOOGLE_FOLDER_CAPTACION,
    process.env.GOOGLE_FOLDER_GESTION,
  ].filter(Boolean) as string[];

  let clienteFolderId: string | undefined;

  for (const folderId of todasLasCarpetas) {
    // Buscar por nombre normalizado (sin tildes) para evitar duplicados por encoding
    const nombreNormalizado = nombreCliente.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const res = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id, name)',
    });
    const encontrada = res.data.files?.find(f => {
      const nombreArchivo = (f.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return nombreArchivo.toLowerCase() === nombreNormalizado.toLowerCase();
    });
    if (encontrada?.id) {
      clienteFolderId = encontrada.id;
      console.log(`[Drive] Carpeta existente: ${encontrada.name}`);
      break;
    }
  }

  // Crear carpeta solo si no existe en ninguna carpeta tipo
  if (!clienteFolderId) {
    const folder = await drive.files.create({
      requestBody: {
        name: nombreCliente,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      },
      fields: 'id',
      supportsAllDrives: true,
    });
    clienteFolderId = folder.data.id!;
    console.log(`[Drive] Carpeta creada: ${nombreCliente} en ${tipoLead}`);
  }

  // Insertar cabecera en el doc maestro del tipo
  const timestamp = new Date().toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const cabecera =
    `\n${'═'.repeat(50)}\n` +
    `🏠 CLIENTE: ${nombreCliente.toUpperCase()}\n` +
    `📋 TIPO: ${tipoLead}\n` +
    `📅 INICIO: ${timestamp}\n` +
    `${'═'.repeat(50)}\n`;

  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [{ insertText: { location: { index: 1 }, text: cabecera } }],
    },
  });

  console.log(`[Docs] Cabecera de ${nombreCliente} insertada en doc ${tipoLead}`);
  return { folderId: clienteFolderId, docId };
}

export async function actualizarHistorial(docId: string, mensajeUsuario: string, respuestaAgente: string) {
  const { docs } = getServices();

  const timestamp = new Date().toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const nuevoBloque =
    `\n${'─'.repeat(40)}\n` +
    `📅 ${timestamp}\n` +
    `👤 Cliente: ${mensajeUsuario}\n` +
    `🤖 Harvis: ${respuestaAgente}\n`;

  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [{ insertText: { location: { index: 1 }, text: nuevoBloque } }],
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
  // Borrar TODAS las subcarpetas dentro de las tres carpetas tipo
  const todasLasCarpetas = [
    process.env.GOOGLE_FOLDER_VENTA,
    process.env.GOOGLE_FOLDER_CAPTACION,
    process.env.GOOGLE_FOLDER_GESTION,
  ].filter(Boolean) as string[];

  for (const folderId of todasLasCarpetas) {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
    });
    for (const file of res.data.files || []) {
      await drive.files.delete({ fileId: file.id! });
      console.log(`[Drive] Borrada: ${file.name}`);
    }
  }
}
