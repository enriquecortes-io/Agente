import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

const getDriveService = () => {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;
  
  if (privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  if (!clientEmail || !privateKey) {
     throw new Error("Faltan GOOGLE_CLIENT_EMAIL o GOOGLE_PRIVATE_KEY en tu .env.local");
  }

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
  if (!ROOT_FOLDER_ID) {
    console.error("    [❌ ERROR DRIVE] Falta GOOGLE_DRIVE_ROOT_FOLDER_ID en el .env.local");
    return null;
  }

  const drive = getDriveService();
  const folderName = `Cliente - ${nombreCliente}`;
  
  try {
    // Buscamos la carpeta del cliente DENTRO de la carpeta principal compartida
    const res = await drive.files.list({
      q: `'${ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
      fields: 'files(id, webViewLink)'
    });
    
    if (res.data.files && res.data.files.length > 0) {
      console.log(`    [☁️ DRIVE] Carpeta detectada. Usando la existente para: ${nombreCliente}`);
      return res.data.files[0];
    }
    
    // Si no existe, la creamos DENTRO de la carpeta principal
    const folder = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [ROOT_FOLDER_ID] // 🔥 EL TRUCO: Le decimos que la guarde en tu Drive
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
