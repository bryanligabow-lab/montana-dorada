-- ============================================================================
-- SCHEMA SUPABASE — Bot Montaña Dorada
-- ============================================================================
-- Instrucciones de uso:
--   1) Crear proyecto en https://supabase.com
--   2) SQL Editor → pegar este archivo → Run
--   3) Ejecutar también: storage-policies.sql
--   4) Crear buckets en Storage (ver sección al final de este archivo)
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Extensiones
-- -----------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "vector";  -- pgvector para búsqueda semántica

-- -----------------------------------------------------------------------------
-- Tabla: dishes (catálogo de platos del restaurante)
-- -----------------------------------------------------------------------------
create table if not exists public.dishes (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,                    -- ej: "Ají de gallina"
  category        text not null,                    -- asados, mariscos, ceviches, alitas, costillas, etc.
  tags            text[] default '{}',              -- ingredientes visibles, técnicas, etc.
  description     text not null,                    -- descripción rica para embedding
  quality_score   smallint default 3,               -- 1-5, calidad fotográfica original
  source          text not null default 'drive',    -- drive / user_upload / web / generated
  storage_original text,                            -- path en bucket dishes-original/
  storage_enhanced text,                            -- path en bucket dishes-enhanced/ (versión 4K pulida)
  storage_cutout   text,                            -- path en bucket dishes-cutout/ (PNG sin fondo) opcional
  embedding       vector(1536),                     -- OpenAI text-embedding-3-small
  metadata        jsonb default '{}'::jsonb,        -- { width, height, heic_origin, gemini_tags, ... }
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists dishes_category_idx   on public.dishes (category);
create index if not exists dishes_tags_idx       on public.dishes using gin (tags);
create index if not exists dishes_embedding_idx  on public.dishes using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- -----------------------------------------------------------------------------
-- Tabla: brand_config (configuración de marca, singleton-ish)
-- -----------------------------------------------------------------------------
create table if not exists public.brand_config (
  id              uuid primary key default uuid_generate_v4(),
  brand_name      text not null,
  slogan          text not null,
  cuisine_desc    text not null,
  palette         jsonb not null,
  fonts           jsonb not null,
  logo_urls       jsonb not null,     -- { original, cutout, small, white, gold }
  formats         jsonb not null,     -- { post_cuadrado: {w,h,scale}, historia: {...}, ... }
  slogan_categories text[] not null,  -- ASADOS, MARISCOS, PARRILLADAS, ...
  contact         jsonb default '{}'::jsonb,
  active          boolean default true,
  created_at      timestamptz default now()
);

-- -----------------------------------------------------------------------------
-- Tabla: chat_sessions (memoria ligera entre mensajes, además de la de n8n)
-- -----------------------------------------------------------------------------
create table if not exists public.chat_sessions (
  chat_id         text primary key,      -- telegram chat id
  last_design_url text,
  last_design_html text,
  last_brief      jsonb,
  last_dish_ids   uuid[],
  message_count   integer default 0,
  updated_at      timestamptz default now()
);

-- -----------------------------------------------------------------------------
-- Tabla: generation_cache (cache de generaciones caras — Replicate/Gemini)
-- -----------------------------------------------------------------------------
create table if not exists public.generation_cache (
  cache_key       text primary key,      -- sha256 del prompt + modelo
  provider        text not null,         -- gemini / replicate / flux / openai
  prompt          text not null,
  storage_url     text not null,         -- URL pública de la imagen en Supabase Storage
  cost_usd        numeric(10,6) default 0,
  hits            integer default 0,     -- cuántas veces se ha reutilizado
  created_at      timestamptz default now(),
  last_hit_at     timestamptz default now()
);

create index if not exists generation_cache_provider_idx on public.generation_cache (provider);

-- -----------------------------------------------------------------------------
-- Función RPC: search_dishes (búsqueda semántica por embedding)
-- -----------------------------------------------------------------------------
create or replace function public.search_dishes(
  query_embedding  vector(1536),
  match_threshold  float default 0.75,
  match_count      int default 3,
  category_filter  text default null
)
returns table (
  id               uuid,
  name             text,
  category         text,
  tags             text[],
  description      text,
  storage_enhanced text,
  storage_original text,
  similarity       float
)
language sql stable
as $$
  select
    d.id,
    d.name,
    d.category,
    d.tags,
    d.description,
    d.storage_enhanced,
    d.storage_original,
    1 - (d.embedding <=> query_embedding) as similarity
  from public.dishes d
  where d.embedding is not null
    and (category_filter is null or d.category = category_filter)
    and 1 - (d.embedding <=> query_embedding) > match_threshold
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

-- -----------------------------------------------------------------------------
-- Función RPC: get_brand_config (siempre la activa)
-- -----------------------------------------------------------------------------
create or replace function public.get_brand_config()
returns public.brand_config
language sql stable
as $$
  select * from public.brand_config where active = true order by created_at desc limit 1;
$$;

-- -----------------------------------------------------------------------------
-- Función RPC: upsert_chat_session
-- -----------------------------------------------------------------------------
create or replace function public.upsert_chat_session(
  p_chat_id         text,
  p_last_design_url text default null,
  p_last_design_html text default null,
  p_last_brief      jsonb default null,
  p_last_dish_ids   uuid[] default null
)
returns public.chat_sessions
language plpgsql
as $$
declare
  result public.chat_sessions;
begin
  insert into public.chat_sessions (chat_id, last_design_url, last_design_html, last_brief, last_dish_ids, message_count, updated_at)
  values (p_chat_id, p_last_design_url, p_last_design_html, p_last_brief, p_last_dish_ids, 1, now())
  on conflict (chat_id) do update set
    last_design_url  = coalesce(excluded.last_design_url,  chat_sessions.last_design_url),
    last_design_html = coalesce(excluded.last_design_html, chat_sessions.last_design_html),
    last_brief       = coalesce(excluded.last_brief,       chat_sessions.last_brief),
    last_dish_ids    = coalesce(excluded.last_dish_ids,    chat_sessions.last_dish_ids),
    message_count    = chat_sessions.message_count + 1,
    updated_at       = now()
  returning * into result;

  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Función RPC: cache_lookup_or_null
-- -----------------------------------------------------------------------------
create or replace function public.cache_lookup(p_cache_key text)
returns public.generation_cache
language plpgsql
as $$
declare
  result public.generation_cache;
begin
  update public.generation_cache
     set hits = hits + 1, last_hit_at = now()
   where cache_key = p_cache_key
  returning * into result;
  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Trigger: updated_at en dishes
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists dishes_touch on public.dishes;
create trigger dishes_touch before update on public.dishes
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- BUCKETS DE STORAGE (crear manualmente en Supabase Dashboard → Storage)
-- ============================================================================
-- Nombre                   | Público | Notas
-- -------------------------|---------|----------------------------------------
-- dishes-original          | SÍ      | JPG originales del Drive
-- dishes-enhanced          | SÍ      | PNG/JPG 4K mejorados (post-processing)
-- dishes-cutout            | SÍ      | PNG transparentes sin fondo
-- brand                    | SÍ      | Logos y variantes
-- brand-lifestyle          | SÍ      | Fotos del local, uniforme, staff
-- user-uploads             | SÍ      | Subidos por usuarios en runtime
-- generated                | SÍ      | Generaciones IA cacheadas
-- ============================================================================

-- ============================================================================
-- SEED brand_config INICIAL (editar valores reales después)
-- ============================================================================
insert into public.brand_config (brand_name, slogan, cuisine_desc, palette, fonts, logo_urls, formats, slogan_categories, contact)
values (
  'Montaña Dorada',
  'Lo mejor en asados & mariscos',
  'criolla/peruana mixta: asados, mariscos, parrilladas, platos criollos, alitas, costillas, ensaladas con camarón',
  '{
    "negro_fondo": "#0A0A0A",
    "negro_profundo": "#1A0F0A",
    "marron_tostado": "#3A2416",
    "naranja_llama": "#F57C00",
    "naranja_brasa": "#E65100",
    "rojo_fuego": "#D32F2F",
    "dorado_calido": "#FFB347",
    "dorado_brillo": "#FFD27F",
    "blanco_hueso": "#F5F1EA",
    "blanco_puro": "#FFFFFF",
    "gris_humo": "#6B6258"
  }'::jsonb,
  '{
    "imports": "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@400;600;700&family=Anton&family=Montserrat:wght@200;300;400;500;600;700;900&family=Inter:wght@200;300;400;500;600;800&family=Allura&family=Dancing+Script:wght@400;700&family=Great+Vibes&display=swap",
    "display_condensed": ["Bebas Neue", "Oswald 700", "Anton"],
    "script_cursiva":    ["Allura", "Great Vibes", "Dancing Script"],
    "body_sans":         ["Inter", "Montserrat"]
  }'::jsonb,
  '{
    "original":   "https://REPLACE.supabase.co/storage/v1/object/public/brand/logo-original.png",
    "cutout":     "https://REPLACE.supabase.co/storage/v1/object/public/brand/logo-cutout.png",
    "small":      "https://REPLACE.supabase.co/storage/v1/object/public/brand/logo-small.png",
    "white":      "https://REPLACE.supabase.co/storage/v1/object/public/brand/logo-white.png",
    "gold":       "https://REPLACE.supabase.co/storage/v1/object/public/brand/logo-gold.png"
  }'::jsonb,
  '{
    "post_cuadrado":   {"width": 1080, "height": 1080, "scale": 2},
    "post_vertical":   {"width": 1080, "height": 1350, "scale": 2},
    "historia":        {"width": 1080, "height": 1920, "scale": 2},
    "banner_horizontal": {"width": 1920, "height": 1080, "scale": 2},
    "carta_a4":        {"width": 2480, "height": 3508, "scale": 1, "dpi": 300}
  }'::jsonb,
  array['ASADOS','MARISCOS','PARRILLADAS','CEVICHES','COSTILLAS','ALITAS','LANGOSTINOS','PLATOS CRIOLLOS','CORTES','ARROCES'],
  '{"telefono":"","whatsapp":"","direccion":"","instagram":"@montanadorada"}'::jsonb
)
on conflict do nothing;
