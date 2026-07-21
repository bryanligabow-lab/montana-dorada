import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Advance, Attendance, NominaRow, PortalSession } from '@asis/shared';
import { applyBranding } from '../lib/theme';
import { money, thisMonth } from '../admin/ui';
import { getPortalToken, portalApi, PortalError, setPortalToken } from './api';

type Me = Omit<PortalSession, 'token'>;

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const ultimo = new Date(y, m, 0).getDate();
  const p = (n: number) => String(n).padStart(2, '0');
  return { from: `${month}-01`, to: `${month}-${p(ultimo)}` };
}

export function PortalApp() {
  const [token, setTok] = useState(getPortalToken());
  if (!token) return <PortalLogin onLogin={() => setTok(getPortalToken())} />;
  return (
    <PortalShell
      onLogout={() => {
        setPortalToken(null);
        setTok(null);
      }}
    />
  );
}

function PortalLogin({ onLogin }: { onLogin: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await portalApi<PortalSession>('/api/portal/login', {
        method: 'POST',
        body: { codigo: codigo.trim(), pin: pin.trim() },
      });
      setPortalToken(r.token);
      applyBranding(r.business.branding);
      onLogin();
    } catch (e2) {
      setErr(
        e2 instanceof PortalError && e2.code === 'negocio_suspendido'
          ? 'El negocio está suspendido. Contacta a tu administrador.'
          : 'Código o PIN incorrectos.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <div className="text-xl font-black mb-1">Mi portal</div>
        <p className="text-muted text-sm mb-5">Consulta tu asistencia, sueldo y anticipos. Entra con tu código y PIN.</p>
        <label className="block text-xs text-muted mb-1">Código</label>
        <input
          className="field w-full px-3 py-2.5 mb-3"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          autoCapitalize="characters"
          required
        />
        <label className="block text-xs text-muted mb-1">PIN (4 dígitos)</label>
        <input
          className="field w-full px-3 py-2.5 mb-4 tracking-widest text-center"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          pattern="\d{4}"
          placeholder="••••"
          required
        />
        {err && <div className="text-sm mb-3" style={{ color: 'var(--c-accent)' }}>{err}</div>}
        <button type="submit" className="btn-brand w-full py-3" disabled={busy || pin.length !== 4}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

function PortalShell({ onLogout }: { onLogout: () => void }) {
  const me = useQuery({
    queryKey: ['portal-me'],
    queryFn: () => portalApi<Me>('/api/portal/me', { auth: true }),
    retry: false,
  });
  const [month, setMonth] = useState(thisMonth());
  const [tab, setTab] = useState<'nomina' | 'asistencia' | 'anticipos'>('nomina');

  useEffect(() => {
    if (me.data) applyBranding(me.data.business.branding);
  }, [me.data]);

  if (me.isLoading) return <div className="min-h-screen flex items-center justify-center text-muted">Cargando…</div>;
  if (me.isError || !me.data) {
    onLogout();
    return null;
  }

  const TABS = [
    { key: 'nomina', label: 'Mi sueldo' },
    { key: 'asistencia', label: 'Mi asistencia' },
    { key: 'anticipos', label: 'Mis anticipos' },
  ] as const;

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 p-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="font-black text-lg" style={{ color: 'var(--c-primary)' }}>
            {me.data.business.nombre}
          </div>
          <div className="text-sm text-muted">
            Hola, {me.data.employee.nombre} · {me.data.employee.codigo}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="field px-3 py-2 text-sm"
          />
          <button onClick={onLogout} className="chip px-3 py-2 text-xs">
            Salir
          </button>
        </div>
      </header>

      <nav className="flex gap-1 p-3 border-b border-white/10 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 rounded-lg text-sm ${tab === t.key ? 'btn-brand' : 'text-ink hover:bg-white/5'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="p-4 max-w-2xl mx-auto">
        {tab === 'nomina' && <MiNomina month={month} />}
        {tab === 'asistencia' && <MiAsistencia month={month} />}
        {tab === 'anticipos' && <MisAnticipos month={month} />}
      </main>
    </div>
  );
}

function Fila({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5">
      <span className="text-muted text-sm">{label}</span>
      <span className="font-bold" style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  );
}

function MiNomina({ month }: { month: string }) {
  const { from, to } = monthRange(month);
  const q = useQuery({
    queryKey: ['portal-nomina', from, to],
    queryFn: () => portalApi<NominaRow>(`/api/portal/nomina?from=${from}&to=${to}`, { auth: true }),
  });

  if (q.isLoading) return <div className="text-muted text-sm">Cargando…</div>;
  if (!q.data) return <div className="text-muted text-sm">Sin datos.</div>;
  const r = q.data;

  return (
    <div className="card p-5">
      <div className="text-xs text-muted mb-3">Período {from} a {to}</div>
      <Fila label="Días trabajados" value={String(r.diasTrabajados)} />
      <Fila label="Horas extra" value={`${r.horasExtra}h`} />
      <Fila label="Sueldo base" value={money(r.sueldoBase)} />
      <Fila label="Pago hora extra" value={money(r.pagoHoraExtra)} color="var(--c-primary)" />
      {r.multaGanada > 0 && <Fila label="Bono puntualidad" value={`+${money(r.multaGanada)}`} color="var(--c-primary)" />}
      {r.multaPagada > 0 && <Fila label="Multas por atraso" value={`-${money(r.multaPagada)}`} color="var(--c-accent)" />}
      {r.anticipos > 0 && <Fila label="Anticipos recibidos" value={`-${money(r.anticipos)}`} color="var(--c-accent)" />}
      <div className="flex items-center justify-between pt-4 mt-2">
        <span className="font-black">Total a recibir</span>
        <span className="text-2xl font-black" style={{ color: 'var(--c-primary)' }}>
          {money(r.totalARecibir)}
        </span>
      </div>
    </div>
  );
}

function MiAsistencia({ month }: { month: string }) {
  const q = useQuery({
    queryKey: ['portal-attendance', month],
    queryFn: () => portalApi<Attendance[]>(`/api/portal/attendance?month=${month}`, { auth: true }),
  });

  if (q.isLoading) return <div className="text-muted text-sm">Cargando…</div>;
  const rows = q.data ?? [];
  if (rows.length === 0) return <div className="card p-6 text-center text-muted">Sin marcaciones este mes.</div>;

  return (
    <div className="card p-3 overflow-x-auto">
      <table className="w-full text-sm min-w-[420px]">
        <thead>
          <tr className="text-muted text-left text-xs uppercase tracking-wide">
            <th className="p-2">Fecha</th>
            <th className="p-2">Entrada</th>
            <th className="p-2">Salida</th>
            <th className="p-2">Estado</th>
            <th className="p-2">Horas</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-white/5">
              <td className="p-2 text-muted">{r.fecha}</td>
              <td className="p-2">{r.horaEntrada ?? '–'}</td>
              <td className="p-2">{r.horaSalida ?? '–'}</td>
              <td
                className="p-2 font-bold"
                style={{
                  color:
                    r.estado === 'TARDE'
                      ? 'var(--c-accent)'
                      : r.estado === 'TEMPRANO'
                        ? 'var(--c-primary)'
                        : undefined,
                }}
              >
                {r.estado === 'TARDE' && r.minTarde > 0 ? `Tarde ${r.minTarde}min` : (r.estado ?? '–')}
              </td>
              <td className="p-2">{r.horasTrabajadas ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MisAnticipos({ month }: { month: string }) {
  const q = useQuery({
    queryKey: ['portal-advances', month],
    queryFn: () => portalApi<Advance[]>(`/api/portal/advances?month=${month}`, { auth: true }),
  });

  if (q.isLoading) return <div className="text-muted text-sm">Cargando…</div>;
  const rows = q.data ?? [];
  const total = rows.reduce((s, a) => s + a.monto, 0);
  if (rows.length === 0) return <div className="card p-6 text-center text-muted">Sin anticipos este mes.</div>;

  return (
    <div className="card p-3">
      <ul className="divide-y divide-white/5">
        {rows.map((a) => (
          <li key={a.id} className="flex items-center justify-between py-3">
            <div>
              <div className="font-bold">{money(a.monto)}</div>
              <div className="text-xs text-muted">
                {a.fecha}
                {a.nota ? ` · ${a.nota}` : ''}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between pt-3 mt-1 border-t border-white/10">
        <span className="font-bold text-muted text-sm">Total del mes</span>
        <span className="font-black" style={{ color: 'var(--c-accent)' }}>{money(total)}</span>
      </div>
    </div>
  );
}
