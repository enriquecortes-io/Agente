-- ═══════════════════════════════════════════════════════════════
-- HARVIS — Reel Intelligence: seguimiento en vivo de cada ejecución
-- Permite mostrar una barra de estado ("escaneando fuente 2/4",
-- "analizando reels 3/10"...) en vez de una caja negra.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.ig_runs (
  id           uuid primary key default gen_random_uuid(),
  marca        text not null check (marca in ('tem','solena','smc')),
  estado       text not null default 'en_curso' check (estado in ('en_curso','completado','error')),
  paso         text,                        -- descripción legible del paso actual
  error        text,
  creado_at    timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);
create index if not exists ig_runs_marca_idx on public.ig_runs (marca, creado_at desc);

alter table public.ig_runs enable row level security;
