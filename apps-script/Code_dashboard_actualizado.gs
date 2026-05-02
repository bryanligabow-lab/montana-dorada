/**
 * Montaña Dorada — backend de escritura al Google Sheet + puente a n8n.
 */

var SHEET_ID = '1iRQzgUAWe7eaVr6hr_BiixMTGTRE4lRMxzET6LZVoiQ';
var SECRET = 'e21bb278877ea9a7888ec61f29e7d901';

var N8N_WEBHOOK_URL = 'https://n8n.tu-dominio.com/webhook/montana-notify';
var N8N_WEBHOOK_SECRET = 'CAMBIAR_ESTE_VALOR_TAMBIEN';

// ─── Evolution API (WhatsApp al jefe) ───────────────────────────────────────
// La API key NO se hardcodea. Correr UNA SOLA VEZ la función `setEvoApiKey()`
// (al final del archivo) desde el editor de Apps Script para guardarla en
// Script Properties. Después se puede borrar el valor del código.
var EVO_BASE_URL = 'https://contabilidad-mateai-evolution-api.dtuoap.easypanel.host';
var EVO_INSTANCE = 'mate-ai';

var TAB_PAGOS = 'PAGOS';
var TAB_DESCANSOS = 'DESCANSOS';
var TAB_FALTAS = 'FALTAS';
var TAB_EXTRAS = 'EXTRAS';
var TAB_CONF = 'CONF';

var PAGOS_ROWID_COL = 8;
var DESCANSOS_ROWID_COL = 1;
var FALTAS_ROWID_COL = 1;
var EXTRAS_ROWID_COL = 1;

// ↓↓↓ ÚNICA LÍNEA MODIFICADA: agregado 'ASISTIO_SIN_REGISTRO'
var ALLOWED_TIPOS_DESCANSO = ['PLANIFICADO', 'VACACIONES', 'PERMISO', 'ENFERMEDAD', 'ASISTIO_SIN_REGISTRO'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (err) { return respond_({ ok: false, error: 'lock_timeout' }); }
  try {
    if (!e || !e.postData || !e.postData.contents) return respond_({ ok: false, error: 'empty_body' });
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return respond_({ ok: false, error: 'unauthorized' });
    var handlers = {
      'pago.create': createPago_, 'pago.update': updatePago_, 'pago.delete': deletePago_,
      'descanso.create': createDescanso_, 'descanso.update': updateDescanso_, 'descanso.delete': deleteDescanso_,
      'falta.create': createFalta_, 'falta.update': updateFalta_, 'falta.delete': deleteFalta_,
      'extra.create': createExtra_, 'extra.update': updateExtra_, 'extra.delete': deleteExtra_,
      'notify.reminderDescansos': notifyReminderDescansos_,
      'notify.informeFinal': notifyInformeFinal_,
      'notify.informeJefe': notifyInformeJefe_,
      'ping': function () { return { pong: true }; }
    };
    var fn = handlers[body.action];
    if (!fn) return respond_({ ok: false, error: 'unknown_action:' + body.action });
    return respond_({ ok: true, data: fn(body.data || {}) });
  } catch (err) {
    return respond_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function doGet() {
  return respond_({ ok: true, data: { service: 'montana-dorada-backend' } });
}

function installAutoReminders() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'autoReminderHandler_') ScriptApp.deleteTrigger(triggers[i]);
  }
  var days = [ScriptApp.WeekDay.FRIDAY, ScriptApp.WeekDay.SATURDAY, ScriptApp.WeekDay.SUNDAY];
  for (var j = 0; j < days.length; j++) {
    ScriptApp.newTrigger('autoReminderHandler_').timeBased().onWeekDay(days[j]).atHour(10).create();
  }
  return 'triggers instalados para V/S/D 10:00';
}
function autoReminderHandler_() {
  try { notifyReminderDescansos_({ automatic: true }); }
  catch (err) { console.error('autoReminderHandler_ error:', err); }
}

function respond_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function getSheet_(name) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('tab_no_existe:' + name);
  return sh;
}
function findRowByRowId_(sheet, rowIdCol, rowId) {
  if (!rowId) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var values = sheet.getRange(2, rowIdCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(rowId)) return i + 2;
  }
  return -1;
}
function uuid_() { return Utilities.getUuid(); }
function num_(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function str_(v) { if (v == null) return ''; return String(v); }

function getContactos_() {
  var sh = getSheet_(TAB_CONF);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return {};
  var headers = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var idx = { key: headers.indexOf('key'), rol: headers.indexOf('rol'), nombre: headers.indexOf('nombre'), numero: headers.indexOf('numero'), nota: headers.indexOf('nota') };
  var out = {};
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var key = str_(row[idx.key]).trim();
    if (!key) continue;
    out[key] = { rol: str_(row[idx.rol]).trim(), nombre: str_(row[idx.nombre]).trim(), numero: str_(row[idx.numero]).replace(/\s+/g, ''), nota: str_(row[idx.nota]).trim() };
  }
  return out;
}

