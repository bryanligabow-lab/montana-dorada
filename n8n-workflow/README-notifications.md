# Workflow n8n: Notificaciones WhatsApp

Recibe POST desde el Apps Script (backend del dashboard), un AI agent redacta el mensaje y Evolution API lo envía por WhatsApp.

## Flujo

```
[Apps Script] ──POST──▶ [Webhook n8n] ──▶ [Switch type]
                                              │
                              ┌───────────────┴───────────────┐
                              ▼                               ▼
                    [AI redacta reminder]         [AI redacta informe]
                              │                               │
                              └───────────────┬───────────────┘
                                              ▼
                                   [Evolution API · sendText]
                                              │
                                              ▼
                                     [Responde OK al webhook]
```

## Setup

### 1. Importar el workflow

En n8n → **Workflows → Import from File** → elegí `montana-notifications.json`.

### 2. Variables de entorno (n8n)

Agregá en la configuración de n8n (EasyPanel → tu instancia → Environment):

```
N8N_WEBHOOK_SECRET=pegar-el-mismo-que-esta-en-Code.gs  # N8N_WEBHOOK_SECRET
EVOLUTION_API_URL=https://evolution.tu-dominio.com
EVOLUTION_API_KEY=tu-api-key-evolution
EVOLUTION_INSTANCE=montana-dorada                       # nombre de tu instance en Evolution
```

### 3. Configurar el AI agent

Los dos nodos "AI: redactar ..." usan `@n8n/n8n-nodes-langchain.agent`. Después de importar:

1. Abrí cada nodo → conectale un modelo (OpenAI GPT-4o mini o Anthropic Claude Haiku funcionan bien).
2. Usá tu credencial existente de Anthropic / OpenAI.

### 4. Activar el workflow

Botón **Active** arriba a la derecha.

### 5. Copiar la URL del webhook al Apps Script

- En el nodo **Webhook**, copiá el **Production URL**.
- En `apps-script/Code.gs` reemplazá:
  ```javascript
  var N8N_WEBHOOK_URL = 'PEGAR_URL_WEBHOOK_AQUI';
  var N8N_WEBHOOK_SECRET = 'EL_MISMO_N8N_WEBHOOK_SECRET';
  ```
- Re-deploy del Apps Script (Deploy → Manage deployments → edit → New version).

## Payloads que procesa

### `type: "reminder_descansos"`
```json
{
  "type": "reminder_descansos",
  "automatic": true,
  "recipient": { "nombre": "Dani Macas", "numero": "593985808132", "rol": "Jefe de cocina" },
  "timestamp": "2026-04-24T10:00:00.000Z",
  "context": {}
}
```
Resultado: mensaje corto tipo "Dani, hoy viernes acordate de registrar los descansos..."

### `type: "informe_final"`
```json
{
  "type": "informe_final",
  "recipient": { "nombre": "Javier Carrión", "numero": "593968429494", "rol": "Jefe" },
  "period": "abril 2026",
  "summary": "📊 *Informe...*\n• Pagado: $...",
  "detail": { "empleados": [...], "totales": {...}, ... }
}
```
Resultado: informe ejecutivo formateado para WhatsApp.

## Verificar que funciona

Probar el endpoint completo con curl:

```bash
curl -X POST https://n8n.tu-dominio.com/webhook/montana-notify \
  -H 'Content-Type: application/json' \
  -H 'X-Webhook-Secret: TU_SECRET' \
  -d '{"type":"reminder_descansos","automatic":false,"recipient":{"nombre":"Dani","numero":"TU_NUMERO"}}'
```

Debe llegar un WhatsApp al número indicado.

## Triggers automáticos

El reminder V/S/D 10:00 AM NO lo dispara n8n — lo dispara un **trigger time-driven del Apps Script** (ver `apps-script/Code.gs` → `installAutoReminders()`). Apps Script llama al webhook de n8n como si fuera cualquier otra notificación.

Razón: el Apps Script tiene acceso directo al Sheet y a la tab CONTACTOS, y no depende de que n8n esté activo al momento del trigger.

Si preferís moverlo a n8n (más visibilidad), podés crear un workflow separado con un **Schedule Trigger** (cron `0 10 * * 5,6,0`) que hace POST al mismo webhook con `{type:"reminder_descansos",automatic:true}`.
