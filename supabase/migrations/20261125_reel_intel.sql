-- ═══════════════════════════════════════════════════════════════
-- HARVIS — Reel Intelligence (Análisis de competencia + Contenido)
-- Aplicar en el proyecto Supabase de TEM (SUPABASE_URL)
-- ═══════════════════════════════════════════════════════════════

-- 1. Fuentes a vigilar: cuentas de competidores o hashtags, por marca
create table if not exists public.ig_fuentes (
  id          uuid primary key default gen_random_uuid(),
  marca       text not null check (marca in ('tem','solena','smc')),
  tipo        text not null check (tipo in ('cuenta','hashtag')),
  valor       text not null,               -- username sin @ o hashtag sin #
  activa      boolean not null default true,
  ultimo_scrape timestamptz,
  created_at  timestamptz not null default now(),
  unique (marca, tipo, valor)
);

-- 2. Reels scrapeados con métricas y puntuación
create table if not exists public.ig_reels (
  id            uuid primary key default gen_random_uuid(),
  short_code    text not null unique,
  url           text not null,
  owner         text not null,
  fuente_id     uuid references public.ig_fuentes(id) on delete set null,
  marca         text not null,
  caption       text,
  hashtags      text[] default '{}',
  views         bigint default 0,
  likes         bigint default 0,
  comments      bigint default 0,
  duracion_seg  numeric,
  publicado_at  timestamptz,
  thumbnail_url text,
  -- Puntuación: views del reel / mediana de views de esa cuenta.
  -- >3 = outlier (el reel funcionó muy por encima de lo normal en esa cuenta)
  outlier_score numeric default 0,
  engagement_rate numeric default 0,       -- (likes + comments) / views
  analizado     boolean not null default false,
  analisis      jsonb,                     -- desglose del reel hecho por Claude
  scraped_at    timestamptz not null default now()
);
create index if not exists ig_reels_marca_score_idx on public.ig_reels (marca, outlier_score desc);
create index if not exists ig_reels_owner_idx on public.ig_reels (owner);

-- 3. Patrones extraídos de los mejores reels (un informe por ejecución)
create table if not exists public.ig_patrones (
  id          uuid primary key default gen_random_uuid(),
  marca       text not null,
  reels_base  uuid[] default '{}',          -- reels usados como referencia
  patrones    jsonb not null,               -- ganchos, formatos, duración, estructura, CTA...
  created_at  timestamptz not null default now()
);

-- 4. Plan de contenido generado: guiones listos para grabar
create table if not exists public.contenido_plan (
  id            uuid primary key default gen_random_uuid(),
  marca         text not null,
  patron_id     uuid references public.ig_patrones(id) on delete set null,
  reel_referencia uuid references public.ig_reels(id) on delete set null,
  titulo        text not null,
  formato       text,                       -- p.ej. "tour POV", "antes/después", "precio reveal"
  gancho        text,                       -- primeros 3 segundos
  guion         jsonb,                      -- [{seg, plano, texto_pantalla, voz}]
  caption       text,
  hashtags      text[] default '{}',
  duracion_seg  int,
  propiedad_slug text,
  estado        text not null default 'idea'
                check (estado in ('idea','aprobado','grabado','publicado','descartado')),
  fecha_prevista date,
  created_at    timestamptz not null default now()
);
create index if not exists contenido_plan_marca_estado_idx on public.contenido_plan (marca, estado);

-- RLS: solo el service role (backend de Harvis) accede
alter table public.ig_fuentes     enable row level security;
alter table public.ig_reels       enable row level security;
alter table public.ig_patrones    enable row level security;
alter table public.contenido_plan enable row level security;