// PAGOS: columnas A..I = ID | NOMBRE | FECHA | HORA | TIPO_PAGO | MONTO | TIMESTAMP | ROW_ID | PERIODO_NOMINA
function createPago_(d) {
  var sh = getSheet_(TAB_PAGOS); var rowId = uuid_(); var ts = new Date().toISOString();
  sh.appendRow([
    str_(d.id), str_(d.nombre), str_(d.fecha), str_(d.hora),
    str_(d.tipoPago), num_(d.monto), ts, rowId,
    str_(d.periodoNomina || ''),
  ]);
  return { rowId: rowId, timestamp: ts };
}
function updatePago_(d) {
  var sh = getSheet_(TAB_PAGOS);
  var row = findRowByRowId_(sh, PAGOS_ROWID_COL, d.rowId);
  if (row < 0) throw new Error('pago_no_encontrado');
  sh.getRange(row, 1, 1, 6).setValues([[str_(d.id), str_(d.nombre), str_(d.fecha), str_(d.hora), str_(d.tipoPago), num_(d.monto)]]);
  sh.getRange(row, 7).setValue(new Date().toISOString());
  // Columna 9: PERIODO_NOMINA (se crea si no existe)
  sh.getRange(row, 9).setValue(str_(d.periodoNomina || ''));
  return { rowId: d.rowId };
}
function deletePago_(d) {
  var sh = getSheet_(TAB_PAGOS);
  var row = findRowByRowId_(sh, PAGOS_ROWID_COL, d.rowId);
  if (row < 0) throw new Error('pago_no_encontrado');
  sh.deleteRow(row); return { rowId: d.rowId };
}

function validarTipoDescanso_(t) { if (ALLOWED_TIPOS_DESCANSO.indexOf(t) < 0) throw new Error('tipo_invalido:' + t); }
function createDescanso_(d) {
  validarTipoDescanso_(d.tipo);
  var sh = getSheet_(TAB_DESCANSOS); var rowId = uuid_(); var now = new Date().toISOString();
  sh.appendRow([rowId, str_(d.id), str_(d.nombre), str_(d.fecha), str_(d.tipo), str_(d.motivo || ''), now, now]);
  return { rowId: rowId };
}
function updateDescanso_(d) {
  validarTipoDescanso_(d.tipo);
  var sh = getSheet_(TAB_DESCANSOS);
  var row = findRowByRowId_(sh, DESCANSOS_ROWID_COL, d.rowId);
  if (row < 0) throw new Error('descanso_no_encontrado');
  var now = new Date().toISOString();
  sh.getRange(row, 2, 1, 5).setValues([[str_(d.id), str_(d.nombre), str_(d.fecha), str_(d.tipo), str_(d.motivo || '')]]);
  sh.getRange(row, 8).setValue(now);
  return { rowId: d.rowId };
}
function deleteDescanso_(d) {
  var sh = getSheet_(TAB_DESCANSOS);
  var row = findRowByRowId_(sh, DESCANSOS_ROWID_COL, d.rowId);
  if (row < 0) throw new Error('descanso_no_encontrado');
  sh.deleteRow(row); return { rowId: d.rowId };
}

function createFalta_(d) {
  var sh = getSheet_(TAB_FALTAS); var rowId = uuid_(); var now = new Date().toISOString();
  sh.appendRow([rowId, str_(d.id), str_(d.nombre), str_(d.fecha), str_(d.motivo || ''), num_(d.descuento), now, now]);
  return { rowId: rowId };
}
function updateFalta_(d) {
  var sh = getSheet_(TAB_FALTAS);
  var row = findRowByRowId_(sh, FALTAS_ROWID_COL, d.rowId);
  if (row < 0) throw new Error('falta_no_encontrada');
  var now = new Date().toISOString();
  sh.getRange(row, 2, 1, 5).setValues([[str_(d.id), str_(d.nombre), str_(d.fecha), str_(d.motivo || ''), num_(d.descuento)]]);
  sh.getRange(row, 8).setValue(now);
  return { rowId: d.rowId };
}
function deleteFalta_(d) {
  var sh = getSheet_(TAB_FALTAS);
  var row = findRowByRowId_(sh, FALTAS_ROWID_COL, d.rowId);
  if (row < 0) throw new Error('falta_no_encontrada');
  sh.deleteRow(row); return { rowId: d.rowId };
}

