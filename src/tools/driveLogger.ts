import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const getDriveService = () => {
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
    scopes: ['https://www.googleapis.com/auth/drive']
  });
  return google.drive({ version: 'v3', auth });
};

// Borrado masivo de carpetas "Cliente - *" (Limpieza inicial)
export async function borrarCarpetasAntiguas() {
  const drive = getDriveService();
  const res = await drive.files.list({ q: "name contains 'Cliente - ' and mimeType='application/vnd.google-apps.folder'", fields: 'files(id)' });
  for (const file of res.data.files || []) {
    await drive.files.delete({ fileId: file.id! });
  }
}

// Lógica de carpeta única por cliente y documento único (Google Doc)
export async function prepararEntornoCliente(nombreCliente: string, tipoLead: string) {
  const drive = getDriveService();
  const folderName = `[${tipoLead}] Cliente - ${nombreCliente}`;
  
  // 1. Buscar o Crear Carpeta
  let res = await drive.files.list({ q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: 'files(id)' });
  let folderId = res.data.files?.[0]?.id;
  
  if (!folderId) {
    const folder = await drive.files.create({ requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' });
    folderId = folder.data.id!;
  }

  // 2. Buscar o Crear Documento Maestro (Historial_Conversacion.doc)
  res = await drive.files.list({ q: `'${folderId}' in parents and name='Historial_Conversacion.doc' and trashed=false`, fields: 'files(id)' });
  let docId = res.data.files?.[0]?.id;
  
  if (!docId) {
    const doc = await drive.files.create({ requestBody: { name: 'Historial_Conversacion.doc', mimeType: 'application/vnd.google-apps.document', parents: [folderId] }, fields: 'id' });
    docId = doc.data.id!;
  }
  
  return { folderId, docId };
}

// Guardar historial en el Doc de Google
export async function actualizarHistorial(docId: string, texto: string) {
  const drive = getDriveService();
  // Nota: Esto concatena texto al contenido existente del doc
  await drive.files.update({ fileId: docId, uploadType: 'media', media: { mimeType: 'text/plain', body: texto } });
}
