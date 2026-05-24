import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function searchPropertiesInSupabase(args: { urbanizacion?: string; municipioDeducido?: string; precioMax?: number }) {
  try {
    if (!supabaseUrl || !supabaseKey) {
      return { success: false, error: 'Faltan credenciales de Supabase en .env.local' };
    }

    let query = supabase
      .from('properties')
      .select('id, referencia, titulo, precio, ubicacion, zona, habitaciones, banos')
      .eq('activa', true)
      .limit(5);

    // 🧠 BÚSQUEDA DINÁMICA: Usamos tanto la urba como el municipio deducido
    const orConditions = [];
    
    if (args.urbanizacion && args.urbanizacion !== 'undefined') {
      const urba = args.urbanizacion.toLowerCase();
      orConditions.push(`ubicacion.ilike.%${urba}%,zona.ilike.%${urba}%`);
    }
    
    if (args.municipioDeducido && args.municipioDeducido !== 'undefined') {
      const muni = args.municipioDeducido.toLowerCase();
      orConditions.push(`zona.ilike.%${muni}%,ubicacion.ilike.%${muni}%`);
    }

    if (orConditions.length > 0) {
      query = query.or(orConditions.join(','));
    }

    if (args.precioMax) {
      query = query.lte('precio', args.precioMax);
    }

    const { data, error } = await query;

    if (error) return { success: false, error: error.message };

    const propiedadesFormateadas = data.map(p => ({
      referencia: p.referencia || 'N/A',
      titulo: typeof p.titulo === 'object' && p.titulo !== null ? (p.titulo.es || p.titulo.en || JSON.stringify(p.titulo)) : p.titulo,
      precio: p.precio,
      municipio_bd: p.zona,
      ubicacion_bd: p.ubicacion
    }));

    return { success: true, cantidad: propiedadesFormateadas.length, propiedades: propiedadesFormateadas };
    
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
