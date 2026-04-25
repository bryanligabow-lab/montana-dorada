# Guía de marca — Montaña Dorada

## Principio rector

**Fotografía profesional de gastronomía con tipografía mínima.** La comida es siempre la protagonista (90-95% del impacto visual). Nunca diseño gráfico plano tipo flyer.

Referencias estéticas aprobadas:
- Paranoía Restobar (studio shot limpio)
- Restful Restobar (ambient cinematic, bokeh)
- Estilo de la propia marca con slogan rotativo "Lo mejor, EN ___."

## Paleta oficial

Extraída del logo real:

| Nombre | HEX | Uso |
|---|---|---|
| Negro fondo | `#0A0A0A` | Fondo principal en scenes oscuras |
| Negro profundo | `#1A0F0A` | Degradados, sombras |
| Marrón tostado | `#3A2416` | Acento cálido en fondos |
| Naranja llama | `#F57C00` | Acento principal (backlight, badges) |
| Naranja brasa | `#E65100` | Acento secundario |
| Rojo fuego | `#D32F2F` | Acento fuerte (promociones, CTAs urgentes) |
| Dorado cálido | `#FFB347` | Dorado principal (tipografía destacada) |
| Dorado brillo | `#FFD27F` | Dorado claro (highlights) |
| Blanco hueso | `#F5F1EA` | Texto en fondos oscuros |
| Blanco puro | `#FFFFFF` | Texto sobre imagen con sombra |
| Gris humo | `#6B6258` | Texto secundario, líneas sutiles |

**Regla**: la paleta se expresa sobre todo en la **iluminación** de las fotos (backlight cálido, acentos), no como bloques planos. Los bloques de color plano son enemigos del estilo.

## Tres familias de look

### A — Studio shot limpio (estilo Paranoía)
- Fondo degradado oscuro → claro, tipo cyclorama de fotografía profesional
- Plato centrado o ligeramente offset
- Iluminación controlada, sombras suaves
- Todo nítido, sin bokeh
- Tipografía mínima: solo logo arriba y micro-copy abajo si hace falta
- Ideal para: lanzamiento de plato nuevo, foto para carta, promociones sobrias

### B — Ambient cinematic (estilo Restful)
- Low-angle o plano oblicuo
- Shallow depth of field (bokeh en fondo)
- Elementos secundarios desenfocados: tomates cherry, hierbas, otros platos, copas
- Ambiente cálido de restaurante real
- Iluminación warm tungsten
- Tipografía: solo logo + teléfono/reservas
- Ideal para: comunicar "experiencia del local", contenido orgánico de feed

### C — Action branded (estilo Montaña Dorada)
- Escena con **acción real**: guante negro de chef vertiendo salsa, humo del asado, mano emplatando, drizzle en movimiento
- Bebidas al fondo
- **Tipografía protagonista**: slogan de marca "Lo mejor, EN {CATEGORIA}."
  - `Lo mejor,` en script cursiva (Allura / Great Vibes / Dancing Script)
  - `EN MARISCOS.` en sans condensed bold uppercase (Bebas Neue / Oswald 700 / Anton)
  - Color blanco puro con drop-shadow sutil
- Ideal para: contenido de campaña, feed con fuerza de marca, promociones con fuerza

## Categorías válidas para el slogan rotativo

`ASADOS` · `MARISCOS` · `PARRILLADAS` · `CEVICHES` · `COSTILLAS` · `ALITAS` · `LANGOSTINOS` · `PLATOS CRIOLLOS` · `CORTES` · `ARROCES`

El Brand Guardian valida que la categoría usada corresponda al plato protagonista de la pieza.

## Tipografías

| Rol | Fuentes permitidas | Cuándo |
|---|---|---|
| Display condensed (bold uppercase) | Bebas Neue, Oswald 700, Anton | Slogan, títulos fuertes |
| Script cursiva | Allura, Great Vibes, Dancing Script | `Lo mejor,` del slogan |
| Body sans | Inter, Montserrat | Teléfono, reservas, direcciones |

**Prohibidas**: Playfair Display, Bodoni Moda, Cormorant Garamond (eso es Legaliter, no aplica), Comic Sans, cualquier serif editorial tipo revista.

## Uso del logo

- Ubicación por defecto: **top-center** de la pieza
- Tamaño: **130-170px de ancho** en piezas de 1080px, escala proporcional para otros formatos
- Siempre con `drop-shadow(0 4px 12px rgba(0,0,0,0.5))` para integrarlo con la luz
- Versión a usar: `logo-cutout.png` (PNG transparente) sobre fondos oscuros; `logo-white.png` si el fondo tiene mucho contraste
- **NUNCA** usar el logo tan grande que compita con la comida

## Formatos estándar soportados

| Nombre | Dimensiones | Uso |
|---|---|---|
| Post cuadrado | 1080×1080 @2x | Instagram feed clásico |
| Post vertical 4:5 | 1080×1350 @2x | Instagram feed óptimo |
| Historia | 1080×1920 @2x | Stories WhatsApp/Instagram |
| Banner horizontal | 1920×1080 @2x | Facebook cover, web |
| Carta A4 | 2480×3508 @300dpi | Impresión carta menú |

`@2x` = se renderiza al doble de resolución con `deviceScaleFactor: 2` para calidad 4K.

## Prohibido

- ❌ Tipografía editorial gigante 150-200px tipo Vogue/Bodoni
- ❌ Bloques de color plano con banderitas de precio
- ❌ Emojis, rayos, estrellas, elementos decorativos infantiles
- ❌ Fondos de colores saturados fuera de paleta
- ❌ Logo pegado sin integrar con la luz
- ❌ Composición simétrica rígida "template Canva"
- ❌ Platos con aspecto ilustrado, cartoon o "IA obvia" (formas derretidas, detalles blurrosos)
- ❌ Tipografías no aprobadas
- ❌ Más de 15 palabras de texto total en piezas de feed

## Checklist del QA Reviewer

Para cada diseño antes de enviar:

- [ ] ¿El plato ocupa ≥ 60% del área visual?
- [ ] ¿Logo presente, en top-center, tamaño correcto?
- [ ] ¿Paleta respetada? (sin colores fuera de la lista)
- [ ] ¿Tipografía permitida?
- [ ] ¿Texto total ≤ 15 palabras en feed, ≤ 25 en story/banner?
- [ ] ¿Iluminación realista (no plana, no "flash")?
- [ ] ¿Foto de plato en alta resolución sin pixelación?
- [ ] ¿Formato y dimensiones correctos?
- [ ] ¿Slogan rotado con categoría coherente al plato (solo en estilo C)?

Si falla cualquiera → el Orchestrator itera el diseño.
