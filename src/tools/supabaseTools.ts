import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function searchPropertiesInSupabase(args: { zona?: string; precioMax?: number }) {
  try {
    if (!supabaseUrl || !supabaseKey) {
      return { success: false, error: 'Faltan credenciales de Supabase (SUPABASE_URL y SUPABASE_ANON_KEY) en .env.local' };
    }

    // Empezamos a construir la consulta a tu tabla 'properties'
    let query = supabase
      .from('properties')
      .select('id, referencia, titulo, precio, ubicacion, zona, habitaciones, banos, m2_construidos')
      .eq('activa', true) // Solo buscamos propiedades que estén activas
      .limit(5);

    // Si Harvis detecta una zona, buscamos tanto en la columna 'ubicacion' como en 'zona'
    if (args.zona) {
      query = query.or(`ubicacion.ilike.%${args.zona}%,zona.ilike.%${args.zona}%`);
    }

    // Si Harvis detecta un presupuesto máximo, filtramos por precio
    if (args.precioMax) {
      query = query.lte('precio', args.precioMax);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error consultando Supabase:", error);
      return { success: false, error: error.message };
    }

    // Formateamos los datos para que Gemini los mastique fácilmente 
    // (Como tu título es JSONB, extraemos el texto para que la IA no se líe)
    const propiedadesFormateadas = data.map(p => ({
      id: p.id,
      referencia: p.referencia || 'N/A',
      // Intentamos sacar el título, si es un objeto JSON sacamos la propiedad 'es' o 'en'
      titulo: typeof p.titulo === 'object' && p.titulo !== null ? (p.titulo.es || p.titulo.en || JSON.stringify(p.titulo)) : p.titulo,
      precio: p.precio,
      ubicacion: p.ubicacion || p.zona,
      habitaciones: p.habitaciones,
      banos: p.banos,
      m2_construidos: p.m2_construidos
    }));

    return { 
      success: true, 
      cantidad_encontrada: propiedadesFormateadas.length, 
      propiedades: propiedadesFormateadas 
    };
    
  } catch (error: any) {
    console.error('Error al conectar con Supabase:', error);
    return { success: false, error: error.message };
  }
}
