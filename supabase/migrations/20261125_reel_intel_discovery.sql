-- ═══════════════════════════════════════════════════════════════
-- HARVIS — Reel Intelligence: descubrimiento automático de cuentas
-- Añade 'zona' como tipo de fuente (seed de descubrimiento) y
-- distingue fuentes añadidas a mano ('manual') de las que el propio
-- sistema encuentra solo a partir de zonas/hashtags ('auto').
-- Aplicar en el proyecto Supabase de TEM (SUPABASE_URL)
-- ═══════════════════════════════════════════════════════════════

alter table public.ig_fuentes
  add column if not exists origen text not null default 'manual' check (origen in ('manual', 'auto'));

alter table public.ig_fuentes drop constraint if exists ig_fuentes_tipo_check;
alter table public.ig_fuentes
  add constraint ig_fuentes_tipo_check check (tipo in ('cuenta', 'hashtag', 'zona'));
