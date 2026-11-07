-- Tabla para posts de redes sociales programados via Metricool
create table if not exists public.social_posts (
  id           uuid primary key default gen_random_uuid(),
  texto        text not null,
  redes        text[] not null default '{}',
  scheduled_at timestamptz not null,
  status       text not null default 'draft'
                 check (status in ('draft','scheduled','published','failed')),
  metricool_id text,
  imagen_url   text,
  proyecto     text,
  created_at   timestamptz not null default now()
);

-- Índices útiles
create index if not exists social_posts_proyecto_idx    on public.social_posts (proyecto);
create index if not exists social_posts_scheduled_at_idx on public.social_posts (scheduled_at desc);
create index if not exists social_posts_status_idx      on public.social_posts (status);

-- RLS
alter table public.social_posts enable row level security;

-- Solo el service role puede leer/escribir (acceso desde servidor)
create policy "service_role_all" on public.social_posts
  for all
  using (true)
  with check (true);
