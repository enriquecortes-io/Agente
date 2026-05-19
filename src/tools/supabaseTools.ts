import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Usamos valores por defecto por si el .env.local aún no tiene las credenciales reales
const supabaseUrl = process.env.SUPABASE_URL || 'https://tu-proyecto.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'tu-key';

export const supabase = createClient(supabaseUrl, supabaseKey);

interface SearchFilters {
  zona?: string;
  precioMax?: number;
  estilo?: string;
}

export async function searchPropertiesInSupabase(filters: SearchFilters) {
  try {
    let query = supabase
      .from('properties')
      .select('*')
      .eq('status', 'Publicada');

    if (filters.zona) {
      query = query.ilike('location', `%${filters.zona}%`);
    }

    if (filters.precioMax) {
      query = query.lte('price', filters.precioMax);
    }

    if (filters.estilo) {
      query = query.ilike('lifestyle_tags', `%${filters.estilo}%`);
    }

    const { data, error } = await query.limit(3);

    // Si da error de conexión (porque las credenciales son falsas o la tabla no existe aún), forzamos el catch
    if (error) throw error;
    
    // Si la conexión va bien pero no hay datos, devolvemos un mock
    if (!data || data.length === 0) {
      return [{
        id: 'mock-1',
        title: 'Villa Serenity',
        location: 'La Zagaleta',
        price: 6500000,
        lifestyle_tags: ['privacidad', 'vistas al mar', 'minimalista', 'arquitectura orgánica'],
        status: 'Publicada'
      }];
    }

    return data;
  } catch (error) {
    console.warn('[Supabase Tool] Aviso: Error de conexión o credenciales no válidas. Sirviendo datos mockeados para la simulación.');
    // Devolvemos datos simulados para que el Agente pueda continuar el test y veas cómo redacta
    return [{
      id: 'mock-1',
      title: 'Villa Serenity (Off-Market)',
      location: 'La Zagaleta',
      price: 6500000,
      lifestyle_tags: ['privacidad absoluta', 'vistas al mar', 'minimalista', 'arquitectura orgánica'],
      status: 'Off-Market'
    }];
  }
}
