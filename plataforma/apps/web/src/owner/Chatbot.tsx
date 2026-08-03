import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Business, BotNumberCreateInput, BotNumberRow, ChatbotEstado } from '@asis/shared';
import { api } from '../lib/api';

/**
 * Panel Dueño → Chatbot: conectar el número de WhatsApp del bot (QR) y administrar
 * qué números (dueños) pueden hablarle y de qué negocio.
 */

function useEstado(polling: boolean) {
  return useQuery({
    queryKey: ['chatbot-estado'],
    queryFn: () => api<ChatbotEstado>('/api/admin/chatbot/estado', { auth: true }),
    refetchInterval: polling ? 4000 : 30000,
  });
}

const ESTADOS: Record<string, { txt: string; color: string }> = {
  open: { txt: 'Conectado', color: '#43A047' },
  connecting: { txt: 'Esperando escaneo…', color: '#F59E0B' },
  close: { txt: 'Desconectado', color: '#E53935' },
  no_creada: { txt: 'Sin crear (pulsa Conectar)', color: '#9ca3af' },
  desconocido: { txt: 'Sin conexión con Evolution', color: '#9ca3af' },
};

export function Chatbot() {
  const qc = useQueryClient();
  const [qr, setQr] = useState<string | null>(null);
  const estado = useEstado(!!qr);
  const st = estado.data;
  const badge = ESTADOS[st?.estado ?? 'desconocido'] ?? ESTADOS.desconocido!;

  const conectar = useMutation({
    mutationFn: () => api<{ estado: string; qr: string | null; pairingCode: string | null }>('/api/admin/chatbot/conectar', { method: 'POST', auth: true }),
    onSuccess: (r) => {
      setQr(r.qr);
      qc.invalidateQueries({ queryKey: ['chatbot-estado'] });
    },
  });
  const desconectar = useMutation({
    mutationFn: () => api('/api/admin/chatbot/desconectar', { method: 'POST', auth: true }),
    onSuccess: () => {
      setQr(null);
      qc.invalidateQueries({ queryKey: ['chatbot-estado'] });
    },
  });

  // Cuando conecta, se cierra el QR solo.
  if (qr && st?.estado === 'open') setQr(null);

  return (
    <div className="space-y-4 max-w-3xl">
      <h2 className="text-lg font-black tracking-wide">🤖 Chatbot de WhatsApp</h2>
      <p className="text-sm text-muted -mt-2">
        Los dueños registran <b>anticipos y multas</b> (y los consultan o deshacen) escribiéndole al bot por WhatsApp.
        Solo responde a los números autorizados de abajo.
      </p>

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Número del chatbot</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: badge.color }} />
              <span className="font-bold">{badge.txt}</span>
              {st?.numero && st.estado === 'open' && <span className="text-muted text-sm">· +{st.numero}</span>}
            </div>
            <div className="text-xs text-muted mt-1">
              Instancia: {st?.instancia || '—'} · IA: {st?.iaConfigurada ? `activa (${st.modelo})` : '❌ falta ANTHROPIC_API_KEY en el servidor'}
            </div>
          </div>
          <div className="flex gap-2">
            {st?.estado !== 'open' && (
              <button className="btn-brand px-4 py-2" onClick={() => conectar.mutate()} disabled={conectar.isPending}>
                {conectar.isPending ? 'Generando QR…' : 'Conectar (mostrar QR)'}
              </button>
            )}
            {st?.estado === 'open' && (
              <button
                className="chip px-4 py-2"
                onClick={() => {
                  if (confirm('¿Cerrar la sesión de WhatsApp del bot? Habrá que escanear el QR de nuevo.')) desconectar.mutate();
                }}
              >
                Cerrar sesión
              </button>
            )}
          </div>
        </div>

        {qr && st?.estado !== 'open' && (
          <div className="text-center py-3">
            <img src={qr} alt="QR de WhatsApp" className="mx-auto w-56 h-56 rounded-xl bg-white p-2" />
            <p className="text-xs text-muted mt-2">
              En el teléfono del bot: WhatsApp → Ajustes → <b>Dispositivos vinculados</b> → Vincular dispositivo → escanea este QR.
            </p>
            <button className="chip px-3 py-1.5 text-xs mt-2" onClick={() => conectar.mutate()} disabled={conectar.isPending}>
              El QR venció, generar otro
            </button>
          </div>
        )}
      </div>

      <NumerosAutorizados />
    </div>
  );
}

