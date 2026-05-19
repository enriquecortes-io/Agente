import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Autenticación con Google Cloud (Service Account)
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    // El replace soluciona problemas comunes de formato con las claves privadas en los .env
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});

const drive = google.drive({ version: 'v3', auth });

export async function createClientFolder(clientName: string) {
  try {
    const fileMetadata = {
      name: `${clientName} - KYC & NDA`,
      mimeType: 'application/vnd.google-apps.folder',
      // Opcional: Aquí puedes poner el ID de la carpeta maestra "The Edit Marbella - Clients"
      // parents: [process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID!] 
    };

    const folder = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id, webViewLink', // Pedimos que nos devuelva el ID y el enlace para compartir
    });

    console.log(`[Drive Tool] Carpeta creada con éxito para ${clientName}`);
    
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
