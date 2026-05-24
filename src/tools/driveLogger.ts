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

/**
* En lugar de crear archivos nuevos (bloqueado por Google para bots),
* Harvis escribe en un único Google Doc maestro creado manualmente por el usuario.
* Cada cliente tiene su sección dentro del doc, identificada por nombre y tipo de lead.
* Devuelve el docId maestro para usarlo en actualizarHistorial.
*/
export async function prepararEntornoCliente(nombreCliente: string, tipoLead: TipoLead) {
 const { docs } = getServices();

 const docId = process.env.GOOGLE_MASTER_DOC_ID;
 if (!docId) throw new Error('Falta GOOGLE_MASTER_DOC_ID en .env.local');

 const timestamp = new Date().toLocaleString('es-ES', {
   timeZone: 'Europe/Madrid',
   day: '2-digit', month: '2-digit', year: 'numeric',
   hour: '2-digit', minute: '2-digit', second: '2-digit',
 });

 // Insertar cabecera de nuevo cliente al inicio del doc
 const cabecera =
   `\n${'═'.repeat(50)}\n` +
   `🏠 CLIENTE: ${nombreCliente.toUpperCase()}\n` +
   `📋 TIPO: ${tipoLead}\n` +
   `📅 INICIO: ${timestamp}\n` +
   `${'═'.repeat(50)}\n`;

 await docs.documents.batchUpdate({
   documentId: docId,
   requestBody: {
     requests: [
       {
         insertText: {
           location: { index: 1 },
           text: cabecera,
         },
       },
     ],
   },
 });

 console.log(`[Docs] Cabecera de ${nombreCliente} (${tipoLead}) insertada en doc maestro`);

 // folderId no aplica — devolvemos el docId maestro en ambos campos
 return { folderId: docId, docId };
}

/**
* Añade un turno de conversación al doc maestro con timestamp.
*/
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
