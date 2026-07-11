import { useState, type ReactNode } from 'react';
import type { PlatformUser, UserCreateInput } from '@asis/shared';
import { useBusinesses, useCreateUser, useResetPassword, useUpdateUser, useUsers } from '../admin/queries';
import { Card, Spinner } from '../admin/ui';
import { ApiError } from '../lib/api';

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,.6)' }}
      onClick={onClose}
    >
      <div className="card w-full max-w-md p-5 my-8" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Usuarios() {
  const list = useUsers();
  const businesses = useBusinesses();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PlatformUser | null>(null);
  const [resetFor, setResetFor] = useState<{ id: string; nombre: string; isOwner: boolean } | null>(null);

  const nombreNegocio = (id: string) => businesses.data?.find((b) => b.id === id)?.nombre ?? '?';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-black tracking-wide">Usuarios</h2>
          <p className="text-muted text-sm">Las credenciales que le das a cada negocio/cliente para entrar a su panel.</p>
        </div>
        <button className="btn-brand px-4 py-2" onClick={() => setCreating(true)}>
          + Nuevo usuario
        </button>
      </div>

      <Card>
        {list.isLoading || businesses.isLoading ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-muted text-left text-xs uppercase tracking-wide">
                  <th className="p-2">Nombre</th>
                  <th className="p-2">Correo</th>
                  <th className="p-2">Negocios</th>
                  <th className="p-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {(list.data ?? []).map((u) => (
                  <tr key={u.id} className="border-t border-white/5">
                    <td className="p-2 font-bold">
                      {u.nombre}
                      {u.rol === 'OWNER' && <span className="chip px-2 py-0.5 text-xs ml-2">Dueño</span>}
                    </td>
                    <td className="p-2 font-mono text-xs">{u.email}</td>
                    <td className="p-2 text-xs text-muted">
                      {u.rol === 'OWNER' ? 'Todos' : u.businessIds.map(nombreNegocio).join(', ') || '—'}
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <button className="chip px-3 py-1 text-xs mr-1" onClick={() => setEditing(u)}>
                        Editar
                      </button>
                      <button
                        className="chip px-3 py-1 text-xs"
                        onClick={() => setResetFor({ id: u.id, nombre: u.nombre, isOwner: u.rol === 'OWNER' })}
                      >
                        Restablecer contraseña
                      </button>
                    </td>
                  </tr>
                ))}
                {list.data?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted">
                      Aún no hay usuarios. Crea el primero.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && <CrearUsuario onClose={() => setCreating(false)} />}
      {editing && <EditarUsuario user={editing} onClose={() => setEditing(null)} />}
      {resetFor && <ResetPassword user={resetFor} onClose={() => setResetFor(null)} />}
    </div>
  );
}

function CrearUsuario({ onClose }: { onClose: () => void }) {
  const businesses = useBusinesses();
  const create = useCreateUser();
  const [err, setErr] = useState('');
  const [creado, setCreado] = useState<{ email: string; password: string } | null>(null);
  const [f, setF] = useState({ nombre: '', email: '', password: '', businessIds: [] as string[] });
  const input = 'field w-full px-3 py-2.5 text-sm';

  const toggleBiz = (id: string) =>
    setF((p) => ({
      ...p,
      businessIds: p.businessIds.includes(id) ? p.businessIds.filter((x) => x !== id) : [...p.businessIds, id],
    }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const data: UserCreateInput = {
      nombre: f.nombre,
      email: f.email,
      password: f.password,
      businessIds: f.businessIds,
    };
    try {
      await create.mutateAsync(data);
      setCreado({ email: f.email, password: f.password });
    } catch (e2) {
      setErr(
        e2 instanceof ApiError && e2.code === 'correo_existe'
          ? 'Ese correo ya tiene una cuenta.'
          : 'No se pudo crear (revisa los datos).',
      );
    }
  }

  const panelUrl = `${window.location.origin}/admin`;

  if (creado) {
    return (
      <Overlay onClose={onClose}>
        <div className="space-y-3">
          <div className="font-black text-lg">✓ Usuario creado</div>
          <p className="text-sm text-muted">Copia esto y pásaselo a tu cliente:</p>
          <div className="card p-3 space-y-1 text-sm font-mono" style={{ background: 'rgba(255,255,255,.03)' }}>
            <div>🔗 {panelUrl}</div>
            <div>👤 {creado.email}</div>
            <div>🔑 {creado.password}</div>
          </div>
          <button type="button" className="btn-brand px-4 py-2 w-full" onClick={onClose}>
            Listo
          </button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="font-black text-lg">Nuevo usuario</div>
        <label className="block">
          <span className="block text-xs text-muted mb-1">Nombre</span>
          <input className={input} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required />
        </label>
        <label className="block">
          <span className="block text-xs text-muted mb-1">Correo</span>
          <input className={input} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        </label>
        <label className="block">
          <span className="block text-xs text-muted mb-1">Contraseña inicial</span>
          <input className={input} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} minLength={6} required />
        </label>
        <div className="space-y-1">
          <span className="block text-xs text-muted">¿A qué negocio(s) entra?</span>
          {(businesses.data ?? []).map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.businessIds.includes(b.id)} onChange={() => toggleBiz(b.id)} />
              {b.nombre}
            </label>
          ))}
        </div>
        {err && <div className="text-sm" style={{ color: 'var(--c-accent)' }}>{err}</div>}
        <div className="flex gap-2 pt-1">
          <button type="submit" className="btn-brand px-4 py-2 flex-1" disabled={create.isPending || f.businessIds.length === 0}>
            {create.isPending ? 'Creando…' : 'Crear usuario'}
          </button>
          <button type="button" className="chip px-4 py-2 flex-1" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </Overlay>
  );
}

