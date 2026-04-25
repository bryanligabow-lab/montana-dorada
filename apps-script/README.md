# Apps Script backend (Montaña Dorada)

Endpoint `POST` que recibe `{secret, action, data}` y escribe al Sheet. Lo usa el dashboard para CRUD de pagos y descansos.

## Deploy (una sola vez)

1. Abrí el Sheet de asistencias → **Extensiones → Apps Script**.
2. Borrá el `Code.gs` inicial vacío. Pegá el contenido de `apps-script/Code.gs` de este repo.
3. Generá un secret nuevo (en tu terminal local):
   ```bash
   openssl rand -hex 16
   ```
   Reemplazá `CAMBIAR_ESTE_VALOR` en la constante `SECRET` del script.
4. Guardá (Cmd/Ctrl + S).
5. **Deploy → New deployment**:
   - Tipo: **Web app**
   - Description: `montana-dorada-v1`
   - Execute as: **Me** (tu cuenta)
   - Who has access: **Anyone**
6. "Authorize access" → aceptar los scopes (`SpreadsheetApp`).
7. Copiá la **Web app URL** (termina en `/exec`) y pegala junto con el secret en `dashboard/src/lib/config.ts`:
   ```ts
   export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/XXXX/exec';
   export const API_SECRET = 'PEGAR_SECRET';
   ```

## Probar el deployment

Desde una terminal:
```bash
curl -L -X POST -H 'Content-Type: text/plain' \
  -d '{"secret":"TU_SECRET","action":"ping","data":{}}' \
  https://script.google.com/macros/s/XXXX/exec
```
Debe devolver `{"ok":true,"data":{"pong":true}}`.

## Actualizar el código

Cada cambio en `Code.gs` requiere **Deploy → Manage deployments → editar la activa → New version**. La URL no cambia.

## Rotar el secret

1. Cambiar `SECRET` en el script, guardar, New version.
2. Actualizar `API_SECRET` en `dashboard/src/lib/config.ts` y redesplegar el dashboard.

## Acciones soportadas

| action | data |
|---|---|
| `ping` | `{}` |
| `pago.create` | `{ id, nombre, fecha, hora, tipoPago, monto }` |
| `pago.update` | `{ rowId, id, nombre, fecha, hora, tipoPago, monto }` |
| `pago.delete` | `{ rowId }` |
| `descanso.create` | `{ id, nombre, fecha, tipo, motivo }` |
| `descanso.update` | `{ rowId, id, nombre, fecha, tipo, motivo }` |
| `descanso.delete` | `{ rowId }` |
| `falta.create` | `{ id, nombre, fecha, motivo, descuento }` |
| `falta.update` | `{ rowId, id, nombre, fecha, motivo, descuento }` |
| `falta.delete` | `{ rowId }` |
| `extra.create` | `{ id, nombre, fecha, concepto, monto }` |
| `extra.update` | `{ rowId, id, nombre, fecha, concepto, monto }` |
| `extra.delete` | `{ rowId }` |
| `notify.reminderDescansos` | `{ context?: object }` |
| `notify.informeFinal` | `{ period, summary, detail }` |

Todas devuelven `{ ok: true, data: ... }` o `{ ok: false, error: '...' }`.

## Integración con n8n (WhatsApp)

Las acciones `notify.*` reenvían la petición al webhook de n8n configurado en
`N8N_WEBHOOK_URL` (dentro de `Code.gs`). El workflow de n8n
(`n8n-workflow/montana-notifications.json`) arma el mensaje con un AI agent
y lo manda por Evolution API. Ver `n8n-workflow/README-notifications.md`.

## Trigger automático V/S/D 10:00 AM

Apps Script corre el recordatorio a Dani automáticamente. Para instalarlo:

1. Abrir el editor de Apps Script.
2. Seleccionar la función `installAutoReminders` en el dropdown superior.
3. Click en **Run** → aceptar permisos (primera vez).
4. Verificar en **Triggers** (ícono de reloj) que aparecen 3 triggers para
   `autoReminderHandler_` (viernes, sábado, domingo).

Para quitarlos: eliminar los 3 triggers desde la UI de Triggers.

## Tab CONTACTOS

El backend lee la tab `CONTACTOS` para saber a qué número mandar. Headers
esperados:
```
key | rol | nombre | numero | nota
```
Keys usadas: `jefe_principal`, `asistente_jefe`, `jefe_cocina`,
`asistente_de_jefe`.

## Preparar el Sheet (una sola vez)

### Tab `PAGOS`
Agregar header `ROW_ID` en col H (al final). Layout final:
```
ID | NOMBRE | FECHA | HORA | TIPO_PAGO | MONTO | TIMESTAMP | ROW_ID
```

### Tab `DESCANSOS` (crear)
```
ROW_ID | ID | NOMBRE | FECHA | TIPO | MOTIVO | CREADO_EN | ACTUALIZADO_EN
```

### Tab `FALTAS` (crear)
```
ROW_ID | ID | NOMBRE | FECHA | MOTIVO | DESCUENTO | CREADO_EN | ACTUALIZADO_EN
```
`DESCUENTO` en USD; si queda en 0, el sistema usa el SUELDO_DIARIO del empleado.

### Tab `EXTRAS` (crear)
```
ROW_ID | ID | NOMBRE | FECHA | CONCEPTO | MONTO | CREADO_EN | ACTUALIZADO_EN
```
Ejemplos de concepto: "bono por desempeño", "horas extra", "propina compartida".

### Tab `CONF` (extender)
Headers finales (las primeras 5 columnas ya existen):
```
key | rol | nombre | numero | nota | username | password | permisos
```

- `username` en minúsculas, sin espacios. Es lo que se escribe en el login.
- `password`: texto plano (más simple) o SHA-256 hex de 64 chars (más seguro, `node -e "console.log(require('crypto').createHash('sha256').update('TU_PASS').digest('hex'))"`).
- `permisos`: lista separada por comas con los permisos activos. Formatos:
  - `*` = admin total
  - `read` = ver secciones
  - `pago.*`, `descanso.*`, `falta.*`, `extra.*` = CRUD del recurso
  - `notify.reminder` = mandar WhatsApp de reminder a Dani
  - `notify.informe` = mandar informe final a Javier

Ejemplo de fila:
```
jefe_cocina | Jefe de cocina | Dani Macas | 593985808132 | ... | dani | dani2026 | read,descanso.*,falta.*,notify.reminder
```
