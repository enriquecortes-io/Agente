import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Autenticación con Google Cloud (Service Account)
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL!,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') || '',
  },
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});

const drive = google.drive({ version: 'v3', auth });

export async function createClientFolder(clientName: string) {
  try {
    const fileMetadata = {
      name: `${clientName} - KYC & NDA`,
      mimeType: 'application/vnd.google-apps.folder',
    };

    const folder = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id, webViewLink',
    });

    console.log(`[Drive Tool] Carpeta segura creada para ${clientName}`);
    
    return { 
      success: true, 
      folderId: folder.data.id, 
      link: folder.data.webViewLink,
      message: `Carpeta segura generada. Enlace: ${folder.data.webViewLink}`
    };
    
  } catch (error) {
    console.error('Error al conectar con Google Drive:', error);
    return { 
      success: false, 
      error: 'Se ha producido un error técnico al generar el espacio seguro. Requiere validación del administrador.' 
    };
  }
}