function createExtra_(d) {
  var sh = getSheet_(TAB_EXTRAS); var rowId = uuid_(); var now = new Date().toISOString();
  sh.appendRow([rowId, str_(d.id), str_(d.nombre), str_(d.fecha), str_(d.concepto || ''), num_(d.monto), now, now]);
  return { rowId: rowId };
}
function updateExtra_(d) {
  var sh = getSheet_(TAB_EXTRAS);
  var row = findRowByRowId_(sh, EXTRAS_ROWID_COL, d.rowId);
  if (row < 0) throw new Error('extra_no_encontrado');
  var now = new Date().toISOString();
  sh.getRange(row, 2, 1, 5).setValues([[str_(d.id), str_(d.nombre), str_(d.fecha), str_(d.concepto || ''), num_(d.monto)]]);
  sh.getRange(row, 8).setValue(now);
  return { rowId: d.rowId };
}
function deleteExtra_(d) {
  var sh = getSheet_(TAB_EXTRAS);
  var row = findRowByRowId_(sh, EXTRAS_ROWID_COL, d.rowId);
  if (row < 0) throw new Error('extra_no_encontrado');
  sh.deleteRow(row); return { rowId: d.rowId };
}

function postToN8n_(payload) {
  if (!N8N_WEBHOOK_URL || N8N_WEBHOOK_URL.indexOf('tu-dominio') >= 0) throw new Error('N8N_WEBHOOK_URL_no_configurada');
  var res = UrlFetchApp.fetch(N8N_WEBHOOK_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'X-Webhook-Secret': N8N_WEBHOOK_SECRET },
    payload: JSON.stringify(payload),
  });
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('n8n_http_' + code + ': ' + res.getContentText().slice(0, 200));
  try { return JSON.parse(res.getContentText()); } catch (_) { return { raw: res.getContentText() }; }
}

function notifyReminderDescansos_(data) {
  var contactos = getContactos_();
  var jefe = contactos.jefe_cocina;
  if (!jefe || !jefe.numero) throw new Error('jefe_cocina_no_configurado');
  return postToN8n_({
    type: 'reminder_descansos', automatic: !!(data && data.automatic),
    recipient: { nombre: jefe.nombre, numero: jefe.numero, rol: jefe.rol },
    timestamp: new Date().toISOString(),
    context: (data && data.context) || {},
  });
}
function notifyInformeFinal_(data) {
  var contactos = getContactos_();
  var jefe = contactos.jefe_principal;
  if (!jefe || !jefe.numero) throw new Error('jefe_principal_no_configurado');
  return postToN8n_({
    type: 'informe_final',
    recipient: { nombre: jefe.nombre, numero: jefe.numero, rol: jefe.rol },
    period: (data && data.period) || '',
    summary: (data && data.summary) || '',
    detail: (data && data.detail) || {},
    timestamp: new Date().toISOString(),
  });
}

// ─── Evolution API — Informe semanal al jefe por WhatsApp ──────────────────

/**
 * Envía un texto al WhatsApp del jefe vía Evolution API.
 * Espera: { message: string, phone: string }  (phone con código país, sin '+')
 */
function notifyInformeJefe_(data) {
  var msg = String((data && data.message) || '').trim();
  var phone = String((data && data.phone) || '').replace(/\D/g, '');
  if (!msg) throw new Error('message_vacio');
  if (!phone) throw new Error('phone_vacio');

  var apiKey = PropertiesService.getScriptProperties().getProperty('EVO_API_KEY');
  if (!apiKey) {
    throw new Error('EVO_API_KEY_no_configurada — corré setEvoApiKey() una vez');
  }

  var url = EVO_BASE_URL + '/message/sendText/' + encodeURIComponent(EVO_INSTANCE);
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { apikey: apiKey },
    payload: JSON.stringify({
      number: phone,
      text: msg,
    }),
  });
  var code = res.getResponseCode();
  var body = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('evolution_http_' + code + ': ' + body.slice(0, 300));
  }
  try {
    return { sentTo: phone, response: JSON.parse(body) };
  } catch (_) {
    return { sentTo: phone, response: body };
  }
}

/**
 * UTILIDAD: ejecutá esta función UNA SOLA VEZ desde el editor de Apps Script
 * para guardar la API key de Evolution en Script Properties. Después borrá
 * el valor inline si querés (pero el editor de Apps Script no es público).
 */
function setEvoApiKey() {
  PropertiesService.getScriptProperties().setProperty(
    'EVO_API_KEY',
    '429683C4C977415CAAFCCE10F7D57E11',
  );
  Logger.log('EVO_API_KEY guardada en Script Properties.');
}
