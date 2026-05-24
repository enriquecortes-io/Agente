import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[Supabase] ⚠️  Usando ANON_KEY — configura SUPABASE_SERVICE_ROLE_KEY en .env.local');
}

const supabase = createClient(supabaseUrl, supabaseKey);

const BASE_URL = process.env.THEEDIT_BASE_URL || 'https://mdlm-xi.vercel.app';

interface SearchArgs {
  urbanizacion?: string;
  municipioDeducido?: string;
  precioMax?: number;
  locale?: 'es' | 'en';
}

interface Propiedad {
  id: string;
  slug: string;
  referencia: string;
  titulo: string | { es?: string; en?: string } | null;
  precio: number;
  ubicacion: string;
  zona: string;
  habitaciones: number | null;
  banos: number | null;
}

export async function searchPropertiesInSupabase(args: SearchArgs) {
  try {
    if (!supabaseUrl || !supabaseKey) {
      return { success: false, error: 'Faltan credenciales de Supabase en el entorno.' };
    }

    const locale = args.locale || 'es';

    const hacerBusqueda = async (precioMax: number | undefined, requiereZona: boolean): Promise<Propiedad[]> => {
      let query = supabase
        .from('properties')
        .select('id, slug, referencia, titulo, precio, ubicacion, zona, habitaciones, banos')
        .eq('activa', true)
        .limit(3);

      if (requiereZona && (args.urbanizacion || args.municipioDeducido)) {
        const orConditions: string[] = [];
        if (args.urbanizacion) {
          const urba = args.urbanizacion.toLowerCase();
          orConditions.push(`ubicacion.ilike.%${urba}%`, `zona.ilike.%${urba}%`);
        }
        if (args.municipioDeducido && args.municipioDeducido !== args.urbanizacion) {
          const muni = args.municipioDeducido.toLowerCase();
          orConditions.push(`zona.ilike.%${muni}%`, `ubicacion.ilike.%${muni}%`);
        }
        if (orConditions.length > 0) {
          query = query.or(orConditions.join(','));
        }
      }

      if (precioMax) {
        query = query.lte('precio', precioMax);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data as Propiedad[]) || [];
    };

    let resultados = await hacerBusqueda(args.precioMax, true);
    let tipoMatch = 'exacto';

    if (resultados.length === 0 && args.precioMax) {
      resultados = await hacerBusqueda(args.precioMax * 1.2, true);
      tipoMatch = 'precio_aproximado';
    }

    if (resultados.length === 0) {
      resultados = await hacerBusqueda(args.precioMax, false);
      tipoMatch = 'zona_aproximada';
    }

    const propiedadesFormateadas = resultados.map((p) => {
      const titulo =
        typeof p.titulo === 'object' && p.titulo !== null
          ? p.titulo.es || p.titulo.en || 'Villa'
          : p.titulo || 'Villa';

      return {
        referencia: p.referencia || 'N/A',
        titulo,
        precio: p.precio,
        municipio: p.zona,
        habitaciones: p.habitaciones ?? 'No disp.',
        url: `${BASE_URL}/${locale}/propiedades/${p.slug}`,
      };
    });

    return {
      success: true,
      cantidad: propiedadesFormateadas.length,
      tipo_coincidencia: tipoMatch,
      propiedades: propiedadesFormateadas,
    };

  } catch (error: any) {
    console.error('[Supabase] Error en búsqueda:', error.message);
    return { success: false, error: error.message };
  }
}
