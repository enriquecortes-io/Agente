import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function searchPropertiesInSupabase(args: { zona?: string; precioMax?: number }) {
  try {
    if (!supabaseUrl || !supabaseKey) {
      return { success: false, error: 'Faltan credenciales de Supabase en .env.local' };
    }

    let query = supabase
      .from('properties')
      .select('id, referencia, titulo, precio, ubicacion, zona, habitaciones, banos')
      .eq('activa', true)
      .limit(5);

    // CEREBRO GEOGRÁFICO: Expansión de zonas
    if (args.zona) {
      const zonaBuscada = args.zona.toLowerCase();
      
      // Si busca Zagaleta, abrimos el abanico a Benahavis en la columna 'zona' o 'ubicacion'
      if (zonaBuscada.includes('zagaleta')) {
        query = query.or(`ubicacion.ilike.%zagaleta%,zona.ilike.%zagaleta%,ubicacion.ilike.%benahavis%,zona.ilike.%benahavis%`);
      } else {
        query = query.or(`ubicacion.ilike.%${args.zona}%,zona.ilike.%${args.zona}%`);
      }
    }

    if (args.precioMax) {
      query = query.lte('precio', args.precioMax);
    }

    const { data, error } = await query;

    if (error) return { success: false, error: error.message };

    const propiedadesFormateadas = data.map(p => ({
      referencia: p.referencia || 'N/A',
      titulo: typeof p.titulo === 'object' && p.titulo !== null ? (p.titulo.es || p.titulo.en) : p.titulo,
      precio: p.precio,
      ubicacion: p.ubicacion,
      zona: p.zona
    }));

    return { success: true, cantidad: propiedadesFormateadas.length, propiedades: propiedadesFormateadas };
    
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
