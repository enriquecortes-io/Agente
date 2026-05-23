import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

export async function createClientFolder(clientName: string) {
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

    // Preparamos la carpeta nueva
    const fileMetadata: any = {
      name: `${clientName} - KYC & NDA`,
      mimeType: 'application/vnd.google-apps.folder',
    };

    // Si tenemos la carpeta padre configurada, le decimos a Google que la meta ahí
    if (process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID) {
      fileMetadata.parents = [process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID];
    }

    const folder = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id, webViewLink',
    });

    return { 
      success: true, 
      folderId: folder.data.id, 
      link: folder.data.webViewLink,
      message: `Carpeta generada con éxito.`
    };
    
  } catch (error: any) {
    console.error('Error al conectar con Google Drive:', error);
    return { success: false, error: error.message || 'Error técnico en Drive.' };
  }
}
