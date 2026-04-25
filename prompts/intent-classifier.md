# INTENT CLASSIFIER — Sub-agente

> Se invoca como tool HTTP desde el Orchestrator. Puede ser un mini-agente con Claude Haiku (más rápido y barato) o un Code node con regex + LLM fallback.

## Propósito

Analizar el mensaje del usuario y extraer una estructura determinista que el Orchestrator pueda consumir sin ambigüedad.

## Input
- `text`: string (puede venir de texto directo o de Whisper transcription)
- `has_image`: boolean (true si vino foto adjunta en el mensaje actual)
- `image_kind`: "plato_usuario" | "referencia_estilo" | "none" (ya clasificado arriba)

## Output (JSON estricto)

```json
{
  "intent": "saludo | pregunta | solicitud_diseno | ajuste_diseno | mejora_foto | carta_menu",
  "formato": "post_cuadrado | post_vertical | historia | banner_horizontal | carta_a4 | null",
  "template_sugerido": "A | B | C | null",
  "categoria_slogan": "ASADOS | MARISCOS | PARRILLADAS | CEVICHES | COSTILLAS | ALITAS | LANGOSTINOS | PLATOS CRIOLLOS | CORTES | ARROCES | null",
  "plato_mencionado": "string | null",
  "promo_texto": "string | null (ej: '2x1 jueves', '-20% domingo')",
  "edit_prompt": "string | null (instrucciones extra del usuario para la imagen)",
  "ajuste_solicitado": "string | null (si intent=ajuste_diseno, qué cambiar)",
  "razon": "breve explicación de por qué clasificaste así"
}
```

## Reglas de clasificación

### Intent

| Patrón | Intent |
|---|---|
| "hola", "buenas", "como estás" | `saludo` |
| "qué puedes hacer", "ayuda", "cómo funciona" | `pregunta` |
| "hazme / diseña / crea / arma / necesito un post/historia/banner" | `solicitud_diseno` |
| "hazlo más X", "cambia el Y", "mueve", "ponle" | `ajuste_diseno` |
| "mejora esta foto", "pulir", "dale calidad" + imagen | `mejora_foto` |
| "carta", "menú completo", "lista de platos" | `carta_menu` |

### Formato (si no se especifica → `post_vertical` por defecto)

| Keywords | Formato |
|---|---|
| "historia", "story", "estado de whatsapp" | `historia` |
| "cuadrado", "post feed clásico" | `post_cuadrado` |
| "post", "publicación", "feed" (sin más) | `post_vertical` |
| "banner", "portada", "facebook cover", "web" | `banner_horizontal` |
| "carta", "menú imprimible", "a4", "impresión" | `carta_a4` |

### Template sugerido

| Contexto | Template |
|---|---|
| "foto limpia", "estudio", "plato aislado", "carta" | `A` |
| "ambiente", "mesa", "experiencia", "local" | `B` |
| "promoción", "campaña", "2x1", "descuento", "lo mejor en X", default | `C` |

### Categoría del slogan

Mapea el plato mencionado a una categoría válida:
- alitas → `ALITAS`
- ceviche, cebiche → `CEVICHES`
- parrilla, parrillada, mixta → `PARRILLADAS`
- costillas, ribs → `COSTILLAS`
- langostinos, camarones, gamba → `LANGOSTINOS` o `MARISCOS`
- ají de gallina, cordon bleu, lomo saltado, aji, tallarin verde → `PLATOS CRIOLLOS`
- churrasco, bife, t-bone, rib eye → `CORTES`
- arroz con mariscos, arroz chaufa, arroz verde → `ARROCES`
- asado, anticuchos, asado a la parrilla → `ASADOS`
- pescado, conchas, marisco general → `MARISCOS`

### Extracción de promo_texto

Busca patrones como: `(\d+x\d+|[-+]?\d+%|\$?\d+(\.\d+)?) (.{0,30})` → normaliza a mayúsculas cortas (máx 20 caracteres).

Ejemplos:
- "2x1 los jueves" → "2×1 JUEVES"
- "20% de descuento" → "-20%"
- "con solo $15" → "$15"

### edit_prompt

Si el usuario pide efectos visuales específicos ("más oscuro", "con humo", "fondo negro", "que se vea más premium"), captúralo literal en inglés para pasarlo a Gemini/Flux:
- "más oscuro" → "darker moody background, lower key lighting"
- "con humo" → "steam rising from the dish, subtle smoke"
- "fondo negro" → "pure black seamless background, studio cyclorama"
- "más premium" → "hyperrealistic food photography, editorial magazine style, Bon Appetit aesthetic"

## Prompt del sub-agente (si se usa LLM)

```
Eres un clasificador de intenciones para un bot de marketing gastronómico.
Recibes un mensaje del usuario (posiblemente transcripción de voz).
Devuelves EXCLUSIVAMENTE el JSON con la estructura definida. Nada más.
No agregues explicaciones fuera del campo "razon".
Si falta información, usa null en el campo correspondiente (no inventes).
```

## Fallback determinista (sin LLM)

Si el texto es muy corto (< 3 palabras) o coincide con regex de saludo → responde directo sin LLM para ahorrar costo:

```js
if (/^(hola|buenas|hey|hi|hello|ola)\W*$/i.test(text.trim())) {
  return { intent: "saludo", formato: null, ... };
}
```