function NumerosAutorizados() {
  const qc = useQueryClient();
  const numeros = useQuery({
    queryKey: ['chatbot-numeros'],
    queryFn: () => api<BotNumberRow[]>('/api/admin/chatbot/numeros', { auth: true }),
  });
  const negocios = useQuery({
    queryKey: ['businesses'],
    queryFn: () => api<Business[]>('/api/admin/businesses', { auth: true }),
  });

  const [f, setF] = useState({ businessId: '', numero: '', nombre: '' });
  const [err, setErr] = useState('');

  const crear = useMutation({
    mutationFn: (body: BotNumberCreateInput) => api('/api/admin/chatbot/numeros', { method: 'POST', body, auth: true }),
    onSuccess: () => {
      setF({ businessId: f.businessId, numero: '', nombre: '' });
      setErr('');
      qc.invalidateQueries({ queryKey: ['chatbot-numeros'] });
    },
    onError: () => setErr('No se pudo enlazar (¿número repetido en ese negocio?).'),
  });
  const borrar = useMutation({
    mutationFn: (id: string) => api(`/api/admin/chatbot/numeros/${id}`, { method: 'DELETE', auth: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chatbot-numeros'] }),
  });

  const input = 'field w-full px-3 py-2.5 text-sm';

  return (
    <div className="card p-5 space-y-3">
      <div className="text-xs uppercase tracking-wide text-muted">Números autorizados</div>
      <p className="text-xs text-muted -mt-1">
        El bot solo responde a estos números y cada uno accede <b>únicamente</b> a su negocio. Un mismo número puede
        enlazarse a varios negocios (podrá cambiar entre ellos en el chat).
      </p>

      <form
        className="grid grid-cols-1 md:grid-cols-4 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!f.businessId || !f.numero) return;
          crear.mutate({ businessId: f.businessId, numero: f.numero, nombre: f.nombre || undefined });
        }}
      >
        <select className={input} value={f.businessId} onChange={(e) => setF({ ...f, businessId: e.target.value })} required>
          <option value="">Negocio…</option>
          {(negocios.data ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.nombre}
            </option>
          ))}
        </select>
        <input
          className={input}
          placeholder="Número WhatsApp (0997121766)"
          value={f.numero}
          onChange={(e) => setF({ ...f, numero: e.target.value })}
          required
        />
        <input className={input} placeholder="Nombre (ej. Fernanda — dueña)" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        <button type="submit" className="btn-brand px-4 py-2" disabled={crear.isPending}>
          {crear.isPending ? 'Enlazando…' : '+ Enlazar'}
        </button>
      </form>
      {err && <div className="text-sm" style={{ color: 'var(--c-accent)' }}>{err}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-muted text-left text-xs uppercase tracking-wide">
              <th className="p-2">Negocio</th>
              <th className="p-2">Número</th>
              <th className="p-2">Nombre</th>
              <th className="p-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(numeros.data ?? []).map((n) => (
              <tr key={n.id} className="border-t border-white/5">
                <td className="p-2">{n.negocio}</td>
                <td className="p-2 font-mono">{n.numero}</td>
                <td className="p-2">{n.nombre || <span className="text-muted">—</span>}</td>
                <td className="p-2 text-right">
                  <button
                    className="chip px-2 py-1 text-xs"
                    onClick={() => {
                      if (confirm(`¿Quitar el número ${n.numero} de ${n.negocio}? Dejará de poder usar el bot para ese negocio.`)) borrar.mutate(n.id);
                    }}
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
            {numeros.data?.length === 0 && (
              <tr>
                <td colSpan={4} className="p-5 text-center text-muted">
                  Aún no hay números autorizados. Enlaza el primero arriba. ☝️
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
