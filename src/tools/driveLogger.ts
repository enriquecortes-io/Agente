import { google } from 'googleapis';
// Intentamos importar la configuración o el cliente si ya lo tienes creado en tus herramientas
// para mantener el proyecto limpio y DRY (Don't Repeat Yourself)

const getDriveService = () => {
  // Si usas una variable de entorno, el SDK de Google la detecta automáticamente si está bien configurada
  // Si no encuentra el archivo físico, delegamos en las credenciales por defecto del entorno
  const config: any = {};
  
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    config.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  
  const auth = new google.auth.GoogleAuth({
    ...config,
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
      console.log(`    [📝 LOG] Historial añadido correctamente en el Luck de texto. (Update)`);
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
