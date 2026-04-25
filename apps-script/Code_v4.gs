/******************************************************************************
 *  SISTEMA DE ASISTENCIA + PUNTUALIDAD
 *  Versión: 4.0 — Apps Script puro
 *  Cambios v4.0:
 *    ❌ Eliminado: Portal del empleado
 *    ❌ Eliminado: Hoja NOMINA y cálculo de nómina
 *    ❌ Eliminado: Hoja PAGOS y selección de pago en salida
 *    ✅ Nuevo: Multa de $0.10/min por tardanza (registrada en PUNTUALIDAD)
 *    ✅ Nuevo: Sistema de puntos por llegar temprano (4 medallas)
 *    ✅ Nuevo: Las multas del día van al empleado que llegó más temprano
 ******************************************************************************/

/************** CONFIG GENERAL **************/
const ZONA              = 'America/Guayaquil';
const SHEET_NAME        = 'Hoja 1';
const SHEET_EMPLEADOS   = 'EMPLEADOS';
const SHEET_PUNTUALIDAD = 'PUNTUALIDAD';

// ── Horarios de entrada (según día de semana) ──
const HORA_ENTRADA_LV = '11:05:00';
const HORA_ENTRADA_SD = '10:35:00';

// Corte de día operativo (02:00 AM)
const DAY_CUTOFF_HOUR = 2;

// Seguridad
const DUPLICATE_WINDOW_SECONDS       = 60;
const MIN_MINUTES_BETWEEN_ENTRY_EXIT = 5;

// Correos
const EMAIL_DESTINO = ['bryanligabow@gmail.com', 'javiercarrion591@gmail.com'];
const EMAIL_CC      = [];
const FIRMA         = 'Bryan Carrion';

// Logo
const LOGO_FILE_ID     = '1s-9asoNRB-BMY8FqN3MUA8SoPIjL5k4k';
const LOGO_URL_PUBLICO = '';

// GPS
const NEGOCIO_LAT      = -3.6776583;
const NEGOCIO_LNG      = -79.6870264;
const GPS_RADIO_METROS = 10;

// ── Sistema de Puntualidad ──
const MULTA_POR_MIN_TARDE = 0.10;

// Niveles por minutos de adelanto (orden descendente: se evalúa de mayor a menor)
const NIVELES_PUNTUALIDAD = [
  { minDesde: 30, nombre: 'Diamante', emoji: '💎', puntos: 10, color: '#06B6D4', bg: 'rgba(6,182,212,.15)'  },
  { minDesde: 15, nombre: 'Oro',      emoji: '🥇', puntos: 5,  color: '#F59E0B', bg: 'rgba(245,158,11,.15)' },
  { minDesde:  5, nombre: 'Plata',    emoji: '🥈', puntos: 3,  color: '#CBD5E1', bg: 'rgba(203,213,225,.15)'},
  { minDesde:  1, nombre: 'Bronce',   emoji: '🥉', puntos: 1,  color: '#D97706', bg: 'rgba(217,119,6,.15)'  }
];

// Pendiente de motivo (cache)
const PENDING_LATE_TTL_SECONDS = 8 * 60 * 60;
const MOTIVO_PENDIENTE         = 'PENDIENTE (sin seleccionar)';


/******************************************************************************
 *  WEB APP — doGet
 ******************************************************************************/
function doGet(e) {
  try {
    const p = (e && e.parameter) ? e.parameter : {};

    if (p.ping === '1') {
      return HtmlService.createHtmlOutput('✅ PING OK — Sistema v4.0');
    }

    if (p.admin === '1') {
      return renderPanelAdmin_();
    }

    const idEmpleado = (p.id ? String(p.id) : '').trim();
    if (!idEmpleado) {
      return HtmlService.createHtmlOutput('<h2>❌ Falta parámetro</h2><p>No se recibió ID.</p>');
    }

    const emp = getEmpleadoById_(idEmpleado);
    if (!emp) {
      return HtmlService.createHtmlOutput(`<h2>❌ Código no válido</h2><p>No existe: <b>${escapeHtml_(idEmpleado)}</b></p>`);
    }

    const nombre    = emp.nombre;
    const accion    = (p.action ? String(p.action) : '').trim();
    const confirmar = String(p.confirm || '') === '1';

    if (accion === 'motivo') {
      try {
        if (!confirmar) {
          return renderPage_({ tipo:'info', titulo:'Confirmación requerida',
            detalle:'Vuelve a escanear el QR y selecciona el motivo desde la pantalla oficial.', nombre });
        }
        const motivo = (p.value ? String(p.value) : '').trim();
        if (!motivo) {
          return renderPage_({ tipo:'error', titulo:'Motivo requerido',
            detalle:'Debes seleccionar un motivo para completar la tardanza.', nombre });
        }
        const res = finalizarTardanzaConMotivo_(idEmpleado, nombre, motivo);
        if (res && res.ok) {
          return renderMotivoGuardadoPage_({
            nombre, motivo,
            fechaTxt: res.fechaTxt || '',
            horaEntrada: res.horaEntrada || '',
            minTarde: res.minTarde || 0,
            multa: res.multa || 0,
            enviado: !!res.enviado,
            errorMail: res.errorMail || ''
          });
        }
        return renderPage_({ tipo:'error', titulo:'Sesión expirada',
          detalle:'La sesión expiró. Escanea de nuevo el QR de ENTRADA.', nombre });
      } catch (errMotivo) {
        return HtmlService.createHtmlOutput(`<pre style="color:red">${escapeHtml_(String(errMotivo.stack||errMotivo.message||errMotivo))}</pre>`);
      }
    }

    if (!confirmar && !accion) {
      return renderConfirmPage_(idEmpleado, nombre);
    }

    const cache = CacheService.getScriptCache();
    const key   = `scan_${idEmpleado}`;
    if (cache.get(key)) {
      return renderPage_({ tipo:'info', titulo:'Espera un momento',
        detalle:'Escaneo reciente detectado. Intenta de nuevo en unos segundos.', nombre });
    }
    cache.put(key, '1', DUPLICATE_WINDOW_SECONDS);

    return registrarAsistencia_(idEmpleado, nombre);

  } catch (err) {
    return HtmlService.createHtmlOutput(`
      <h2 style="color:#EF4444">❌ ERROR DEL SISTEMA</h2>
      <pre style="font-size:10px;color:#9CA3AF;">${escapeHtml_(String(err.stack||err.message||err))}</pre>
    `);
  }
}


/******************************************************************************
 *  REGISTRO PRINCIPAL
 ******************************************************************************/
