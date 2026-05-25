import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const zonaCache = new Map<string, { municipio: string; zona: string }>();

// Centro geográfico de la Costa del Sol occidental
const COSTA_DEL_SOL_CENTER = { lat: 36.51, lon: -4.88 };
const MAX_DISTANCIA_KM = 80; // radio máximo desde Marbella

function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const MUNICIPIOS_COSTA = [
  'Marbella', 'Estepona', 'Benahavís', 'Mijas', 'Fuengirola',
  'Benalmádena', 'Torremolinos', 'Málaga', 'Nerja', 'San Roque',
  'Manilva', 'Casares', 'Ojén', 'Istán', 'Sabinillas',
];

export async function identificarZona(urbanizacion: string): Promise<{ municipio: string; zona: string } | null> {
  const key = urbanizacion.toLowerCase().trim();
  if (zonaCache.has(key)) return zonaCache.get(key)!;

  try {
    const query = encodeURIComponent(`${urbanizacion} Málaga Costa del Sol`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=5&countrycodes=es`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Harvis-RealEstate/1.0 (harvis@theeditmarbella.com)' },
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.length) return null;

    // Filtrar resultados dentro del radio de la Costa del Sol
    const cercanos = data.filter((r: any) => {
      const dist = distanciaKm(
        COSTA_DEL_SOL_CENTER.lat, COSTA_DEL_SOL_CENTER.lon,
        parseFloat(r.lat), parseFloat(r.lon)
      );
      return dist <= MAX_DISTANCIA_KM;
    });

    const result = cercanos[0] || data[0];
    const displayName: string = result.display_name || '';
    const parts = displayName.split(',').map((p: string) => p.trim());

    const municipio = parts.find((p: string) =>
      MUNICIPIOS_COSTA.some(m => p.toLowerCase().includes(m.toLowerCase()))
    ) || parts[2] || 'Costa del Sol';

    const resultado = { municipio: municipio.trim(), zona: result.name || urbanizacion };
    zonaCache.set(key, resultado);
    console.log(`[Geocoding] ${urbanizacion} → ${municipio} (${result.display_name.split(',').slice(0,3).join(',')})`);
    return resultado;

  } catch (error: any) {
    console.error('[Geocoding] Error:', error.message);
    return null;
  }
}
