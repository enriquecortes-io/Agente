import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

function getDriveService() {
 const auth = new google.auth.GoogleAuth({
   credentials: {
     client_email: process.env.GOOGLE_CLIENT_EMAIL,
     private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
   },
   scopes: ['https://www.googleapis.com/auth/drive'],
 });
 return google.drive({ version: 'v3', auth });
}

export async function extraerImagenesDeWeb(url: string, nombrePropiedad: string): Promise<{ success: boolean; imagenes: number; carpetaId: string; error?: string }> {
 try {
   const drive = getDriveService();
   const parentFolderId = process.env.GOOGLE_FOLDER_IMAGENES!;

   // 1. Crear subcarpeta para la propiedad
   const folder = await drive.files.create({
     requestBody: {
       name: nombrePropiedad,
       mimeType: 'application/vnd.google-apps.folder',
       parents: [parentFolderId],
     },
     fields: 'id',
   });
   const carpetaId = folder.data.id!;
   console.log(`[ImageScraper] Carpeta creada: ${nombrePropiedad} (${carpetaId})`);

   // 2. Extraer imágenes con Puppeteer
   const chromium = await import('@sparticuz/chromium');
   const puppeteer = await import('puppeteer-core');

   const browser = await puppeteer.default.launch({
     args: chromium.default.args,
     executablePath: await chromium.default.executablePath(),
     headless: true,
   });

   const page = await browser.newPage();
   await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
   await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

   // Extraer todas las URLs de imágenes
   const imageUrls: string[] = await page.evaluate(() => {
     const imgs = Array.from(document.querySelectorAll('img'));
     const srcset = Array.from(document.querySelectorAll('[srcset]'));
     const bgImages = Array.from(document.querySelectorAll('[style*="background-image"]'));

     const urls = new Set<string>();

     imgs.forEach(img => {
       if (img.src && img.src.startsWith('http')) urls.add(img.src);
       if (img.dataset.src) urls.add(img.dataset.src);
       if (img.dataset.lazy) urls.add(img.dataset.lazy);
     });

     srcset.forEach(el => {
       const srcs = (el as HTMLElement).getAttribute('srcset')?.split(',') || [];
       srcs.forEach(s => {
         const urlPart = s.trim().split(' ')[0];
         if (urlPart.startsWith('http')) urls.add(urlPart);
       });
     });

     return Array.from(urls).filter(u =>
       u.match(/\.(jpg|jpeg|png|webp|avif)/i) &&
       !u.includes('icon') &&
       !u.includes('logo') &&
       !u.includes('avatar') &&
       !u.includes('favicon')
     );
   });

   await browser.close();
   console.log(`[ImageScraper] ${imageUrls.length} imágenes encontradas`);

   // 3. Descargar y subir cada imagen a Drive
   let subidas = 0;
   for (let i = 0; i < imageUrls.length; i++) {
     const imgUrl = imageUrls[i];
     try {
       const response = await fetch(imgUrl, {
         headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': url },
       });
       if (!response.ok) continue;

       const buffer = await response.arrayBuffer();
       const mimeType = response.headers.get('content-type') || 'image/jpeg';
       const ext = imgUrl.split('.').pop()?.split('?')[0] || 'jpg';
       const fileName = `${String(i + 1).padStart(3, '0')}_imagen.${ext}`;

       const { Readable } = await import('stream');
       const stream = Readable.from(Buffer.from(buffer));

       await drive.files.create({
         requestBody: {
           name: fileName,
           parents: [carpetaId],
         },
         media: {
           mimeType,
           body: stream,
         },
         fields: 'id',
       });

       subidas++;
       console.log(`[ImageScraper] Subida ${subidas}/${imageUrls.length}: ${fileName}`);
     } catch (e: any) {
       console.error(`[ImageScraper] Error con imagen ${i}: ${e.message}`);
     }
   }

   return { success: true, imagenes: subidas, carpetaId };

 } catch (error: any) {
   console.error('[ImageScraper] Error:', error.message);
   return { success: false, imagenes: 0, carpetaId: '', error: error.message };
 }
}
