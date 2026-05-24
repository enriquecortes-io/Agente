import { google } from 'googleapis';
import dotenv from 'dotenv';

// Nos aseguramos de que el logger también lea el .env.local
dotenv.config({ path: '.env.local' });

const getDriveService = () => {
  // Extraemos las credenciales directamente de las variables de entorno
  // Asegúrate de que los nombres de estas variables coincidan con las tuyas en el .env.local
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  
  // Limpiamos la clave privada por si viene con las comillas literales o saltos de línea escapados (\\n)
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  if (!clientEmail || !privateKey) {
     throw new Error("Faltan GOOGLE_CLIENT_EMAIL o GOOGLE_PRIVATE_KEY en tu .env.local");
  }

  // Inyectamos las credenciales manualmente (sin archivo JSON)
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/drive']
  });
  
  return google.drive({ version: 'v3', auth });
};

export async function getOrCreateClientFolder(nombreCliente: string) {
  const drive = getDriveService();
  const folderName = `Cliente - ${nombreCliente}`;
  
  try {
    const res = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
      fields: 'files(id, webViewLink)'
    });
    
    if (res.data.files && res.data.files.length > 0) {
      console.log(`    [☁️ DRIVE] Carpeta detectada. Usando la existente para: ${nombreCliente}`);
      return res.data.files[0];
    }
    
    const folder = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      },
      fields: 'id, webViewLink'
    });
    console.log(`    [☁️ DRIVE] Nueva carpeta creada para: ${nombreCliente}`);
    return folder.data;
  } catch (err: any) {
    console.error("    [❌ ERROR DRIVE] Fallo al gestionar la carpeta:", err.message);
    return null;
  }
}

export async function appendToLogFile(folderId: string, newText: string) {
  const drive = getDriveService();
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and name='Log_Conversacion.txt' and trashed=false`,
      fields: 'files(id)'
    });
    
    let fileId = res.data.files && res.data.files.length > 0 ? res.data.files[0].id : null;
    let currentText = '';

    if (fileId) {
      const fileData = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
      currentText = (fileData.data as string) + '\n\n';
    }

    const fullText = currentText + newText;
    const media = { mimeType: 'text/plain', body: fullText };

    if (fileId) {
      await drive.files.update({ fileId, media });
      console.log(`    [📝 LOG] Historial añadido correctamente en el Log de texto. (Update)`);
    } else {
      await drive.files.create({
        requestBody: { name: 'Log_Conversacion.txt', parents: [folderId] },
        media
      });
      console.log(`    [📝 LOG] Archivo de historial creado por primera vez en la carpeta. (Create)`);
    }
  } catch (err: any) {
    console.error("    [❌ ERROR LOG] Fallo guardando el archivo de texto:", err.message);
  }
}
