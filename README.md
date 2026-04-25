# Bot Montaña Dorada — Guía de puesta en marcha

Bot de Telegram que actúa como **departamento de marketing automatizado** para el restaurante Montaña Dorada. Genera piezas gráficas de nivel fotografía profesional (Instagram, stories, banners, cartas A4 imprimibles) a partir de texto, mensajes de voz o fotos de platos.

## Arquitectura (sin VPS, solo APIs)

```
Telegram ──▶ n8n (EasyPanel) ──▶ Claude Sonnet 4.6 (Orchestrator)
                                      │
           ┌──────────────────────────┼────────────────────────────┐
           ▼                          ▼                            ▼
    Supabase (catálogo           Gemini 2.5 Flash            htmlcsstoimage
    de platos + pgvector)        Image + Flux Ultra          (HTML → PNG 4K)
                                 (Replicate)

      OpenAI Whisper (voz)  ·  OpenAI Embeddings  ·  Brave Search (fallback)
```

No hay servidor que mantener. Todo vive en servicios en la nube + el n8n que ya tienes.

---

## Estructura del repo

```
montaña Dorada/
├── brand/                     ← Paleta, guía de marca, logos
│   ├── palette.json
│   └── brand-guidelines.md
├── supabase/                  ← SQL para el proyecto Supabase
│   ├── schema.sql
│   └── storage-policies.sql
├── scripts/                   ← Scripts locales (one-shot) para poblar el catálogo
│   ├── drive-ingest.mjs       ← importa fotos de Google Drive
│   ├── enhance-batch.mjs      ← mejora las que tienen baja calidad
│   ├── package.json
│   └── .env.example
├── templates/                 ← Plantillas HTML que usa el Orchestrator
│   ├── A-studio-shot.html     ← estilo Paranoía
│   ├── B-ambient-cinematic.html  ← estilo Restful
│   └── C-action-branded.html  ← estilo Montaña Dorada con slogan
├── prompts/                   ← System prompts de cada agente
│   ├── orchestrator-system.md
│   ├── intent-classifier.md
│   ├── brand-guardian.md
│   ├── composer.md
│   └── qa-reviewer.md
└── n8n-workflow/
    └── montana-dorada-bot-v1.json
```

---

## Paso 1 — Crear cuentas y credenciales

Necesitas crearte / abrir cuenta en cada uno y obtener la API key:

| Servicio | URL | Costo |
|---|---|---|
| Anthropic (Claude) | https://console.anthropic.com | $5 crédito inicial |
| Google AI Studio (Gemini) | https://aistudio.google.com/app/apikey | gratis hasta cuota |
| Replicate (Flux + Real-ESRGAN) | https://replicate.com/account/api-tokens | $10 crédito inicial |
| OpenAI (Whisper + embeddings) | https://platform.openai.com/api-keys | $5 inicial |
| Supabase | https://supabase.com | gratis |
| htmlcsstoimage | https://htmlcsstoimage.com | $14/mes (plan Starter 1,000 imágenes) |
| Brave Search API | https://brave.com/search/api | 2,000 queries gratis/mes |
| Telegram BotFather | https://t.me/BotFather | gratis |
| Google Cloud Service Account | https://console.cloud.google.com | gratis (solo para Drive readonly) |

Guárdalas todas en un 1Password/Bitwarden.

---

## Paso 2 — Configurar Supabase

1. **Crear proyecto** en https://supabase.com/dashboard
2. Tomar nota de `SUPABASE_URL` y de la **service_role key** (Settings → API)
3. **SQL Editor** → pegar `supabase/schema.sql` → Run
4. **SQL Editor** → pegar `supabase/storage-policies.sql` → Run
5. **Storage** → crear estos buckets (todos marcados como **Public**):
   - `dishes-original`
   - `dishes-enhanced`
   - `dishes-cutout`
   - `brand`
   - `brand-lifestyle`
   - `user-uploads`
   - `generated`
