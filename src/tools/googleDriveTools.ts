import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

export async function createClientFolder(clientName: string, interactionType: string = 'General') {
 try {
   if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
     throw new Error('Faltan las credenciales de Google en el .env.local');
   }

   const auth = new google.auth.GoogleAuth({
     credentials: {
       client_email: process.env.GOOGLE_CLIENT_EMAIL,
       private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
     },
     scopes: ['https://www.googleapis.com/auth/drive'],
   });

   const drive = google.drive({ version: 'v3', auth });
   const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;

   let clientFolderId: string | null = null;

   if (parentId) {
     const q = `mimeType='application/vnd.google-apps.folder' and name='${clientName}' and '${parentId}' in parents and trashed=false`;
     const res = await drive.files.list({ q, fields: 'files(id, name)', spaces: 'drive' });
     if (res.data.files && res.data.files.length > 0) {
       clientFolderId = res.data.files[0].id ?? null;
     }
   }

   if (!clientFolderId) {
     const clientFolder = await drive.files.create({
       requestBody: {
         name: clientName,
         mimeType: 'application/vnd.google-apps.folder',
         ...(parentId ? { parents: [parentId] } : {}),
       },
       fields: 'id',
     });
     clientFolderId = clientFolder.data.id ?? null;
   }

   if (!clientFolderId) throw new Error('No se pudo obtener el ID de la carpeta del cliente.');

   const interactionFolder = await drive.files.create({
     requestBody: {
       name: interactionType,
       mimeType: 'application/vnd.google-apps.folder',
       parents: [clientFolderId],
     },
     fields: 'id, webViewLink',
   });

   return {
     success: true,
     folderId: interactionFolder.data.id,
     link: interactionFolder.data.webViewLink,
     message: `Subcarpeta '${interactionType}' generada dentro del cliente '${clientName}'.`
   };

 } catch (error: any) {
   console.error('Error al conectar con Google Drive:', error);
   return { success: false, error: error.message || 'Error técnico en Drive.' };
 }
}
