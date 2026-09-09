
import AdmZip from 'adm-zip';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return Response.json({ error: 'No file' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    const htmlEntry = entries.find(e => e.entryName.endsWith('.html'));
    if (!htmlEntry) return Response.json({ error: 'No se encontró HTML en el ZIP' }, { status: 400 });

    let html = htmlEntry.getData().toString('utf8');

    const imgEntries = entries.filter(e => 
      !e.isDirectory && e.entryName.match(/\.(jpg|jpeg|png|gif|webp)$/i)
    );

    for (const img of imgEntries) {
      const imgName = img.entryName;
      const ext = imgName.split('.').pop()!.toLowerCase();
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
      const b64 = img.getData().toString('base64');
      const dataUri = `data:${mime};base64,${b64}`;
      html = html.replaceAll(imgName, dataUri);
      html = html.replaceAll(imgName.split('/').pop()!, dataUri);
    }

    return Response.json({ html, imageCount: imgEntries.length });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