function registrarAsistencia_(idEmpleado, nombre) {
  const hoja = getSheet_();
  asegurarColumnas_(hoja);
  asegurarHojasExtra_();

  let ahora        = new Date();
  const fechaNegocio = getBusinessDate_(ahora);
  const hoyTxt     = formatBusinessDateTxt_(fechaNegocio);
  let horaActual   = Utilities.formatDate(ahora, ZONA, 'HH:mm:ss');

  const datos    = hoja.getDataRange().getValues();
  let rowIndex   = -1;
  for (let i = 1; i < datos.length; i++) {
    const [id, , fecha] = datos[i];
    if (String(id || '').trim() !== idEmpleado) continue;
    if (normalizarFecha_(fecha) === hoyTxt) { rowIndex = i; break; }
  }

  // ══════════════ ENTRADA ══════════════
  if (rowIndex === -1) {
    const horaLimite = getHoraEntradaHoy_(ahora);
    const limiteMs   = convertirHoraMs_(horaLimite);
    const entradaMs  = convertirHoraMs_(horaActual);

    const tarde    = (entradaMs !== null && limiteMs !== null && entradaMs > limiteMs);
    const temprano = (entradaMs !== null && limiteMs !== null && entradaMs < limiteMs);
    const minTarde    = tarde    ? Math.max(0, Math.round((entradaMs - limiteMs) / 60000)) : 0;
    const minTemprano = temprano ? Math.max(0, Math.round((limiteMs - entradaMs) / 60000)) : 0;
    const estado   = tarde ? 'TARDE' : (temprano ? 'TEMPRANO' : 'A TIEMPO');

    if (tarde) {
      guardarPendienteTarde_(idEmpleado, nombre, hoyTxt, horaActual, minTarde);
      return renderMotivoPage_(idEmpleado, nombre, hoyTxt, horaActual, minTarde);
    }

    hoja.appendRow([
      idEmpleado, nombre, fechaNegocio,
      horaActual, '', estado, 0, '', '', ahora, '',
      '', '', '', ''
    ]);

    // Registrar puntualidad (temprano o a tiempo)
    const nivel = obtenerNivel_(minTemprano);
    registrarPuntualidad_({
      idEmpleado, nombre, fechaTxt: hoyTxt, horaEntrada: horaActual,
      minTarde: 0, minTemprano, nivel, multaPagada: 0
    });

    enviarCorreoRegistroInmediato_(idEmpleado, nombre, 'ENTRADA', hoyTxt, horaActual, estado, 0, '', '', { minTemprano, nivel, multa:0 });

    return renderEntradaPage_({
      tipo: temprano ? 'temprano' : 'aTiempo',
      nombre, hoyTxt, horaActual, estado,
      minTemprano, nivel
    });
  }

  // ══════════════ SALIDA ══════════════
  const fila       = rowIndex + 1;
  const entradaDT  = hoja.getRange(fila, 10).getValue();
  const salidaDT   = hoja.getRange(fila, 11).getValue();
  const horaSalida = hoja.getRange(fila, 5).getValue();

  if (salidaDT || horaSalida) {
    return renderPage_({
      tipo: 'completo',
      titulo: '✅ Registro completo',
      detalle: `Ya registraste entrada y salida del día ${hoyTxt}.`,
      nombre
    });
  }

  if (entradaDT instanceof Date) {
    const diffMin = Math.floor((new Date().getTime() - entradaDT.getTime()) / 60000);
    if (diffMin < MIN_MINUTES_BETWEEN_ENTRY_EXIT) {
      return renderPage_({
        tipo: 'info',
        titulo: 'Confirmación requerida',
        detalle: `Tu entrada fue hace ${diffMin} min. La salida se habilita después de ${MIN_MINUTES_BETWEEN_ENTRY_EXIT} min.`,
        nombre
      });
    }
  }

  ahora = new Date();
  const horaActualSalida = Utilities.formatDate(ahora, ZONA, 'HH:mm:ss');

  hoja.getRange(fila, 5).setValue(horaActualSalida);
  hoja.getRange(fila, 11).setValue(ahora);

  let horasTxt = '';
  if (entradaDT instanceof Date) {
    const ms = ahora.getTime() - entradaDT.getTime();
    horasTxt = formatDuration_(ms);
    hoja.getRange(fila, 9).setValue(horasTxt);
  }

  const estado   = String(hoja.getRange(fila, 6).getValue() || '').trim();
  const minTarde = Number(hoja.getRange(fila, 7).getValue() || 0);
  const motivo   = String(hoja.getRange(fila, 8).getValue() || '').trim();

  enviarCorreoRegistroInmediato_(idEmpleado, nombre, 'SALIDA', hoyTxt, horaActualSalida, estado, minTarde, motivo, horasTxt, null);

  return renderSalidaPage_({
    nombre, hoyTxt,
    horaEntrada: normalizarHora_(entradaDT),
    horaSalida: horaActualSalida,
    horasTxt, estado, minTarde
  });
}


/******************************************************************************
 *  PUNTUALIDAD — registrar y consultar
 ******************************************************************************/
function obtenerNivel_(minTemprano) {
  if (!minTemprano || minTemprano < 1) return null;
  for (const n of NIVELES_PUNTUALIDAD) {
    if (minTemprano >= n.minDesde) return n;
  }
  return null;
}

function registrarPuntualidad_({ idEmpleado, nombre, fechaTxt, horaEntrada, minTarde, minTemprano, nivel, multaPagada }) {
  try {
    const hoja = getOrCreateSheet_(SHEET_PUNTUALIDAD);
    asegurarColumnasPuntualidad_(hoja);

    const puntos = nivel ? Number(nivel.puntos || 0) : 0;
    const nivelTxt = nivel ? `${nivel.emoji} ${nivel.nombre}` : (minTarde > 0 ? '⚠️ Tarde' : '⏰ A tiempo');

    hoja.appendRow([
      idEmpleado,
      nombre,
      fechaTxt,
      horaEntrada,
      Number(minTarde || 0),
      Number(minTemprano || 0),
      nivelTxt,
      puntos,
      Number(multaPagada || 0),
      0,                   // MULTA_GANADA — se recalcula al consultar
      new Date()
    ]);

    // Recalcular ganadora del día
    recalcularMultasGanadasDelDia_(fechaTxt);
  } catch(e) {
    Logger.log('Error registrando puntualidad: ' + e.message);
  }
}

/**
 * Recalcula la columna MULTA_GANADA del día indicado.
 * El empleado con MENOR hora de entrada del día gana TODAS las multas pagadas ese día.
 * Si hay empate, se reparte equitativamente.
 */
function recalcularMultasGanadasDelDia_(fechaTxt) {
  const hoja = getOrCreateSheet_(SHEET_PUNTUALIDAD);
  if (hoja.getLastRow() < 2) return;

  const data = hoja.getDataRange().getValues();
  const filasDia = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2] || '').trim() === fechaTxt) {
      filasDia.push({ fila: i + 1, row: data[i] });
    }
  }
  if (!filasDia.length) return;

  // Pot total del día = suma de multas pagadas
  let pot = 0;
  filasDia.forEach(f => { pot += Number(f.row[8] || 0); });

  // Limpiar todas las multas ganadas del día
  filasDia.forEach(f => hoja.getRange(f.fila, 10).setValue(0));

  if (pot <= 0) return;

  // Encontrar empleado(s) con menor hora de entrada
  let menorMs = Infinity;
  filasDia.forEach(f => {
    const ms = convertirHoraMs_(String(f.row[3] || ''));
    if (ms !== null && ms < menorMs) menorMs = ms;
  });

  const ganadores = filasDia.filter(f => convertirHoraMs_(String(f.row[3] || '')) === menorMs);
  if (!ganadores.length) return;

  const reparto = Math.round((pot / ganadores.length) * 100) / 100;
  ganadores.forEach(g => hoja.getRange(g.fila, 10).setValue(reparto));
}


/******************************************************************************
 *  TARDANZA — pendiente en cache
 ******************************************************************************/
function guardarPendienteTarde_(idEmpleado, nombre, fechaTxt, horaEntrada, minTarde) {
  const cache   = CacheService.getScriptCache();
  const key     = pendingLateKey_(idEmpleado, fechaTxt);
  const payload = JSON.stringify({ idEmpleado, nombre, fechaTxt, horaEntrada, minTarde, createdAt: Date.now() });
  cache.put(key, payload, PENDING_LATE_TTL_SECONDS);
}

function leerPendienteTarde_(idEmpleado, fechaTxt) {
  const cache = CacheService.getScriptCache();
  const raw   = cache.get(pendingLateKey_(idEmpleado, fechaTxt));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch(e) { return null; }
}

function borrarPendienteTarde_(idEmpleado, fechaTxt) {
  CacheService.getScriptCache().remove(pendingLateKey_(idEmpleado, fechaTxt));
}

function pendingLateKey_(idEmpleado, fechaTxt) {
  return `pendingLate_${String(idEmpleado).trim()}_${String(fechaTxt).trim()}`;
}


/******************************************************************************
 *  TARDANZA — finalizar con motivo
 ******************************************************************************/
function finalizarTardanzaConMotivo_(idEmpleado, nombre, motivo) {
  const hoja = getSheet_();
  asegurarColumnas_(hoja);

  const hoyTxt  = formatBusinessDateTxt_(getBusinessDate_(new Date()));
  const pending = leerPendienteTarde_(idEmpleado, hoyTxt);

  if (!pending) return { ok:false, enviado:false, errorMail:'Pendiente expirado.' };

  const datos = hoja.getDataRange().getValues();
  let yaRegistrado = false, fila = -1, horaEntrada = '', min = 0;

  for (let i = 1; i < datos.length; i++) {
    const [id, , fecha] = datos[i];
    if (String(id || '').trim() !== idEmpleado) continue;
    if (normalizarFecha_(fecha) === hoyTxt) {
      yaRegistrado = true; fila = i + 1;
      hoja.getRange(fila, 8).setValue(motivo);
      horaEntrada = normalizarHora_(datos[i][3] || pending.horaEntrada || '');
      min         = Number(datos[i][6] || pending.minTarde || 0);
      break;
    }
  }

  if (!yaRegistrado) {
    horaEntrada = String(pending.horaEntrada || Utilities.formatDate(new Date(), ZONA, 'HH:mm:ss'));
    min         = Number(pending.minTarde || 0);
    const fechaNegocio = getBusinessDate_(new Date());
    const entradaDT    = construirDateTime_(fechaNegocio, horaEntrada);
    hoja.appendRow([
      idEmpleado, nombre, fechaNegocio,
      horaEntrada, '', 'TARDE', min, motivo, '', entradaDT, '',
      '', '', '', ''
    ]);
  }

  // Calcular y registrar multa en PUNTUALIDAD
  const multa = Math.round(min * MULTA_POR_MIN_TARDE * 100) / 100;
  registrarPuntualidad_({
    idEmpleado, nombre, fechaTxt: hoyTxt, horaEntrada,
    minTarde: min, minTemprano: 0, nivel: null, multaPagada: multa
  });

  let enviado = false, errorMail = '';
  try {
    enviarCorreoRegistroInmediato_(idEmpleado, nombre, 'ENTRADA', hoyTxt, horaEntrada, 'TARDE', min, motivo, '', { minTemprano:0, nivel:null, multa });
    enviado = true;
  } catch(e) { errorMail = String(e.stack||e.message||e); }

  borrarPendienteTarde_(idEmpleado, hoyTxt);
  return { ok:true, enviado, errorMail, fechaTxt:hoyTxt, horaEntrada, minTarde:min, multa };
}


