import { google } from 'googleapis';

export async function syncLogToDrive(folderId: string, content: string) {
  try {
    // Inicializa la autenticación (usa las mismas credenciales que tu googleDriveTools)
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/drive']
    });
    const drive = google.drive({ version: 'v3', auth });

    // 1. Buscamos si el archivo de Log ya existe dentro de la carpeta del cliente
    const res = await drive.files.list({
      q: `'${folderId}' in parents and name = 'Log_Conversacion.txt' and trashed = false`,
      fields: 'files(id)'
    });

    const existingFile = res.data.files && res.data.files.length > 0 ? res.data.files[0] : null;

    const media = {
      mimeType: 'text/plain',
      body: content
    };

    if (existingFile && existingFile.id) {
      // Si existe, lo actualizamos (sobreescribimos con el historial completo)
      await drive.files.update({
        fileId: existingFile.id,
        media: media
      });
      console.log(`    [☁️ DRIVE] Log actualizado exitosamente.`);
    } else {
      // Si no existe, lo creamos
      await drive.files.create({
        requestBody: {
          name: 'Log_Conversacion.txt',
          parents: [folderId]
        },
        media: media
      });
      console.log(`    [☁️ DRIVE] Archivo Log_Conversacion.txt creado exitosamente.`);
    }
  } catch (error: any) {
    console.error(`    [❌ ERROR DRIVE] No se pudo guardar el log:`, error.message);
  }
}