6. Subir al bucket `brand` tu logo en 5 variantes:
   - `logo-original.png` (tal cual)
   - `logo-cutout.png` (PNG transparente — se puede generar con remove.bg)
   - `logo-small.png` (versión 120px ancho)
   - `logo-white.png` (monocromática blanca)
   - `logo-gold.png` (monocromática dorada #FFB347)
7. Copiar las URLs públicas y actualizar la fila de `brand_config`:
   ```sql
   update public.brand_config set logo_urls = '{
     "original": "https://TU_PROYECTO.supabase.co/storage/v1/object/public/brand/logo-original.png",
     "cutout":   "https://TU_PROYECTO.supabase.co/storage/v1/object/public/brand/logo-cutout.png",
     "small":    "https://TU_PROYECTO.supabase.co/storage/v1/object/public/brand/logo-small.png",
     "white":    "https://TU_PROYECTO.supabase.co/storage/v1/object/public/brand/logo-white.png",
     "gold":     "https://TU_PROYECTO.supabase.co/storage/v1/object/public/brand/logo-gold.png"
   }'::jsonb where active = true;
   ```

---

## Paso 3 — Ingesta del Google Drive

Esto corre **en tu Mac, una sola vez** (y cuando agregues nuevas fotos).

```bash
cd "/Users/Bryan/montaña Dorada/scripts"
npm install
cp .env.example .env
```

Editar `.env` con tus claves. Para `GOOGLE_SERVICE_ACCOUNT_JSON`:
1. https://console.cloud.google.com/iam-admin/serviceaccounts → crear service account
2. Generar key JSON → descargar
3. **Compartir tu folder de Drive** con el email del service account (como viewer)
4. Guardar el JSON descargado en `scripts/google-sa.json` (o la ruta que pongas en `.env`)

Ejecutar:
```bash
node drive-ingest.mjs
```

Salida esperada:
```
🔎 Listing Drive folder...
   Found 45 files.
   38 images, 7 non-image (videos/etc) skipped.

→ IMG_1583.JPG (image/jpeg)
  downloaded + normalized (2.4 MB)
  ✓ ají de gallina (categoria=platos_criollos, calidad=3/5)
  ✓ upserted dish 7f3a1e...

→ IMG_7709.HEIC (image/heic)
  downloaded + normalized (3.1 MB)
  ✓ langostinos empanizados (categoria=langostinos, calidad=4/5)
...

================ REPORT ================
{
  "processed": 32,
  "skipped_non_food": 6,
  "errors": 0,
  "cost_estimate_usd": 0.076
}
```

(Opcional) Mejorar las fotos con calidad baja:
```bash
node enhance-batch.mjs
```

---

## Paso 4 — Configurar n8n

### 4.1 Crear credenciales en n8n

En n8n → **Credentials** → **New**, crear:

| Nombre | Tipo | Valores |
|---|---|---|
| Telegram Montaña Dorada | Telegram API | Access Token del bot de BotFather |
| OpenAI Header Auth | HTTP Header Auth | Name: `Authorization` / Value: `Bearer sk-...` |
| Supabase Service Role | HTTP Header Auth | Name: `apikey` / Value: `eyJ...` (service_role) **y en la misma credencial** añadir también `Authorization`: `Bearer eyJ...` |
| htmlcsstoimage Basic | HTTP Basic Auth | user: `TU_USER_ID` / pass: `TU_API_KEY` de htmlcsstoimage |
| Anthropic API | Anthropic | Tu `sk-ant-...` |

### 4.2 Variables de entorno en n8n

En las settings de n8n agregar (o inyectar en el docker compose):
```
SUPABASE_PROJECT=tuproyecto   # solo el subdominio, sin https://
GEMINI_API_KEY=...
REPLICATE_API_TOKEN=...
BRAVE_API_KEY=...
```

Estas las usa el workflow en los placeholders `{{ $credentials.xxx }}` / `{{ $env.xxx }}`.

### 4.3 Importar el workflow

1. n8n → **Workflows** → **Import from file** → elegir `n8n-workflow/montana-dorada-bot-v1.json`
2. En el nodo **Orchestrator Agent** → pegar el contenido completo de `prompts/orchestrator-system.md` en `System Message`
3. En el nodo **Tool: qa_review** → pegar el contenido de `prompts/qa-reviewer.md` (la sección "System Prompt del QA Reviewer") en el campo `system` del body JSON
4. Conectar cada tool node a su credencial correspondiente
5. **Activar** el workflow
6. Copiar la URL del webhook del Telegram Trigger y registrarla con BotFather si hace falta (generalmente n8n lo maneja automáticamente al conectar la credential)

---

## Paso 5 — Probar

En Telegram, abre tu bot y prueba estos casos:

| Mensaje | Resultado esperado |
|---|---|
| "Hola" | Respuesta de saludo |
| "Hazme un post promocionando el 2x1 en alitas los jueves" | Imagen template C con slogan "Lo mejor, EN ALITAS." + texto 2×1 JUEVES |
| (foto de un plato tuyo) + "Mejórala con fondo oscuro" | Imagen pulida con estilo studio |
| (mensaje de voz) "Una historia para Instagram de las costillas BBQ" | Historia 1080×1920 con las costillas |
| "Otra con el logo más grande" | Mismo diseño, logo más grande |

---

## Paso 6 — Monitoreo y costos

### Ver los costos
```sql
-- En Supabase SQL Editor
select provider, sum(cost_usd) as total, count(*) as calls, sum(hits) as cache_hits
from public.generation_cache
group by provider;
```

### Costos esperados (uso normal, ~300 diseños/mes)

| Servicio | Uso | Costo/mes |
|---|---|---|
| Claude Sonnet 4.6 | ~300 convos × 15k tokens | $10 |
| Gemini 2.5 Flash Image | ~200 enhances × $0.039 | $8 |
| Replicate Flux Ultra | ~80 generaciones × $0.06 | $5 |
| Replicate Real-ESRGAN | ~100 upscales × $0.004 | $0.4 |
| OpenAI Whisper + embeddings | ~100 voz + embeds | $2 |
| htmlcsstoimage | 300 renders (plan Starter) | $14 |
| Supabase | tier gratis | $0 |
| Brave Search | < 2000 queries | $0 |
| **TOTAL estimado** | | **~$40/mes** |

Puedes bajar costos:
- Subiendo el `match_threshold` de search_dishes (usa más el catálogo, menos Flux)
- Cacheando más tiempo en `generation_cache`
- Usando Claude Haiku para el Intent Classifier en vez de Sonnet

---

## Troubleshooting

| Error | Causa | Fix |
|---|---|---|
| `pgvector not installed` | Extensión no habilitada | `create extension vector;` en SQL Editor |
| `Gemini did not return image` | Modelo incorrecto | Usar `gemini-2.5-flash-image` (no `gemini-2.5-flash`) |
| `htmlcsstoimage timeout` | HTML muy pesado | Bajar `device_scale` de 2 a 1 temporalmente |
| `Replicate 422 invalid model` | version hash cambió | Ver https://replicate.com/black-forest-labs/flux-1.1-pro-ultra/api |
| Bot responde pero no genera imagen | Agente no llamó a render_design | Revisar system prompt del Orchestrator |
| Imagen pixelada | `deviceScaleFactor` = 1 | Poner 2 en el llamado a render_design |
| Slogan usa categoría incorrecta | El Classifier no mapeó bien | Afinar `intent-classifier.md` con ejemplos |

---

## Siguientes pasos (no esenciales ahora)

- [ ] Agregar comando `/catalogo` que liste los platos en Supabase
- [ ] Botones inline para "Generar 3 variantes" / "Más oscuro" / "Otro template"
- [ ] Integración con una cuenta de Instagram para publicar directo
- [ ] Generar cartas A4 de menú completas (solo template, platos desde DB)
- [ ] Integrar ElevenLabs para responder mensajes de voz con voz
- [ ] Dashboard en Supabase (vista SQL) con métricas de uso

---

## Contacto y propiedad

- **Bot**: Montaña Dorada — lo mejor en asados & mariscos
- **Inspiración**: Sistema Legaliter (documentado en `/Users/Bryan/LEGALITER-BOT/LEGALITER_BOT_COMPLETE_DOCUMENTATION.md`)
- **Fecha plan aprobado**: 2026-04-16