/******************************************************************************
 *  UI — Página de confirmación (con GPS)
 ******************************************************************************/
function renderConfirmPage_(id, nombre) {
  const url     = ScriptApp.getService().getUrl();
  const logoWeb = getLogoWebUrl_();
  const esFds   = esFindeSemana_(new Date());
  const diaTxt  = esFds ? 'Sáb/Dom — entrada 10:35 AM' : 'Lun-Vie — entrada 11:05 AM';

  const html = `<!DOCTYPE html>
<html><head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Bienvenido</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Roboto,Arial,sans-serif;background:#0B0F14;color:#F9FAFB;
         padding:20px;min-height:100vh;display:flex;align-items:center;justify-content:center}
    .card{width:100%;max-width:440px;background:#111827;border:1px solid #1F2937;
          border-radius:22px;box-shadow:0 16px 40px rgba(0,0,0,.5);overflow:hidden}
    .header{padding:20px 20px 16px;border-bottom:1px solid #1F2937;text-align:center}
    .logo{height:52px;margin:0 auto 10px;display:block;border-radius:10px}
    .welcome{font-size:12px;color:#C9A227;font-weight:800;letter-spacing:.5px;margin-bottom:4px}
    .name{font-size:21px;font-weight:900;color:#F9FAFB}
    .id-pill{display:inline-block;margin-top:6px;padding:3px 12px;
             background:rgba(201,162,39,.1);border:1px solid rgba(201,162,39,.2);
             border-radius:20px;color:#FDE68A;font-size:12px;font-weight:700}
    .body{padding:18px}
    .horario{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);
             border-radius:12px;padding:10px 14px;margin-bottom:16px;
             display:flex;justify-content:space-between;align-items:center;font-size:12.5px}
    .horario .k{color:#6B7280;font-size:11px;text-transform:uppercase;letter-spacing:.3px;margin-bottom:2px}
    .horario .v{font-weight:900}
    .gps-box{border-radius:14px;padding:14px;text-align:center;margin-bottom:14px;
             background:rgba(201,162,39,.06);border:1px solid rgba(201,162,39,.15);transition:all .3s}
    .gps-box.ok{background:rgba(34,197,94,.08);border-color:rgba(34,197,94,.25)}
    .gps-box.fail{background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.25)}
    .gps-icon{font-size:26px;margin-bottom:6px}
    .gps-status{font-size:13px;font-weight:700;color:#FDE68A}
    .gps-box.ok .gps-status{color:#86EFAC}
    .gps-box.fail .gps-status{color:#FCA5A5}
    .gps-detail{font-size:11.5px;color:#9CA3AF;margin-top:4px;line-height:1.4}
    .btn-asist{display:block;width:100%;padding:15px;background:#C9A227;color:#0B0F14;
               font-weight:900;font-size:15px;border:none;border-radius:16px;cursor:pointer;
               text-decoration:none;text-align:center;transition:opacity .15s}
    .btn-asist:disabled,.btn-asist.off{opacity:.35;pointer-events:none}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <img class="logo" src="${logoWeb}" alt="Logo"/>
      <div class="welcome">👋 BIENVENIDO</div>
      <div class="name">${escapeHtml_(nombre)}</div>
      <span class="id-pill">ID: ${escapeHtml_(id)}</span>
    </div>
    <div class="body">
      <div class="horario">
        <div><div class="k">Horario hoy</div><div class="v">${diaTxt}</div></div>
        <div style="text-align:right"><div class="k">Multa</div><div class="v" style="color:#EF4444">$0.10/min</div></div>
      </div>
      <div class="gps-box" id="gpsBox">
        <div class="gps-icon">📍</div>
        <div class="gps-status" id="gpsStatus">Verificando ubicación…</div>
        <div class="gps-detail" id="gpsDetail">Un momento por favor.</div>
      </div>
      <button class="btn-asist off" id="btnAsist" disabled onclick="irAsistencia()">
        ✅ Registrar Asistencia
      </button>
    </div>
  </div>
  <script>
    const NEGOCIO_LAT = ${NEGOCIO_LAT};
    const NEGOCIO_LNG = ${NEGOCIO_LNG};
    const RADIO_M     = ${GPS_RADIO_METROS};
    const ASIST_URL   = '${url}?id=${encodeURIComponent(id)}&confirm=1';

    function haversine(la1,ln1,la2,ln2){
      const R=6371000, dL=(la2-la1)*Math.PI/180, dN=(ln2-ln1)*Math.PI/180;
      const a=Math.sin(dL/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dN/2)**2;
      return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
    }

    function setGps(estado, titulo, detalle) {
      const box = document.getElementById('gpsBox');
      box.className = 'gps-box ' + estado;
      document.getElementById('gpsStatus').textContent = titulo;
      document.getElementById('gpsDetail').textContent = detalle;
      if (estado === 'ok') {
        const btn = document.getElementById('btnAsist');
        btn.classList.remove('off');
        btn.disabled = false;
      }
    }

    function irAsistencia() {
      document.getElementById('btnAsist').textContent = '⏳ Cargando…';
      document.getElementById('btnAsist').disabled = true;
      window.location.href = ASIST_URL;
    }

    if (!navigator.geolocation) {
      setGps('fail','❌ GPS no disponible','Tu dispositivo no soporta geolocalización.');
    } else {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const dist = Math.round(haversine(NEGOCIO_LAT,NEGOCIO_LNG,pos.coords.latitude,pos.coords.longitude));
          if (dist <= RADIO_M) {
            setGps('ok','✅ Ubicación verificada','Estás dentro del negocio ('+dist+'m). Puedes registrar.');
          } else {
            setGps('fail','❌ Fuera del rango','Estás a '+dist+'m. Máximo permitido: '+RADIO_M+'m.');
          }
        },
        err => {
          const msg={1:'Permiso denegado.',2:'GPS no disponible.',3:'Tiempo agotado.'};
          setGps('fail','❌ Error GPS', msg[err.code]||'No se pudo obtener ubicación.');
        },
        {enableHighAccuracy:true, timeout:10000, maximumAge:0}
      );
    }
  </script>
</body></html>`;

  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/******************************************************************************
 *  UI — Página de entrada exitosa (con medalla si aplica)
 ******************************************************************************/
function renderEntradaPage_({ tipo, nombre, hoyTxt, horaActual, estado, minTemprano, nivel }) {
  const logoWeb = getLogoWebUrl_();
  const tieneMedalla = !!nivel;

  const banner = tieneMedalla ? `
    <div style="background:${nivel.bg};border:2px solid ${nivel.color};border-radius:16px;padding:20px;text-align:center;margin-bottom:14px">
      <div style="font-size:48px;line-height:1;margin-bottom:8px">${nivel.emoji}</div>
      <div style="font-size:22px;font-weight:900;color:${nivel.color};margin-bottom:4px">¡Medalla ${escapeHtml_(nivel.nombre)}!</div>
      <div style="color:#D1D5DB;font-size:13px">Llegaste <b>${minTemprano} min</b> antes de tu hora</div>
      <div style="margin-top:10px;padding:8px 14px;background:rgba(0,0,0,.3);border-radius:20px;display:inline-block">
        <span style="color:${nivel.color};font-weight:900;font-size:14px">+${nivel.puntos} puntos</span>
      </div>
    </div>` : `
    <div style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);border-radius:16px;padding:20px;text-align:center;margin-bottom:14px">
      <div style="font-size:36px;margin-bottom:6px">⏰</div>
      <div style="font-size:18px;font-weight:900;color:#22C55E">¡Entrada A Tiempo!</div>
      <div style="color:#86EFAC;font-size:13px;margin-top:4px">Sigue así para ganar medallas</div>
    </div>`;

  const html = `<!DOCTYPE html>
<html><head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Entrada Registrada</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Roboto,Arial,sans-serif;background:#0B0F14;color:#F9FAFB;padding:20px;min-height:100vh}
    .card{max-width:480px;margin:30px auto;background:#111827;border:1px solid #1F2937;border-radius:20px;
          box-shadow:0 12px 32px rgba(0,0,0,.4);overflow:hidden}
    .header{padding:16px 18px;border-bottom:1px solid #1F2937;display:flex;gap:12px;align-items:center}
    .logo{height:44px;border-radius:8px}
    .body{padding:18px}
    .rows{border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden;margin-bottom:14px}
    .row{display:flex;justify-content:space-between;padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.06)}
    .row:last-child{border-bottom:none}
    .k{color:#6B7280;font-size:12px;text-transform:uppercase;letter-spacing:.3px}
    .v{font-weight:900;font-size:13px}
    .escala{margin-top:10px;padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02)}
    .escala-titulo{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#9CA3AF;margin-bottom:8px}
    .esc-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:12px}
    .btn-close{display:block;width:100%;padding:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);
               color:#9CA3AF;font-weight:700;font-size:14px;border-radius:14px;cursor:pointer;text-decoration:none;text-align:center;margin-top:14px}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <img class="logo" src="${logoWeb}" alt="Logo"/>
      <div>
        <div style="color:#22C55E;font-weight:800;font-size:11px;letter-spacing:.5px">🟢 ENTRADA</div>
        <div style="font-size:17px;font-weight:900;margin-top:3px">${escapeHtml_(nombre)}</div>
        <div style="color:#9CA3AF;font-size:12px;margin-top:2px">${escapeHtml_(hoyTxt)}</div>
      </div>
    </div>
    <div class="body">
      ${banner}
      <div class="rows">
        <div class="row"><div class="k">Hora entrada</div><div class="v" style="color:#22C55E">${escapeHtml_(horaActual)}</div></div>
        <div class="row"><div class="k">Estado</div><div class="v" style="color:#C9A227">${escapeHtml_(estado)}</div></div>
        ${tieneMedalla ? `<div class="row"><div class="k">Min antes</div><div class="v">${minTemprano} min</div></div>` : ''}
      </div>
      <div class="escala">
        <div class="escala-titulo">🏆 Escala de Medallas</div>
        ${NIVELES_PUNTUALIDAD.slice().reverse().map(n => `
          <div class="esc-row">
            <span style="color:${n.color};font-weight:700">${n.emoji} ${escapeHtml_(n.nombre)}</span>
            <span style="color:#9CA3AF">${n.minDesde}+ min antes → <b style="color:${n.color}">${n.puntos} pts</b></span>
          </div>`).join('')}
      </div>
      <a class="btn-close" href="#" onclick="window.close();return false;">Cerrar ventana</a>
    </div>
  </div>
</body></html>`;

  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/******************************************************************************
 *  UI — Página de salida
 ******************************************************************************/
function renderSalidaPage_({ nombre, hoyTxt, horaEntrada, horaSalida, horasTxt, estado, minTarde }) {
  const logoWeb = getLogoWebUrl_();

  const html = `<!DOCTYPE html>
<html><head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Salida Registrada</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Roboto,Arial,sans-serif;background:#0B0F14;color:#F9FAFB;padding:20px;min-height:100vh}
    .card{max-width:480px;margin:30px auto;background:#111827;border:1px solid #1F2937;border-radius:20px;
          box-shadow:0 12px 32px rgba(0,0,0,.4);overflow:hidden}
    .header{padding:16px 18px;border-bottom:1px solid #1F2937;display:flex;gap:12px;align-items:center}
    .logo{height:44px;border-radius:8px}
    .body{padding:18px}
    .banner{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);border-radius:14px;
            padding:16px;text-align:center;margin-bottom:14px}
    .rows{border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden;margin-bottom:14px}
    .row{display:flex;justify-content:space-between;padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.06)}
    .row:last-child{border-bottom:none}
    .k{color:#6B7280;font-size:12px;text-transform:uppercase;letter-spacing:.3px}
    .v{font-weight:900;font-size:13px}
    .btn-close{display:block;width:100%;padding:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);
               color:#9CA3AF;font-weight:700;font-size:14px;border-radius:14px;cursor:pointer;text-decoration:none;text-align:center}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <img class="logo" src="${logoWeb}" alt="Logo"/>
      <div>
        <div style="color:#EF4444;font-weight:800;font-size:11px;letter-spacing:.5px">🔴 SALIDA</div>
        <div style="font-size:17px;font-weight:900;margin-top:3px">${escapeHtml_(nombre)}</div>
        <div style="color:#9CA3AF;font-size:12px;margin-top:2px">${escapeHtml_(hoyTxt)}</div>
      </div>
    </div>
    <div class="body">
      <div class="banner">
        <div style="font-size:36px;margin-bottom:6px">✅</div>
        <div style="font-size:20px;font-weight:900;color:#22C55E">Salida registrada</div>
        <div style="color:#86EFAC;font-size:13px;margin-top:4px">Tu jornada quedó guardada</div>
      </div>
      <div class="rows">
        <div class="row"><div class="k">Entrada</div><div class="v" style="color:#22C55E">${escapeHtml_(horaEntrada)}</div></div>
        <div class="row"><div class="k">Salida</div><div class="v" style="color:#EF4444">${escapeHtml_(horaSalida)}</div></div>
        ${horasTxt ? `<div class="row"><div class="k">Horas trabajadas</div><div class="v" style="color:#8B5CF6">${escapeHtml_(horasTxt)}</div></div>` : ''}
        <div class="row"><div class="k">Estado entrada</div>
          <div class="v" style="color:${estado==='TARDE'?'#EF4444':estado==='TEMPRANO'?'#22C55E':'#C9A227'}">
            ${escapeHtml_(estado)}${minTarde > 0 ? ` (+${minTarde} min)` : ''}
          </div>
        </div>
      </div>
      <a class="btn-close" href="#" onclick="window.close();return false;">Cerrar ventana</a>
    </div>
  </div>
</body></html>`;

  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/******************************************************************************
 *  UI — Panel Admin (ranking de puntualidad)
 ******************************************************************************/
function renderPanelAdmin_() {
  const logoWeb   = getLogoWebUrl_();
  const empleados = getEmpleadosList_().filter(e => e.estado === 'ACTIVO');
  const datosPunt = getResumenPuntualidad_();

  const filas = empleados.map(emp => {
    const r = datosPunt[emp.id] || { puntos:0, tardanzas:0, tempranos:0, multaPagada:0, multaGanada:0, dias:0 };
    return { ...emp, ...r };
  }).sort((a,b) => b.puntos - a.puntos);

  const totalPot   = filas.reduce((a,r) => a + r.multaPagada, 0);
  const totalRepartido = filas.reduce((a,r) => a + r.multaGanada, 0);

  const html = `<!DOCTYPE html>
<html><head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Panel Admin · Puntualidad</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Roboto,Arial,sans-serif;background:#0B0F14;color:#F9FAFB;padding:16px;min-height:100vh}
    .card{max-width:880px;margin:20px auto;background:#111827;border:1px solid #1F2937;border-radius:20px;
          box-shadow:0 12px 32px rgba(0,0,0,.4);overflow:hidden}
    .header{padding:16px 18px;border-bottom:1px solid #1F2937;display:flex;gap:12px;align-items:center}
    .logo{height:44px;border-radius:8px}
    .body{padding:18px}
    .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
    .kpi{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px;text-align:center}
    .kpi .k{color:#6B7280;font-size:10px;text-transform:uppercase;letter-spacing:.3px;margin-bottom:6px}
    .kpi .v{font-size:20px;font-weight:900}
    .escala{margin-bottom:16px;padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02)}
    .escala-titulo{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#9CA3AF;margin-bottom:10px}
    .esc-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
    .esc-item{text-align:center;padding:12px 8px;border:1px solid rgba(255,255,255,.08);border-radius:12px}
    .esc-emoji{font-size:28px;margin-bottom:4px}
    .ranking{border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden}
    table{width:100%;border-collapse:collapse}
    th{padding:10px;text-align:left;color:#6B7280;font-size:11px;text-transform:uppercase;letter-spacing:.3px;
       background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.08)}
    td{padding:11px 10px;font-size:13px;border-bottom:1px solid rgba(255,255,255,.04)}
    tr:last-child td{border-bottom:none}
    .pos{display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:50%;font-weight:900;font-size:12px}
    .pos-1{background:linear-gradient(135deg,#F59E0B,#D97706);color:#0B0F14}
    .pos-2{background:linear-gradient(135deg,#CBD5E1,#94A3B8);color:#0B0F14}
    .pos-3{background:linear-gradient(135deg,#D97706,#92400E);color:#FED7AA}
    .pos-other{background:rgba(255,255,255,.06);color:#9CA3AF}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <img class="logo" src="${logoWeb}" alt="Logo"/>
      <div>
        <div style="color:#C9A227;font-weight:800;font-size:11px;letter-spacing:.5px">⚙️ PANEL · PUNTUALIDAD</div>
        <div style="font-size:18px;font-weight:900;margin-top:3px">Ranking de Empleados</div>
        <div style="color:#9CA3AF;font-size:12px;margin-top:2px">Sistema de medallas y multas</div>
      </div>
    </div>
    <div class="body">

      <div class="kpis">
        <div class="kpi"><div class="k">Empleados activos</div><div class="v" style="color:#C9A227">${filas.length}</div></div>
        <div class="kpi"><div class="k">Pot total multas</div><div class="v" style="color:#EF4444">$${totalPot.toFixed(2)}</div></div>
        <div class="kpi"><div class="k">Repartido a ganadores</div><div class="v" style="color:#22C55E">$${totalRepartido.toFixed(2)}</div></div>
      </div>

      <div class="escala">
        <div class="escala-titulo">🏆 Escala de Medallas (puntos por minutos antes de la hora)</div>
        <div class="esc-grid">
          ${NIVELES_PUNTUALIDAD.slice().reverse().map(n => `
            <div class="esc-item" style="background:${n.bg};border-color:${n.color}">
              <div class="esc-emoji">${n.emoji}</div>
              <div style="font-weight:900;color:${n.color};font-size:13px">${escapeHtml_(n.nombre)}</div>
              <div style="font-size:11px;color:#9CA3AF;margin-top:2px">${n.minDesde}+ min</div>
              <div style="margin-top:6px;font-size:13px;font-weight:900;color:${n.color}">${n.puntos} pts</div>
            </div>`).join('')}
        </div>
      </div>

      <div class="ranking">
        <table>
          <tr>
            <th>#</th>
            <th>Empleado</th>
            <th align="center">Días</th>
            <th align="center" title="Llegadas tempranas">⏰ Temp.</th>
            <th align="center" title="Llegadas tarde">⚠️ Tarde</th>
            <th align="right" title="Multa pagada">💸 Pagó</th>
            <th align="right" title="Multa ganada">🏆 Ganó</th>
            <th align="right">Puntos</th>
          </tr>
          ${filas.map((r,i) => {
            const posClass = i===0?'pos-1':i===1?'pos-2':i===2?'pos-3':'pos-other';
            return `<tr>
              <td><span class="pos ${posClass}">${i+1}</span></td>
              <td><div style="font-weight:900">${escapeHtml_(r.nombre)}</div><div style="color:#6B7280;font-size:11px">${escapeHtml_(r.id)}</div></td>
              <td align="center" style="color:#9CA3AF">${r.dias}</td>
              <td align="center" style="color:#22C55E;font-weight:900">${r.tempranos}</td>
              <td align="center" style="color:#EF4444;font-weight:900">${r.tardanzas}</td>
              <td align="right" style="color:#FCA5A5;font-weight:700">$${r.multaPagada.toFixed(2)}</td>
              <td align="right" style="color:#86EFAC;font-weight:900">$${r.multaGanada.toFixed(2)}</td>
              <td align="right" style="color:#FDE68A;font-weight:900;font-size:15px">${r.puntos}</td>
            </tr>`;
          }).join('')}
        </table>
      </div>
    </div>
  </div>
</body></html>`;

  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/******************************************************************************
 *  UI — Motivo de tardanza
 ******************************************************************************/
function renderMotivoPage_(id, nombre, fechaTxt, hora, minTarde) {
  const url     = ScriptApp.getService().getUrl();
  const logoWeb = getLogoWebUrl_();
  const motivos = ['Tráfico', 'Transporte', 'Salud', 'Personal', 'Trabajo anterior', 'Otro'];
  const multa   = (minTarde * MULTA_POR_MIN_TARDE).toFixed(2);

  const botones = motivos.map(m => {
    const link = `${url}?id=${encodeURIComponent(id)}&confirm=1&action=motivo&value=${encodeURIComponent(m)}`;
    return `<a class="chip" href="${link}"
      onclick="this.textContent='⏳ Guardando…';document.querySelectorAll('.chip').forEach(c=>c.style.pointerEvents='none');">
      ${escapeHtml_(m)}</a>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Roboto,Arial,sans-serif;background:#0B0F14;color:#F9FAFB;padding:20px}
    .card{max-width:580px;margin:40px auto;background:#111827;border:1px solid #1F2937;border-radius:20px;
          box-shadow:0 12px 32px rgba(0,0,0,.4);overflow:hidden}
    .header{padding:16px 18px;border-bottom:1px solid #1F2937;display:flex;gap:12px;align-items:center}
    .logo{height:44px;border-radius:8px}
    .body{padding:18px}
    .multa{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);border-radius:14px;
           padding:14px;text-align:center;margin-bottom:14px}
    .warn{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25);border-radius:14px;
          padding:12px 14px;color:#FDE68A;font-size:13px;line-height:1.5;margin-bottom:14px}
    .chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:4px}
    .chip{padding:13px 16px;border-radius:14px;background:rgba(255,255,255,.05);
          border:1px solid rgba(255,255,255,.10);text-decoration:none;color:#F9FAFB;
          font-weight:800;font-size:13px;transition:all .15s}
    .chip:hover{background:rgba(201,162,39,.1);border-color:#C9A227;color:#FDE68A}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <img class="logo" src="${logoWeb}" alt="Logo"/>
      <div>
        <div style="color:#EF4444;font-weight:800;font-size:11px;letter-spacing:.5px">⚠️ TARDANZA</div>
        <div style="font-size:17px;font-weight:900;margin-top:3px">Llegaste tarde</div>
        <div style="color:#9CA3AF;font-size:12px;margin-top:2px">${escapeHtml_(nombre)} • ${fechaTxt} • ${hora}</div>
      </div>
    </div>
    <div class="body">
      <div class="multa">
        <div style="font-size:30px;margin-bottom:4px">💸</div>
        <div style="font-size:13px;color:#9CA3AF">Multa por <b style="color:#FCA5A5">${minTarde} min</b> de tardanza</div>
        <div style="font-size:26px;font-weight:900;color:#EF4444;margin-top:4px">$${multa}</div>
        <div style="font-size:11px;color:#9CA3AF;margin-top:6px">($0.10 por minuto · va al empleado más temprano del día)</div>
      </div>
      <div class="warn">
        ⚠️ <b>OBLIGATORIO:</b> Selecciona un motivo para registrar tu entrada.<br>
        📩 El correo al administrador se enviará DESPUÉS de seleccionar el motivo.
      </div>
      <div style="color:#9CA3AF;font-size:12px;margin-bottom:10px">Selecciona el motivo de tu tardanza:</div>
      <div class="chips">${botones}</div>
    </div>
  </div>
</body></html>`;

  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/******************************************************************************
 *  UI — Motivo guardado
 ******************************************************************************/
function renderMotivoGuardadoPage_({ nombre, motivo, fechaTxt, horaEntrada, minTarde, multa, enviado, errorMail }) {
  const logoWeb  = getLogoWebUrl_();
  const detEnvio = enviado
    ? '📩 Correo enviado correctamente al administrador.'
    : `⚠️ Asistencia registrada, pero el correo no se pudo enviar. (${escapeHtml_(errorMail||'sin detalle')})`;

  const html = `<!DOCTYPE html>
<html><head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Roboto,Arial,sans-serif;background:#0B0F14;color:#F9FAFB;padding:20px}
    .card{max-width:520px;margin:40px auto;background:#111827;border:1px solid #1F2937;border-radius:20px;
          box-shadow:0 12px 32px rgba(0,0,0,.4);overflow:hidden}
    .header{padding:16px 18px;border-bottom:1px solid #1F2937;display:flex;gap:12px;align-items:center}
    .logo{height:44px;border-radius:8px}
    .body{padding:18px}
    .banner{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);border-radius:14px;
            padding:16px;text-align:center;margin-bottom:14px}
    .rows{border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden;margin-bottom:14px}
    .row{display:flex;justify-content:space-between;padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.04)}
    .row:last-child{border-bottom:none}
    .k{color:#6B7280;font-size:12px;text-transform:uppercase;letter-spacing:.3px}
    .v{font-weight:900;font-size:13px}
    .btn-close{display:block;width:100%;padding:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);
               color:#9CA3AF;font-weight:700;font-size:14px;border-radius:14px;cursor:pointer;text-decoration:none;text-align:center}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <img class="logo" src="${logoWeb}" alt="Logo"/>
      <div>
        <div style="color:#C9A227;font-weight:800;font-size:11px;letter-spacing:.5px">ASISTENCIA • CONTROL</div>
        <div style="font-size:17px;font-weight:900;margin-top:3px;color:#22C55E">✅ Proceso completado</div>
        <div style="color:#9CA3AF;font-size:12px;margin-top:2px">${escapeHtml_(nombre)}</div>
      </div>
    </div>
    <div class="body">
      <div class="banner">
        <div style="font-size:28px;margin-bottom:6px">✅</div>
        <div style="font-size:17px;font-weight:900;color:#22C55E">Asistencia registrada y administrador notificado</div>
      </div>
      <div style="color:#9CA3AF;font-size:12.5px;margin-bottom:14px">${detEnvio}</div>
      <div class="rows">
        <div class="row"><div class="k">Motivo</div><div class="v">${escapeHtml_(motivo)}</div></div>
        <div class="row"><div class="k">Fecha</div><div class="v">${escapeHtml_(fechaTxt)}</div></div>
        <div class="row"><div class="k">Entrada</div><div class="v">${escapeHtml_(horaEntrada)}</div></div>
        <div class="row"><div class="k">Min tarde</div><div class="v" style="color:#EF4444">${Number(minTarde||0)} min</div></div>
        <div class="row"><div class="k">Multa</div><div class="v" style="color:#EF4444">$${Number(multa||0).toFixed(2)}</div></div>
      </div>
      <a class="btn-close" href="#" onclick="window.close();return false;">Cerrar ventana</a>
    </div>
  </div>
</body></html>`;

  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/******************************************************************************
 *  UI — renderPage_ genérico
 ******************************************************************************/
function renderPage_({ tipo, titulo, detalle, nombre }) {
  const colors = { entrada:'#22C55E', salida:'#EF4444', completo:'#8B5CF6', info:'#F59E0B', error:'#EF4444' };
  const icons  = { entrada:'✅', salida:'🔴', completo:'✅', info:'ℹ️', error:'❌' };
  const c      = colors[tipo] || '#9CA3AF';
  const icon   = icons[tipo] || '📋';
  const logoWeb= getLogoWebUrl_();

  const html = `<!DOCTYPE html>
<html><head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Roboto,Arial,sans-serif;background:#0B0F14;color:#F9FAFB;
         padding:20px;min-height:100vh;display:flex;align-items:center;justify-content:center}
    .card{width:100%;max-width:500px;background:#111827;border:1px solid #1F2937;border-radius:20px;
          box-shadow:0 12px 32px rgba(0,0,0,.4);text-align:center;padding:32px 24px}
    .logo{height:52px;margin:0 auto 16px;display:block;border-radius:10px}
    .icon{font-size:44px;margin-bottom:12px}
    .title{font-size:22px;font-weight:900;color:${c};margin-bottom:8px}
    .name{font-size:15px;font-weight:900;color:#F9FAFB;margin-bottom:6px}
    .detail{color:#D1D5DB;font-size:13.5px;line-height:1.5}
    .footer{color:#4B5563;font-size:12px;margin-top:18px}
  </style>
</head>
<body>
  <div class="card">
    <img class="logo" src="${logoWeb}" alt="Logo"/>
    <div class="icon">${icon}</div>
    <div class="title">${escapeHtml_(titulo||'')}</div>
    ${nombre ? `<div class="name">${escapeHtml_(nombre)}</div>` : ''}
    <div class="detail">${escapeHtml_(detalle||'')}</div>
    <div class="footer">Sistema de Asistencia • Corte operativo 02:00 AM</div>
  </div>
</body></html>`;

  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/******************************************************************************
 *  CORREO
 ******************************************************************************/
function enviarCorreoRegistroInmediato_(codigo, nombre, tipo, fecha, hora, estado, minTarde, motivo, horasTxt, extra) {
  const icono  = tipo === 'ENTRADA' ? '🟢' : (tipo === 'SALIDA' ? '🔴' : '🟡');
  const asunto = `${icono} ${tipo} | ${nombre} | ${hora}`;
  const html   = construirHtmlNotificacionPremium_({ codigo, nombre, tipo, fecha, hora, estado, minTarde, motivo, horasTxt, extra });

  const mailOptions = {
    to:       emailsToString_(EMAIL_DESTINO),
    cc:       emailsToString_(EMAIL_CC),
    subject:  asunto,
    body:     `${tipo} | ${nombre} | ${fecha} ${hora} | ${estado}${minTarde?` (+${minTarde}m)`:''}${motivo?` | Motivo: ${motivo}`:''}${horasTxt?` | Horas: ${horasTxt}`:''}`,
    htmlBody: html
  };

  try {
    const blob = DriveApp.getFileById(LOGO_FILE_ID).getBlob().setName('logo.png');
    mailOptions.inlineImages = { logo: blob };
  } catch(e) {}

  MailApp.sendEmail(mailOptions);
}

function construirHtmlNotificacionPremium_({ codigo, nombre, tipo, fecha, hora, estado, minTarde, motivo, horasTxt, extra }) {
  const C = { bg:'#0B0F14', card:'#111827', border:'#1F2937', text:'#F9FAFB',
    muted:'#9CA3AF', gold:'#C9A227', green:'#22C55E', red:'#EF4444', amber:'#F59E0B' };

  const colorTipo = tipo === 'ENTRADA' ? C.green : tipo === 'SALIDA' ? C.red : C.amber;
  const titulo    = tipo === 'ENTRADA' ? 'Registro de Entrada' : tipo === 'SALIDA' ? 'Registro de Salida' : 'Actualización';

  const row = (k, v, c) => `
    <tr>
      <td style="padding:9px 8px;color:${C.muted};font-size:11.5px;text-transform:uppercase;letter-spacing:.3px;vertical-align:top;width:40%;">${escapeHtml_(k)}</td>
      <td style="padding:9px 8px;color:${c||C.text};font-weight:950;font-size:12.5px;word-break:break-word;">${escapeHtml_(v)}</td>
    </tr>`;

  let extraRows = '';
  if (extra) {
    if (extra.nivel) {
      extraRows += row('Medalla', `${extra.nivel.emoji} ${extra.nivel.nombre} (+${extra.nivel.puntos} pts)`, extra.nivel.color);
      extraRows += row('Min antes', `${extra.minTemprano} min`, C.green);
    }
    if (extra.multa > 0) {
      extraRows += row('Multa', `$${extra.multa.toFixed(2)}`, C.red);
    }
  }

  return `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
  <body style="margin:0;padding:0;background:${C.bg};font-family:Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:680px;margin:0 auto;padding:16px 10px;">
      <div style="border:1px solid ${C.border};background:${C.card};border-radius:18px;overflow:hidden;box-shadow:0 10px 28px rgba(0,0,0,.35);">
        <div style="padding:14px;border-bottom:1px solid ${C.border};display:flex;gap:12px;align-items:center;">
          <img src="cid:logo" alt="Logo" style="height:42px;display:block;border-radius:8px;">
          <div>
            <div style="color:${C.gold};font-weight:950;font-size:12px;">ASISTENCIA • SISTEMA</div>
            <div style="color:${colorTipo};font-size:18px;font-weight:950;margin-top:4px;">${titulo}</div>
            <div style="color:${C.muted};font-size:12px;margin-top:4px;">Corte operativo 02:00 AM</div>
          </div>
        </div>
        <div style="padding:12px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed;">
            ${row('Empleado', nombre)}
            ${row('Código', codigo)}
            ${row('Fecha', fecha)}
            ${row('Hora', hora)}
            ${row('Estado', `${estado}${minTarde?` (+${minTarde} min)`:''}`, colorTipo)}
            ${motivo ? row('Motivo', motivo) : ''}
            ${horasTxt ? row('Horas trabajadas', horasTxt) : ''}
            ${extraRows}
          </table>
        </div>
        <div style="padding:12px;border-top:1px solid ${C.border};color:${C.muted};font-size:12px;line-height:1.5;">
          <div><b style="color:${C.text};">Atentamente,</b> ${escapeHtml_(FIRMA)}</div>
          <div style="margin-top:6px;">Sistema de Asistencia</div>
        </div>
      </div>
    </div>
  </body></html>`;
}


/******************************************************************************
 *  HELPERS — Hojas
 ******************************************************************************/
function getSheet_() {
  const ss   = getSpreadsheet_();
  const hoja = ss.getSheetByName(SHEET_NAME);
  if (!hoja) throw new Error(`No existe la hoja "${SHEET_NAME}".`);
  return hoja;
}

function getOrCreateSheet_(name) {
  const ss   = getSpreadsheet_();
  let hoja   = ss.getSheetByName(name);
  if (!hoja) hoja = ss.insertSheet(name);
  return hoja;
}

function getSpreadsheet_() {
  try { const ss = SpreadsheetApp.getActiveSpreadsheet(); if (ss) return ss; } catch(e) {}
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID no configurado.');
  return SpreadsheetApp.openById(id);
}

function asegurarColumnas_(hoja) {
  const lastCol = hoja.getLastColumn();
  if (lastCol < 15) hoja.insertColumnsAfter(Math.max(lastCol,1), 15 - Math.max(lastCol,1));
  const headers  = hoja.getRange(1,1,1,15).getValues()[0];
  const expected = [
    'ID','NOMBRE','FECHA','HORA ENTRADA','HORA SALIDA',
    'ESTADO','MIN TARDE','MOTIVO TARDE','HORAS TRABAJADAS',
    'ENTRADA_DATETIME','SALIDA_DATETIME',
    'GPS_LAT','GPS_LNG','GPS_VALIDO','PAGO_SALIDA'
  ];
  const need = expected.some((h,i) => !headers[i] || String(headers[i]).trim() === '');
  if (need) hoja.getRange(1,1,1,15).setValues([expected]);
}

function asegurarColumnasPuntualidad_(hoja) {
  const expected = [
    'ID','NOMBRE','FECHA','HORA_ENTRADA',
    'MIN_TARDE','MIN_TEMPRANO','NIVEL','PUNTOS',
    'MULTA_PAGADA','MULTA_GANADA','TIMESTAMP'
  ];
  const headers  = hoja.getLastRow() > 0 ? hoja.getRange(1,1,1,expected.length).getValues()[0] : [];
  const need     = expected.some((h,i) => !headers[i] || String(headers[i]).trim() === '');
  if (need) {
    if (hoja.getLastColumn() < expected.length) hoja.insertColumnsAfter(Math.max(hoja.getLastColumn(),1), expected.length - Math.max(hoja.getLastColumn(),1));
    hoja.getRange(1,1,1,expected.length).setValues([expected]);
  }
}

function asegurarHojasExtra_() {
  asegurarColumnasPuntualidad_(getOrCreateSheet_(SHEET_PUNTUALIDAD));
}


/******************************************************************************
 *  HELPERS — Empleados (lectura solamente — NO toca la hoja EMPLEADOS)
 *  Lee dos bloques de empleados:
 *    - Bloque izquierdo:  columnas A-F (ID, NOMBRE, SUELDO, ESTADO, SUELDO_FDS, DEUDA)
 *    - Bloque derecho:    columnas H-M (mismo formato)
 ******************************************************************************/
function getEmpleadosList_() {
  try {
    const hoja = getOrCreateSheet_(SHEET_EMPLEADOS);
    if (hoja.getLastRow() < 2) return [];

    const lastRow = hoja.getLastRow();
    const lastCol = hoja.getLastColumn();
    const datos   = hoja.getRange(2, 1, lastRow - 1, Math.max(lastCol, 6)).getValues();
    const out     = [];
    const vistos  = {};

    const pushFila = (id, nombre, sueldo, estado, sueldoFds, deuda) => {
      const idTrim = String(id || '').trim();
      if (!idTrim) return;
      if (vistos[idTrim]) return;
      vistos[idTrim] = true;
      out.push({
        id:           idTrim,
        nombre:       String(nombre || '').trim(),
        sueldo:       Number(sueldo) || 0,
        estado:       String(estado || 'ACTIVO').trim().toUpperCase(),
        sueldoFds:    Number(sueldoFds) || Number(sueldo) || 0,
        deudaInicial: Number(deuda) || 0
      });
    };

    datos.forEach(r => {
      // Bloque izquierdo: A-F (índices 0..5)
      pushFila(r[0], r[1], r[2], r[3], r[4], r[5]);
      // Bloque derecho: H-M (índices 7..12) — solo si existen esas columnas
      if (lastCol >= 8) {
        pushFila(r[7], r[8], r[9], r[10], r[11], r[12]);
      }
    });

    return out;
  } catch(e) {
    Logger.log('getEmpleadosList_ error: ' + e.message);
    return [];
  }
}

function getEmpleadoById_(id) {
  const lista = getEmpleadosList_();
  return lista.find(e => e.id === String(id).trim()) || null;
}


/******************************************************************************
 *  HELPERS — Resumen de puntualidad por empleado
 ******************************************************************************/
function getResumenPuntualidad_() {
  const out  = {};
  try {
    const hoja = getOrCreateSheet_(SHEET_PUNTUALIDAD);
    if (hoja.getLastRow() < 2) return out;
    const datos = hoja.getDataRange().getValues().slice(1);
    datos.forEach(r => {
      const id = String(r[0] || '').trim();
      if (!id) return;
      if (!out[id]) out[id] = { puntos:0, tardanzas:0, tempranos:0, multaPagada:0, multaGanada:0, dias:0 };
      out[id].dias        += 1;
      out[id].puntos      += Number(r[7] || 0);
      out[id].multaPagada += Number(r[8] || 0);
      out[id].multaGanada += Number(r[9] || 0);
      if (Number(r[4] || 0) > 0)    out[id].tardanzas++;
      if (Number(r[5] || 0) > 0)    out[id].tempranos++;
    });
  } catch(e) { Logger.log('getResumenPuntualidad_ error: ' + e.message); }
  return out;
}


/******************************************************************************
 *  HELPERS — Fecha / Hora / Formato
 ******************************************************************************/
function getBusinessDate_(now) {
  const d    = new Date(now);
  const hour = Number(Utilities.formatDate(d, ZONA, 'H'));
  if (hour < DAY_CUTOFF_HOUR) d.setDate(d.getDate() - 1);
  d.setHours(0,0,0,0);
  return d;
}

function formatBusinessDateTxt_(dateObj) {
  return Utilities.formatDate(dateObj, ZONA, 'dd/MM/yyyy');
}

function convertirHoraMs_(hora) {
  if (!hora) return null;
  if (hora instanceof Date) {
    return ((Number(Utilities.formatDate(hora, ZONA, 'H')) * 60 +
              Number(Utilities.formatDate(hora, ZONA, 'm'))) * 60 +
              Number(Utilities.formatDate(hora, ZONA, 's'))) * 1000;
  }
  const partes = String(hora).trim().split(':').map(Number);
  if (partes.length >= 2) return ((partes[0]*60 + partes[1])*60 + (partes[2]||0)) * 1000;
  return null;
}

function normalizarFecha_(f) {
  if (!f) return '';
  if (f instanceof Date) return Utilities.formatDate(f, ZONA, 'dd/MM/yyyy');
  return String(f).trim();
}

function normalizarHora_(h) {
  if (!h) return '';
  if (h instanceof Date) return Utilities.formatDate(h, ZONA, 'HH:mm:ss');
  return String(h).trim();
}

function construirDateTime_(fechaNegocio, horaHHMMSS) {
  const base  = new Date(fechaNegocio);
  const parts = String(horaHHMMSS||'00:00:00').split(':').map(x => Number(x||0));
  base.setHours(parts[0]||0, parts[1]||0, parts[2]||0, 0);
  return base;
}

function formatDuration_(ms) {
  if (!ms || ms < 0) return '';
  const totalMin = Math.floor(ms / 60000);
  return `${Math.floor(totalMin/60)}h ${String(totalMin%60).padStart(2,'0')}m`;
}

function getLogoWebUrl_() {
  if (LOGO_URL_PUBLICO && LOGO_URL_PUBLICO.trim()) return LOGO_URL_PUBLICO.trim();
  return `https://drive.google.com/thumbnail?id=${LOGO_FILE_ID}&sz=w600`;
}

function emailsToString_(value) {
  if (!value) return '';
  if (Array.isArray(value)) return value.map(x => String(x||'').trim()).filter(Boolean).join(',');
  return String(value).trim();
}

function escapeHtml_(s) {
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function escapeJs_(s) {
  return String(s??'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")
    .replace(/\n/g,'\\n').replace(/\r/g,'');
}

function getHoraEntradaHoy_(fecha) {
  const dow = Number(Utilities.formatDate(fecha || new Date(), ZONA, 'u'));
  return (dow === 6 || dow === 7) ? HORA_ENTRADA_SD : HORA_ENTRADA_LV;
}

function esFindeSemana_(fecha) {
  const dow = Number(Utilities.formatDate(fecha || new Date(), ZONA, 'u'));
  return (dow === 6 || dow === 7);
}


/******************************************************************************
 *  AUTORIZACIÓN
 ******************************************************************************/
function TEST_AUTORIZAR_CORREO() {
  MailApp.getRemainingDailyQuota();
  DriveApp.getRootFolder().getName();
}


/******************************************************************************
 *  INFORMES AUTOMÁTICOS (simplificados — sin nómina)
 ******************************************************************************/
const REPORT_DAILY_HOUR   = 6;
const REPORT_WEEKLY_HOUR  = 6;
const REPORT_MONTHLY_HOUR = 6;

function SETUP_TRIGGERS_REPORTES() {
  ScriptApp.getProjectTriggers().forEach(t => {
    const h = t.getHandlerFunction();
    if (['RUN_REPORTE_DIARIO','RUN_REPORTE_SEMANAL','RUN_REPORTE_MENSUAL'].includes(h)) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('RUN_REPORTE_DIARIO').timeBased().everyDays(1).atHour(REPORT_DAILY_HOUR).create();
  ScriptApp.newTrigger('RUN_REPORTE_SEMANAL').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(REPORT_WEEKLY_HOUR).create();
  ScriptApp.newTrigger('RUN_REPORTE_MENSUAL').timeBased().onMonthDay(1).atHour(REPORT_MONTHLY_HOUR).create();
  Logger.log('✅ Triggers creados.');
}

function RUN_REPORTE_DIARIO() {
  const hoy  = getBusinessDate_(new Date());
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate()-1); ayer.setHours(0,0,0,0);
  enviarReportePuntualidad_('DIARIO', ayer, ayer);
}

function RUN_REPORTE_SEMANAL() {
  const hoy       = getBusinessDate_(new Date());
  const day       = Number(Utilities.formatDate(hoy, ZONA, 'u'));
  const lunes     = new Date(hoy); lunes.setDate(hoy.getDate()-(day-1));
  const lunPasada = new Date(lunes); lunPasada.setDate(lunes.getDate()-7);
  const domPasado = new Date(lunes); domPasado.setDate(lunes.getDate()-1);
  enviarReportePuntualidad_('SEMANAL', lunPasada, domPasado);
}

function RUN_REPORTE_MENSUAL() {
  const hoy            = getBusinessDate_(new Date());
  const firstThisMonth = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const firstPrevMonth = new Date(hoy.getFullYear(), hoy.getMonth()-1, 1);
  const lastPrevMonth  = new Date(firstThisMonth); lastPrevMonth.setDate(firstThisMonth.getDate()-1);
  enviarReportePuntualidad_('MENSUAL', firstPrevMonth, lastPrevMonth);
}

function enviarReportePuntualidad_(tipo, desdeDate, hastaDate) {
  const desdeTxt = Utilities.formatDate(desdeDate, ZONA, 'dd/MM/yyyy');
  const hastaTxt = Utilities.formatDate(hastaDate, ZONA, 'dd/MM/yyyy');
  const desde0   = new Date(desdeDate); desde0.setHours(0,0,0,0);
  const hasta0   = new Date(hastaDate); hasta0.setHours(23,59,59,999);

  const empleados = getEmpleadosList_().filter(e => e.estado === 'ACTIVO');
  const porId     = {};
  empleados.forEach(e => porId[e.id] = {
    id:e.id, nombre:e.nombre, dias:0, tempranos:0, tardanzas:0,
    minTardeTotal:0, minTempranoTotal:0, puntos:0, multaPagada:0, multaGanada:0
  });

  const hojaP = getOrCreateSheet_(SHEET_PUNTUALIDAD);
  if (hojaP.getLastRow() > 1) {
    hojaP.getDataRange().getValues().slice(1).forEach(r => {
      const id = String(r[0]||'').trim();
      const fechaTxt = String(r[2]||'').trim();
      const partes = fechaTxt.split('/');
      if (partes.length !== 3) return;
      const f = new Date(Number(partes[2]), Number(partes[1])-1, Number(partes[0]));
      if (f < desde0 || f > hasta0) return;
      if (!porId[id]) porId[id] = { id, nombre:String(r[1]||id), dias:0, tempranos:0, tardanzas:0,
                                    minTardeTotal:0, minTempranoTotal:0, puntos:0, multaPagada:0, multaGanada:0 };
      const e = porId[id];
      e.dias++;
      e.minTardeTotal    += Number(r[4]||0);
      e.minTempranoTotal += Number(r[5]||0);
      e.puntos           += Number(r[7]||0);
      e.multaPagada      += Number(r[8]||0);
      e.multaGanada      += Number(r[9]||0);
      if (Number(r[4]||0) > 0) e.tardanzas++;
      if (Number(r[5]||0) > 0) e.tempranos++;
    });
  }

  const filas = Object.values(porId).sort((a,b) => b.puntos - a.puntos);
  const baseUrl = ScriptApp.getService().getUrl();
  const adminUrl = `${baseUrl}?admin=1`;
  const asunto  = `🏆 REPORTE PUNTUALIDAD ${tipo} | ${desdeTxt}${desdeTxt===hastaTxt?'':`- ${hastaTxt}`}`;

  const C = { bg:'#0B0F14', card:'#111827', border:'#1F2937', text:'#F9FAFB', muted:'#9CA3AF',
              gold:'#C9A227', green:'#22C55E', red:'#EF4444' };

  const html = `<html><body style="margin:0;padding:0;background:${C.bg};font-family:Segoe UI,Roboto,Arial,sans-serif;color:${C.text};">
  <div style="max-width:880px;margin:0 auto;padding:18px 10px;">
    <div style="border:1px solid ${C.border};background:${C.card};border-radius:18px;overflow:hidden;box-shadow:0 10px 28px rgba(0,0,0,.35);">
      <div style="padding:14px 16px;border-bottom:1px solid ${C.border};display:flex;align-items:center;gap:12px;">
        <img src="cid:logo" alt="Logo" style="height:44px;border-radius:10px;">
        <div>
          <div style="color:${C.gold};font-weight:950;font-size:12px;">PUNTUALIDAD • REPORTE ${escapeHtml_(tipo)}</div>
          <div style="font-size:20px;font-weight:950;margin-top:4px;">${escapeHtml_(desdeTxt)}${desdeTxt===hastaTxt?'':` — ${escapeHtml_(hastaTxt)}`}</div>
        </div>
      </div>
      <div style="padding:14px 16px;">
        <div style="overflow:auto;border:1px solid rgba(255,255,255,.08);border-radius:16px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;min-width:680px;">
            <tr>
              <th align="left"  style="padding:10px;border-bottom:1px solid rgba(255,255,255,.08);color:${C.muted};font-size:12px">#</th>
              <th align="left"  style="padding:10px;border-bottom:1px solid rgba(255,255,255,.08);color:${C.muted};font-size:12px">Empleado</th>
              <th align="center"style="padding:10px;border-bottom:1px solid rgba(255,255,255,.08);color:${C.muted};font-size:12px">Días</th>
              <th align="center"style="padding:10px;border-bottom:1px solid rgba(255,255,255,.08);color:${C.muted};font-size:12px">⏰ Temp.</th>
              <th align="center"style="padding:10px;border-bottom:1px solid rgba(255,255,255,.08);color:${C.muted};font-size:12px">⚠️ Tarde</th>
              <th align="right" style="padding:10px;border-bottom:1px solid rgba(255,255,255,.08);color:${C.muted};font-size:12px">💸 Pagó</th>
              <th align="right" style="padding:10px;border-bottom:1px solid rgba(255,255,255,.08);color:${C.muted};font-size:12px">🏆 Ganó</th>
              <th align="right" style="padding:10px;border-bottom:1px solid rgba(255,255,255,.08);color:${C.muted};font-size:12px">Puntos</th>
            </tr>
            ${filas.map((r,i)=>`<tr>
              <td style="padding:10px;border-bottom:1px solid rgba(255,255,255,.06)">${i+1}</td>
              <td style="padding:10px;border-bottom:1px solid rgba(255,255,255,.06)">
                <div style="font-weight:900">${escapeHtml_(r.nombre)}</div>
                <div style="color:${C.muted};font-size:11px">${escapeHtml_(r.id)}</div>
              </td>
              <td align="center" style="padding:10px;border-bottom:1px solid rgba(255,255,255,.06);color:${C.muted}">${r.dias}</td>
              <td align="center" style="padding:10px;border-bottom:1px solid rgba(255,255,255,.06);color:${C.green};font-weight:900">${r.tempranos}</td>
              <td align="center" style="padding:10px;border-bottom:1px solid rgba(255,255,255,.06);color:${C.red};font-weight:900">${r.tardanzas}</td>
              <td align="right"  style="padding:10px;border-bottom:1px solid rgba(255,255,255,.06);color:${C.red};font-weight:700">$${r.multaPagada.toFixed(2)}</td>
              <td align="right"  style="padding:10px;border-bottom:1px solid rgba(255,255,255,.06);color:${C.green};font-weight:900">$${r.multaGanada.toFixed(2)}</td>
              <td align="right"  style="padding:10px;border-bottom:1px solid rgba(255,255,255,.06);color:${C.gold};font-weight:900;font-size:15px">${r.puntos}</td>
            </tr>`).join('')}
          </table>
        </div>
        <div style="margin-top:14px;padding:14px;border:1px solid rgba(201,162,39,.2);border-radius:14px;background:rgba(201,162,39,.05);text-align:center;">
          <a href="${adminUrl}" style="color:#FDE68A;font-weight:700;font-size:13px;">⚙️ Ver Panel Admin →</a>
        </div>
        <div style="margin-top:12px;color:${C.muted};font-size:12px;line-height:1.5;">
          <div><b style="color:${C.text};">Atentamente,</b> ${escapeHtml_(FIRMA)}</div>
          <div style="margin-top:6px;">Sistema de Asistencia • Reporte automático</div>
        </div>
      </div>
    </div>
  </div>
  </body></html>`;

  const mailOpts = {
    to: emailsToString_(EMAIL_DESTINO), cc: emailsToString_(EMAIL_CC),
    subject: asunto, htmlBody: html,
    body: `REPORTE PUNTUALIDAD ${tipo} (${desdeTxt}${desdeTxt===hastaTxt?'':`- ${hastaTxt}`})`
  };
  try { mailOpts.inlineImages = { logo: DriveApp.getFileById(LOGO_FILE_ID).getBlob().setName('logo.png') }; } catch(e) {}
  MailApp.sendEmail(mailOpts);
}
