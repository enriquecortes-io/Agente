import AdmZip from 'adm-zip';
import { v2 as cloudinary } from 'cloudinary';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return Response.json({ error: 'No file' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    console.log('[UploadZip] Total entries en ZIP:', entries.length, entries.map(e => e.entryName).join(', '));
    const htmlEntry = entries.find(e => e.entryName.endsWith('.html'));
    if (!htmlEntry) return Response.json({ error: 'No se encontró HTML en el ZIP' }, { status: 400 });

    let html = htmlEntry.getData().toString('utf8');

    const imgEntries = entries.filter(e =>
      !e.isDirectory && e.entryName.match(/\.(jpg|jpeg|png|gif|webp)$/i)
    );

    console.log('[UploadZip] Imágenes encontradas:', imgEntries.length);
    console.log('[UploadZip] CLOUDINARY config:', !!process.env.CLOUDINARY_CLOUD_NAME, !!process.env.CLOUDINARY_API_KEY, !!process.env.CLOUDINARY_API_SECRET);
    let uploaded = 0;
    for (const img of imgEntries) {
      const imgName = img.entryName;
      const filename = imgName.split('/').pop()!;
      const ext = filename.split('.').pop()!.toLowerCase();
      const resourceType = ext === 'gif' ? 'image' : 'image';

      try {
        const b64 = img.getData().toString('base64');
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
        const dataUri = `data:${mime};base64,${b64}`;

        const result = await cloudinary.uploader.upload(dataUri, {
          folder: 'harvis/email-campaigns',
          public_id: filename.replace(/\.[^.]+$/, ''),
          overwrite: true,
          resource_type: resourceType as any,
        });

        html = html.replaceAll(imgName, result.secure_url);
        html = html.replaceAll(filename, result.secure_url);
        uploaded++;
      } catch (imgErr: any) {
        console.log('[UploadZip] Error subiendo a Cloudinary:', filename, imgErr.message);
      }
    }

    return Response.json({ html, imageCount: uploaded });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