function EditarUsuario({ user, onClose }: { user: PlatformUser; onClose: () => void }) {
  const isOwner = user.rol === 'OWNER';
  const businesses = useBusinesses();
  const update = useUpdateUser();
  const [err, setErr] = useState('');
  const [f, setF] = useState({ nombre: user.nombre, businessIds: user.businessIds });
  const input = 'field w-full px-3 py-2.5 text-sm';

  const toggleBiz = (id: string) =>
    setF((p) => ({
      ...p,
      businessIds: p.businessIds.includes(id) ? p.businessIds.filter((x) => x !== id) : [...p.businessIds, id],
    }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await update.mutateAsync({
        id: user.id,
        data: isOwner ? { nombre: f.nombre } : { nombre: f.nombre, businessIds: f.businessIds },
      });
      onClose();
    } catch {
      setErr('No se pudo guardar (elige al menos un negocio).');
    }
  }

  return (
    <Overlay onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="font-black text-lg">Editar {isOwner ? 'mi cuenta' : 'usuario'}</div>
        <label className="block">
          <span className="block text-xs text-muted mb-1">Nombre</span>
          <input className={input} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required />
        </label>
        <label className="block">
          <span className="block text-xs text-muted mb-1">Correo (no se puede cambiar)</span>
          <input className={input} value={user.email} disabled style={{ opacity: 0.6 }} />
        </label>
        {!isOwner && (
          <div className="space-y-1">
            <span className="block text-xs text-muted">¿A qué negocio(s) entra?</span>
            {(businesses.data ?? []).map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.businessIds.includes(b.id)} onChange={() => toggleBiz(b.id)} />
                {b.nombre}
              </label>
            ))}
          </div>
        )}
        {err && <div className="text-sm" style={{ color: 'var(--c-accent)' }}>{err}</div>}
        <div className="flex gap-2 pt-1">
          <button type="submit" className="btn-brand px-4 py-2 flex-1" disabled={update.isPending || (!isOwner && f.businessIds.length === 0)}>
            {update.isPending ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" className="chip px-4 py-2 flex-1" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </Overlay>
  );
}

function ResetPassword({
  user,
  onClose,
}: {
  user: { id: string; nombre: string; isOwner: boolean };
  onClose: () => void;
}) {
  const reset = useResetPassword();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const input = 'field w-full px-3 py-2.5 text-sm';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await reset.mutateAsync({ id: user.id, password });
    setDone(true);
  }

  if (done) {
    return (
      <Overlay onClose={onClose}>
        <div className="space-y-3">
          <div className="font-black text-lg">✓ Contraseña actualizada</div>
          <div className="card p-3 text-sm font-mono" style={{ background: 'rgba(255,255,255,.03)' }}>
            🔑 {password}
          </div>
          <button type="button" className="btn-brand px-4 py-2 w-full" onClick={onClose}>
            Listo
          </button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="font-black text-lg">
          {user.isOwner ? 'Cambiar mi contraseña' : `Restablecer contraseña de ${user.nombre}`}
        </div>
        <label className="block">
          <span className="block text-xs text-muted mb-1">Contraseña nueva</span>
          <input className={input} value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required autoFocus />
        </label>
        <div className="flex gap-2 pt-1">
          <button type="submit" className="btn-brand px-4 py-2 flex-1" disabled={reset.isPending}>
            {reset.isPending ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" className="chip px-4 py-2 flex-1" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </Overlay>
  );
}
