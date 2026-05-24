import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function searchPropertiesInSupabase(args: { urbanizacion?: string; municipioDeducido?: string; precioMax?: number }) {
  try {
    if (!supabaseUrl || !supabaseKey) return { success: false, error: 'Faltan credenciales' };

    // FUNCIÓN DE BÚSQUEDA INTERNA
    const hacerBusqueda = async (precioMax: number | undefined, requiereZona: boolean) => {
      let query = supabase.from('properties').select('id, referencia, titulo, precio, ubicacion, zona, habitaciones, banos').eq('activa', true).limit(3);

      if (requiereZona && (args.urbanizacion || args.municipioDeducido)) {
        const orConditions = [];
        if (args.urbanizacion) {
          const urba = args.urbanizacion.toLowerCase();
          orConditions.push(`ubicacion.ilike.%${urba}%,zona.ilike.%${urba}%`);
        }
        if (args.municipioDeducido) {
          const muni = args.municipioDeducido.toLowerCase();
          orConditions.push(`zona.ilike.%${muni}%,ubicacion.ilike.%${muni}%`);
        }
        query = query.or(orConditions.join(','));
      }

      if (precioMax) query = query.lte('precio', precioMax);
      
      const { data } = await query;
      return data || [];
    };

    // INTENTO 1: Búsqueda Exacta
    let resultados = await hacerBusqueda(args.precioMax, true);
    let tipoMatch = 'exacto';

    // INTENTO 2: Relajamos el precio un 20%
    if (resultados.length === 0 && args.precioMax) {
      resultados = await hacerBusqueda(args.precioMax * 1.2, true);
      tipoMatch = 'precio_aproximado';
    }

    // INTENTO 3: Quitamos el filtro de zona y buscamos solo por precio
    if (resultados.length === 0) {
      resultados = await hacerBusqueda(args.precioMax, false);
      tipoMatch = 'zona_aproximada';
    }

    const propiedadesFormateadas = resultados.map(p => ({
      referencia: p.referencia || 'N/A',
      titulo: typeof p.titulo === 'object' && p.titulo !== null ? (p.titulo.es || p.titulo.en || 'Villa') : p.titulo,
      precio: p.precio,
      municipio: p.zona,
      habitaciones: p.habitaciones || 'No disp.'
    }));

    return { 
      success: true, 
      cantidad: propiedadesFormateadas.length, 
      tipo_coincidencia: tipoMatch, // 'exacto', 'precio_aproximado' o 'zona_aproximada'
      propiedades: propiedadesFormateadas 
    };
    
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
