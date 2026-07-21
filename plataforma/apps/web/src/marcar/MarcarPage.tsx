import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ClockAction, ClockContext, ClockResult } from '@asis/shared';
import { MEDAL_LEVELS } from '@asis/shared';
import { api, ApiError } from '../lib/api';
import { applyBranding } from '../lib/theme';

type Phase = 'loading' | 'invalid' | 'ready' | 'result';

const ACTION_LABELS: Record<ClockAction, string> = {
  entrada: '✅ Registrar entrada',
  almuerzo_salida: '🍽️ Salir a almuerzo',
  almuerzo_regreso: '↩️ Regresar de almuerzo',
  salida: '🔴 Marcar salida',
};

interface Gps {
  status: 'idle' | 'checking' | 'ok' | 'fail';
  lat?: number;
  lng?: number;
  dist?: number;
  msg: string;
}

function haversine(la1: number, ln1: number, la2: number, ln2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLa = toRad(la2 - la1);
  const dLn = toRad(ln2 - ln1);
  const a =
    Math.sin(dLa / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLn / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function MarcarPage() {
  const { token = '' } = useParams();
  const [phase, setPhase] = useState<Phase>('loading');
  const [ctx, setCtx] = useState<ClockContext | null>(null);
  const [gps, setGps] = useState<Gps>({ status: 'idle', msg: '' });
  const [result, setResult] = useState<ClockResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    api<ClockContext>(`/api/clock/context?token=${encodeURIComponent(token)}`)
      .then((c) => {
        if (!alive) return;
        setCtx(c);
        applyBranding(c.business.branding);
        setPhase('ready');
        if (c.business.gpsRequerido) requestGps(c);
        else setGps({ status: 'ok', msg: 'Marcación sin GPS' });
      })
      .catch(() => alive && setPhase('invalid'));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function requestGps(c: ClockContext) {
    if (!navigator.geolocation) {
      setGps({ status: 'fail', msg: 'Tu dispositivo no tiene GPS.' });
      return;
    }
    setGps({ status: 'checking', msg: 'Verificando ubicación…' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        if (c.business.lat != null && c.business.lng != null) {
          const dist = Math.round(haversine(c.business.lat, c.business.lng, lat, lng));
          if (dist <= c.business.radioMetros)
            setGps({ status: 'ok', lat, lng, dist, msg: `Dentro del negocio (${dist} m)` });
          else
            setGps({
              status: 'fail',
              lat,
              lng,
              dist,
              msg: `Estás a ${dist} m (máximo ${c.business.radioMetros} m)`,
            });
        } else {
          setGps({ status: 'ok', lat, lng, msg: 'Ubicación obtenida' });
        }
      },
      (e) =>
        setGps({
          status: 'fail',
          msg: e.code === 1 ? 'Permiso de ubicación denegado.' : 'No se pudo obtener la ubicación.',
        }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  async function marcar(action: ClockAction) {
    if (!ctx) return;
    setBusy(true);
    setErr('');
    try {
      const r = await api<ClockResult>('/api/clock', {
        method: 'POST',
        body: { token, lat: gps.lat, lng: gps.lng, action },
      });
      setResult(r);
      setPhase('result');
    } catch (e) {
      setErr(e instanceof ApiError ? e.code : 'error_de_red');
    } finally {
      setBusy(false);
    }
  }

  async function elegirMotivo(motivo: string) {
    setBusy(true);
    try {
      const r = await api<ClockResult>('/api/clock/motivo', { method: 'POST', body: { token, motivo } });
      setResult(r);
    } catch (e) {
      setErr(e instanceof ApiError ? e.code : 'error_de_red');
    } finally {
      setBusy(false);
    }
  }

  const gpsOk = !ctx?.business.gpsRequerido || gps.status === 'ok';

  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      <div className="card w-full max-w-sm overflow-hidden">
        {phase === 'loading' && <div className="p-10 text-center text-muted">Cargando…</div>}

        {phase === 'invalid' && (
          <div className="p-10 text-center">
            <div className="text-5xl mb-3">❌</div>
            <div className="text-xl font-extrabold">QR no válido</div>
            <p className="text-muted mt-2 text-sm">Vuelve a escanear tu código de asistencia.</p>
          </div>
        )}

        {phase === 'ready' && ctx && (
          <div>
            <div
              className="p-5 text-center"
              style={{ borderBottom: '1px solid rgba(255,255,255,.08)' }}
            >
              {ctx.business.branding.logoUrl && (
                <img src={ctx.business.branding.logoUrl} alt="" className="h-14 mx-auto mb-2 object-contain" />
              )}
              <div className="text-xs font-extrabold tracking-wide" style={{ color: 'var(--c-primary)' }}>
                {ctx.business.nombre.toUpperCase()}
              </div>
              <div className="text-2xl font-black mt-1">{ctx.employee.nombre}</div>
              <div className="inline-block mt-2 px-3 py-0.5 rounded-full text-xs text-muted"
                style={{ background: 'rgba(255,255,255,.06)' }}>
                {ctx.employee.codigo} · entrada {ctx.business.horaLimiteHoy.slice(0, 5)}
              </div>
            </div>

            <div className="p-5">
              {ctx.business.gpsRequerido && (
                <div
                  className="rounded-2xl p-4 text-center mb-4"
                  style={{
                    background:
                      gps.status === 'ok'
                        ? 'rgba(67,160,71,.12)'
                        : gps.status === 'fail'
                          ? 'rgba(229,57,53,.10)'
                          : 'rgba(255,255,255,.04)',
                    border: '1px solid rgba(255,255,255,.08)',
                  }}
                >
                  <div className="text-2xl mb-1">📍</div>
                  <div className="text-sm font-bold">{gps.msg || 'Ubicación'}</div>
                  {gps.status === 'fail' && (
                    <button
                      className="mt-2 text-xs underline text-muted"
                      onClick={() => requestGps(ctx)}
                    >
                      Reintentar
                    </button>
                  )}
                </div>
              )}

              {ctx.suspendido ? (
                <div className="text-center py-4">
                  <div className="text-4xl mb-2">⏸️</div>
                  <div className="font-bold">Servicio suspendido</div>
                  <div className="text-muted text-sm mt-1">Contacta al administrador.</div>
                </div>
              ) : ctx.acciones.length === 0 ? (
                <div className="text-center text-muted py-3">Ya completaste tu jornada de hoy. ✅</div>
              ) : (
                <div className="space-y-2">
                  {ctx.acciones.map((a, i) => (
                    <button
                      key={a}
                      className={`w-full py-4 text-base ${i === 0 ? 'btn-brand' : 'chip'}`}
                      disabled={!gpsOk || busy}
                      onClick={() => marcar(a)}
                    >
                      {busy ? 'Registrando…' : ACTION_LABELS[a]}
                    </button>
                  ))}
                </div>
              )}
              {err && <div className="text-center text-sm mt-3" style={{ color: 'var(--c-accent)' }}>{traducirError(err)}</div>}
            </div>
          </div>
        )}

        {phase === 'result' && result && (
          <ResultView result={result} busy={busy} onMotivo={elegirMotivo} />
        )}
      </div>
    </div>
  );
}

function traducirError(code: string): string {
  if (code === 'qr_invalido') return 'QR no válido.';
  if (code === 'datos_invalidos') return 'No se pudo procesar la ubicación.';
  return 'Hubo un problema. Intenta de nuevo.';
}

function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="flex justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
      <span className="text-xs uppercase tracking-wide text-muted">{k}</span>
      <span className="font-black text-sm" style={color ? { color } : undefined}>
        {v}
      </span>
    </div>
  );
}

function ResultView({
  result,
  busy,
  onMotivo,
}: {
  result: ClockResult;
  busy: boolean;
  onMotivo: (m: string) => void;
}) {
  if (result.kind === 'tardanza_motivo') {
    return (
      <div className="p-5">
        <div className="text-center mb-4">
          <div className="text-3xl mb-1">⚠️</div>
          <div className="text-lg font-black">Llegaste tarde</div>
          <div className="text-muted text-sm">
            {result.minTarde} min · multa ${result.multa.toFixed(2)}
          </div>
        </div>
        <div className="text-sm text-muted mb-2">Selecciona el motivo para completar tu entrada:</div>
        <div className="grid grid-cols-2 gap-2">
          {result.motivos.map((m) => (
            <button key={m} className="chip px-3 py-3 text-sm" disabled={busy} onClick={() => onMotivo(m)}>
              {m}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (result.kind === 'entrada') {
    const medal = result.medal;
    return (
      <div className="p-5 text-center">
        {medal ? (
          <div className="rounded-2xl p-5 mb-4" style={{ background: medal.bg, border: `2px solid ${medal.color}` }}>
            <div className="text-5xl">{medal.emoji}</div>
            <div className="text-xl font-black mt-1" style={{ color: medal.color }}>
              ¡Medalla {medal.nombre}!
            </div>
            <div className="text-sm text-muted mt-1">
              Llegaste {result.minTemprano} min antes · +{medal.puntos} pts
            </div>
          </div>
        ) : (
          <div className="rounded-2xl p-5 mb-4" style={{ background: 'rgba(67,160,71,.10)', border: '1px solid rgba(67,160,71,.25)' }}>
            <div className="text-4xl">{result.estado === 'TARDE' ? '✅' : '⏰'}</div>
            <div className="text-lg font-black mt-1" style={{ color: 'var(--c-primary)' }}>
              Entrada registrada
            </div>
          </div>
        )}
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,.08)' }}>
          <Row k="Hora" v={result.horaEntrada} color="var(--c-primary)" />
          <Row k="Estado" v={result.estado} />
        </div>
      </div>
    );
  }

  if (result.kind === 'salida') {
    return (
      <div className="p-5 text-center">
        <div className="rounded-2xl p-5 mb-4" style={{ background: 'rgba(67,160,71,.10)', border: '1px solid rgba(67,160,71,.25)' }}>
          <div className="text-4xl">✅</div>
          <div className="text-lg font-black mt-1" style={{ color: 'var(--c-primary)' }}>
            Salida registrada
          </div>
        </div>
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,.08)' }}>
          <Row k="Entrada" v={result.horaEntrada} />
          <Row k="Salida" v={result.horaSalida} color="var(--c-accent)" />
          {result.horasTrabajadas && <Row k="Horas" v={result.horasTrabajadas} />}
        </div>
      </div>
    );
  }

  if (result.kind === 'almuerzo_salida' || result.kind === 'almuerzo_regreso') {
    const esSalida = result.kind === 'almuerzo_salida';
    return (
      <div className="p-5 text-center">
        <div
          className="rounded-2xl p-6 mb-2"
          style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)' }}
        >
          <div className="text-5xl mb-1">{esSalida ? '🍽️' : '↩️'}</div>
          <div className="text-lg font-black">
            {esSalida ? 'Saliste a almuerzo' : 'Regresaste del almuerzo'}
          </div>
          <div className="text-sm mt-1" style={{ color: 'var(--c-primary)' }}>
            {result.hora}
          </div>
        </div>
      </div>
    );
  }

  const simple: Record<string, { icon: string; title: string; text: string }> = {
    completo: { icon: '✅', title: 'Registro completo', text: 'Ya marcaste entrada y salida hoy.' },
    espera: {
      icon: '⏳',
      title: 'Aún no',
      text: result.kind === 'espera' ? `La salida se habilita en ${result.minutosRestantes} min.` : '',
    },
    fuera_de_rango: {
      icon: '📍',
      title: 'Fuera del rango',
      text:
        result.kind === 'fuera_de_rango'
          ? `Estás a ${result.distM} m (máximo ${result.radioM} m).`
          : '',
    },
    duplicado: { icon: 'ℹ️', title: 'Espera un momento', text: 'Escaneo reciente detectado.' },
    suspendido: { icon: '⏸️', title: 'Servicio suspendido', text: 'Contacta al administrador.' },
  };
  const s = simple[result.kind] ?? { icon: 'ℹ️', title: '', text: '' };
  return (
    <div className="p-10 text-center">
      <div className="text-5xl mb-3">{s.icon}</div>
      <div className="text-xl font-black">{s.title}</div>
      <p className="text-muted mt-2 text-sm">{s.text}</p>
    </div>
  );
}
