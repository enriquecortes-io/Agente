import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Cache en memoria para evitar repetir búsquedas
const zonaCache = new Map<string, { municipio: string; zona: string }>();

export async function identificarZona(urbanizacion: string): Promise<{ municipio: string; zona: string } | null> {
  const key = urbanizacion.toLowerCase().trim();

  if (zonaCache.has(key)) {
    console.log(`[Geocoding] Cache hit: ${urbanizacion}`);
    return zonaCache.get(key)!;
  }

  try {
    const query = encodeURIComponent(`${urbanizacion} Málaga España`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=es`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Harvis-RealEstate/1.0 (harvis@theeditmarbella.com)' },
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.length) return null;

    const result = data[0];
    const displayName: string = result.display_name || '';

    // Extraer municipio del display_name
    // Formato: "Urbanización, Barrio, Municipio, Comarca, Provincia, ..."
    const parts = displayName.split(',').map((p: string) => p.trim());

    const municipiosCostaDelSol = [
      'Marbella', 'Estepona', 'Benahavís', 'Mijas', 'Fuengirola',
      'Benalmádena', 'Torremolinos', 'Málaga', 'Nerja', 'San Roque',
      'La Línea de la Concepción', 'Manilva', 'Casares', 'Ojén',
    ];

    const municipio = parts.find(p =>
      municipiosCostaDelSol.some(m => p.toLowerCase().includes(m.toLowerCase()))
    ) || parts[2] || 'Málaga';

    const resultado = {
      municipio: municipio.trim(),
      zona: result.name || urbanizacion,
    };

    zonaCache.set(key, resultado);
    console.log(`[Geocoding] ${urbanizacion} → ${municipio}`);
    return resultado;

  } catch (error: any) {
    console.error('[Geocoding] Error:', error.message);
    return null;
  }
}
