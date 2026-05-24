import { google } from 'googleapis';

const getDriveService = () => {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive']
  });
  return google.drive({ version: 'v3', auth });
};

// 📂 Busca la carpeta del cliente. Si no existe, la crea. Cero duplicados.
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

// 📝 Descarga el log actual, le añade el nuevo texto y lo actualiza
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
      // Si existe, leemos lo que ya hay escrito
      const fileData = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
      currentText = (fileData.data as string) + '\n\n';
    }

    const fullText = currentText + newText;
    const media = { mimeType: 'text/plain', body: fullText };

    if (fileId) {
      await drive.files.update({ fileId, media });
      console.log(`    [📝 LOG] Historial añadido correctamente. (Update)`);
    } else {
      await drive.files.create({
        requestBody: { name: 'Log_Conversacion.txt', parents: [folderId] },
        media
      });
      console.log(`    [📝 LOG] Archivo de historial creado por primera vez. (Create)`);
    }
  } catch (err: any) {
    console.error("    [❌ ERROR LOG] Fallo guardando el archivo de texto:", err.message);
  }
}
