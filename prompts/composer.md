# COMPOSER — Sub-agente de generación/edición de imagen

> Es el especialista que habla con Gemini 2.5 Flash Image y con Flux 1.1 Pro Ultra. Se invoca desde el Orchestrator como tool.

---

## Responsabilidades

1. **Mejorar** fotos de platos subidas por el usuario (pipeline: Gemini edit + Real-ESRGAN)
2. **Generar** fotos de platos que no existen en el catálogo (Flux 1.1 Pro Ultra)
3. **Componer** elementos de marca dentro de una escena (Gemini edit con logo como referencia)

## Tool 1: `enhance_user_photo`

### Input
- `image_url`: URL de la foto subida por el usuario
- `edit_prompt`: string opcional con instrucciones extra del usuario

### Pipeline
1. Descargar imagen, convertir a base64
2. Llamar a **Gemini 2.5 Flash Image API** con:
   ```
   {
     "contents": [{
       "parts": [
         { "inline_data": { "mime_type": "image/jpeg", "data": "<base64>" } },
         { "text": "<ENHANCE_PROMPT>" }
       ]
     }]
   }
   ```
3. Recibir imagen editada, pasarla por **Real-ESRGAN** (Replicate `nightmareai/real-esrgan` con `scale: 4`) para subir a 4K
4. Guardar en Supabase Storage bucket `dishes-enhanced/` con nombre `user_{chat_id}_{timestamp}.jpg`
5. Registrar en tabla `dishes` con embedding
6. Devolver URL pública

### ENHANCE_PROMPT (base)

```
Transform this into a professional restaurant food photograph while keeping
the exact same dish, composition, and ingredients visible. Apply:
- Dramatic studio lighting with warm backlight on the right
- Moody dark restaurant ambiance, black ceramic plate or rustic wood board
- Enhanced color saturation for appetizing look (warmer tones)
- Crisp sharp focus on the food, clean background
- Visible texture of ingredients (crispiness, sauce drizzle, fresh herbs)
- Steam/vapor subtle effect if the dish is hot
- Bon Appetit magazine aesthetic, hyperrealistic food photography
- Maintain the original dish identity, DO NOT change the type of food

Then append: {edit_prompt}
```

## Tool 2: `generate_image`

### Input
- `prompt`: descripción del plato
- `aspect_ratio`: "1:1" | "4:5" | "9:16" | "16:9" | "3:4"

### Pipeline
1. Construir prompt gastronómico fotorealista a partir del input
2. Llamar a **Replicate black-forest-labs/flux-1.1-pro-ultra**:
   ```json
   {
     "input": {
       "prompt": "<built_prompt>",
       "aspect_ratio": "<aspect_ratio>",
       "output_format": "jpg",
       "safety_tolerance": 2,
       "raw": false
     }
   }
   ```
3. Polling hasta que esté listo (~5-20s)
4. Descargar imagen resultante
5. Guardar en Supabase Storage `generated/` + embedding + tabla `dishes`
6. Devolver URL pública

### PROMPT_TEMPLATE para generación

```
Professional overhead food photography of {DISH_NAME}, {DISH_DETAILS}.
Authentic {CUISINE} cuisine presentation, served on {PLATE_STYLE}.
Moody restaurant lighting with warm tungsten backlight,
dramatic side-light creating subtle shadows,
rustic dark wood table background with slight bokeh.
Visible details: {VISIBLE_INGREDIENTS},
garnish drizzle of sauce, fresh herbs, steam rising.
Shot on Hasselblad H6D, 85mm macro lens, f/2.8, ISO 400,
shallow depth of field, hyperrealistic, 8k resolution,
Bon Appetit magazine editorial style, award-winning food photography.
```

Variables:
- `DISH_NAME`: ej "ají de gallina peruano tradicional"
- `DISH_DETAILS`: ej "shredded chicken in creamy yellow ají amarillo sauce"
- `CUISINE`: peruvian criollo / Peruvian seafood / Latin American grill
- `PLATE_STYLE`: matte black ceramic plate / white porcelain / wooden cutting board / cast iron skillet
- `VISIBLE_INGREDIENTS`: "boiled potato slices, black olives, white rice, hard-boiled egg halves"

### Mapeo plato → prompt (mini-diccionario)

| Plato | DISH_DETAILS | PLATE_STYLE | VISIBLE_INGREDIENTS |
|---|---|---|---|
| ají de gallina | shredded chicken in creamy yellow ají amarillo pepper sauce | rustic white ceramic plate | boiled potato, black olives, white rice, boiled egg halves, chopped parsley |
| langostinos empanizados | golden crispy breaded prawns | matte black ceramic plate | lemon wedges, tartar sauce in small bowl, fresh lettuce leaves |
| parrillada mixta | assorted grilled meats, chorizo, beef, chicken | wooden cutting board with iron handles | chimichurri sauce, grilled corn, yuca fries |
| ceviche de mariscos | mixed seafood ceviche with shrimp, fish, octopus | deep black bowl | red onion, lime, cilantro, corn kernels, sweet potato, chulpi corn |
| costillas BBQ | slow-cooked pork ribs in dark BBQ glaze | slate stone or black ceramic | crispy french fries, coleslaw, sesame seeds |
| alitas BBQ | glazed crispy chicken wings in red BBQ sauce | rectangular black slate | shredded parmesan, chopped chives, french fries on the side |
| cordon bleu | sliced breaded chicken roll filled with ham and melting cheese | white ceramic plate | mushroom cream sauce, parsley, mashed potato |
| lomo saltado | stir-fried beef strips with onion and tomato | black skillet or plate | french fries, white rice, cilantro, soy glaze |

## Tool 3: `compose_brand_scene` (avanzado, opcional fase 2)

### Input
- `dish_image_url`
- `logo_url`
- `scene_prompt` (ej: "add a chef's black glove pouring sauce from the top")

### Pipeline
1. Gemini 2.5 Flash Image API con `dish_image_url` como referencia principal + prompt de composición
2. NO regenerar el logo, solo el entorno
3. El logo se superpondrá en el HTML final (no dentro de la imagen generada) — más seguro y controlable

## Cache

Antes de llamar a Gemini/Flux, hash SHA256 del `prompt + model + aspect_ratio` → lookup en tabla `generation_cache`. Si existe y tiene menos de 30 días → devolver URL cacheada.

## Costos estimados (para log)

- Gemini 2.5 Flash Image edit: $0.039 por imagen
- Flux 1.1 Pro Ultra: $0.06 por imagen
- Real-ESRGAN upscale 4x: $0.0037 por imagen

Loggear cada llamada en `generation_cache.cost_usd`.
