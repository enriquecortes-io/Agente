-- ═══════════════════════════════════════════════════════════════
-- HARVIS — Producción de reels: del guion ganador al vídeo montado
-- 1. propiedad_media: catálogo visual del material de cada propiedad
--    (se cataloga una vez y se reutiliza para cualquier guion)
-- 2. producciones: cada guion convertido en un reel, con sus estados
-- ═══════════════════════════════════════════════════════════════

-- 1. Catálogo del material (fotos/clips) de una carpeta de Drive.
--    La descripción la genera la IA mirando la imagen, porque los
--    nombres de archivo del fotógrafo no dicen nada.
create table if not exists public.propiedad_media (
  id             uuid primary key default gen_random_uuid(),
  carpeta_id     text not null,              -- id de la carpeta de Drive
  drive_file_id  text not null unique,
  nombre         text not null,
  mime           text not null,
  es_video       boolean not null default false,
  thumbnail_url  text,
  -- Lo que la IA ve en la imagen
  descripcion    text,
  estancia       text,                       -- salón, cocina, piscina, fachada, dormitorio...
  tipo_plano     text,                       -- general, detalle, aéreo, interior, exterior
  momento_dia    text,                       -- día, atardecer, noche
  calidad        int,                        -- 1-5, para descartar fotos flojas
  etiquetas      text[] default '{}',
  analizado      boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists propiedad_media_carpeta_idx on public.propiedad_media (carpeta_id);

-- 2. Una producción = un guion del plan convertido en reel
create table if not exists public.producciones (
  id             uuid primary key default gen_random_uuid(),
  marca          text not null check (marca in ('tem','solena','smc')),
  guion_id       uuid references public.contenido_plan(id) on delete cascade,
  carpeta_id     text not null,              -- carpeta de Drive con el material
  estado         text not null default 'preparando'
                 check (estado in ('preparando','emparejado','montando','revision','aprobado','rechazado','publicado','error')),
  paso           text,                       -- descripción legible del paso actual
  -- Guion técnico resuelto: qué archivo va en cada plano y cuánto dura
  plan_montaje   jsonb,
  voz_url        text,
  video_url      text,
  feedback       text,                       -- lo que pides cambiar al revisar
  error          text,
  -- Para los botones Aprobar/Rechazar/Mejorar del email, sin exigir login
  token          text not null default encode(gen_random_bytes(24), 'hex'),
  created_at     timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);
create index if not exists producciones_marca_estado_idx on public.producciones (marca, estado);
create index if not exists producciones_token_idx on public.producciones (token);

alter table public.propiedad_media enable row level security;
alter table public.producciones    enable row level security;
