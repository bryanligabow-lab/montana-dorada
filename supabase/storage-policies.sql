-- ============================================================================
-- POLÍTICAS DE STORAGE — Bot Montaña Dorada
-- ============================================================================
-- Todos los buckets son PÚBLICOS de lectura (el bot sirve URLs en HTML público).
-- La escritura se hace con service_role key desde n8n y el script de ingesta,
-- por lo tanto no se necesitan políticas de INSERT/UPDATE para usuarios anon.
--
-- Estas políticas aseguran que cualquiera pueda LEER los assets por URL pública,
-- que es justamente lo que queremos (imágenes servidas en Telegram etc.).
-- ============================================================================

-- Helper: crear política de lectura pública por bucket
do $$
declare
  b text;
  bucket_list text[] := array[
    'dishes-original',
    'dishes-enhanced',
    'dishes-cutout',
    'brand',
    'brand-lifestyle',
    'user-uploads',
    'generated'
  ];
begin
  foreach b in array bucket_list loop
    -- Política de SELECT público
    execute format($fmt$
      drop policy if exists "public_read_%1$s" on storage.objects;
    $fmt$, b);

    execute format($fmt$
      create policy "public_read_%1$s"
      on storage.objects for select
      to public
      using ( bucket_id = %2$L );
    $fmt$, b, b);
  end loop;
end $$;

-- ============================================================================
-- NOTA: la escritura a los buckets se hace con la SERVICE_ROLE_KEY desde
-- n8n (credential HTTP header: apikey + authorization) y desde el script
-- drive-ingest.mjs. La service_role key bypassa todas las RLS por diseño.
-- ============================================================================
