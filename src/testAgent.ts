import { searchPropertiesInSupabase } from './tools/supabaseTools.js';
import { prepararEntornoCliente, actualizarHistorial, borrarCarpetasAntiguas } from './tools/driveLogger.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// ... (El resto de la lógica de fetch a NVIDIA se mantiene igual)
// En la lógica de chat, ahora extraemos: 
// { "tipoLead": "Venta|Captacion|Gestion", "nombreCliente": "...", ... }
