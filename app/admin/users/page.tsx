"use client";

import { useEffect, useState } from "react";
import {
  AdminUser,
  ApiError,
  adminCreateUser,
  adminDeleteUser,
  adminGetUsers,
  adminUpdateUser,
} from "@/lib/api";
import { getToken, getUserFromToken } from "@/lib/session";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [myId, setMyId] = useState<number | null>(null);

  const [fullName, setFullName] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [creating, setCreating] = useState(false);

  function errMsg(err: unknown) {
    if (err instanceof ApiError) return err.message;
    return "No se pudo conectar con el servidor";
  }

  async function load() {
    const token = getToken();
    if (!token) return;
    try {
      setUsers(await adminGetUsers(token));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const me = getUserFromToken() as any;
    if (me?.sub != null) setMyId(Number(me.sub));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setCreating(true);
    setError(null);
    try {
      await adminCreateUser(token, {
        full_name: fullName,
        login_email: loginEmail,
        password,
        is_global_admin: makeAdmin,
      });
      setFullName("");
      setLoginEmail("");
      setPassword("");
      setMakeAdmin(false);
      await load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setCreating(false);
    }
  }

  async function update(u: AdminUser, data: { status?: string; is_global_admin?: boolean }) {
    const token = getToken();
    if (!token) return;
    setBusyId(u.id);
    setError(null);
    try {
      await adminUpdateUser(token, u.id, data);
      await load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(u: AdminUser) {
    if (!window.confirm(`¿Eliminar definitivamente a ${u.full_name}? No se puede deshacer.`)) return;
    const token = getToken();
    if (!token) return;
    setBusyId(u.id);
    setError(null);
    try {
      await adminDeleteUser(token, u.id);
      await load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusyId(null);
    }
  }

  const btn =
    "px-3 py-1.5 text-xs border border-line text-paper hover:border-paper transition-colors disabled:opacity-40";

  return (
    <div className="space-y-10">
      {error && <p className="text-sm text-red-400 border border-red-400/40 px-3 py-2">{error}</p>}

      <form onSubmit={handleCreate} className="space-y-3 max-w-md">
        <h2 className="font-display text-xl text-paper">Crear usuario</h2>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Nombre completo"
          required
          className="w-full bg-transparent border border-line px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-paper"
        />
        <input
          value={loginEmail}
          onChange={(e) => setLoginEmail(e.target.value)}
          type="email"
          placeholder="Email de acceso"
          required
          className="w-full bg-transparent border border-line px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-paper"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Contraseña"
          required
          className="w-full bg-transparent border border-line px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-paper"
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={makeAdmin} onChange={(e) => setMakeAdmin(e.target.checked)} />
          Administrador
        </label>
        <button
          type="submit"
          disabled={creating}
          className="px-4 py-2 text-sm border border-paper text-paper hover:bg-paper hover:text-ink transition-colors disabled:opacity-50"
        >
          {creating ? "Creando…" : "Crear usuario"}
        </button>
      </form>

      <section>
        <h2 className="font-display text-xl text-paper mb-4">Usuarios</h2>
        {loading && <p className="text-sm text-muted">Cargando…</p>}
        <ul className="divide-y divide-line border-y border-line">
          {users.map((u) => {
            const disabled = u.status === "disabled";
            const isMe = u.id === myId;
            const busy = busyId === u.id;
            return (
              <li key={u.id} className="py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className={disabled ? "opacity-50" : ""}>
                  <p className="text-sm text-paper">
                    {u.full_name}
                    {isMe && <span className="text-muted"> (tú)</span>}
                  </p>
                  <p className="text-xs text-muted">{u.login_email}</p>
                  <p className="text-xs text-muted mt-1">
                    {u.is_global_admin ? "Administrador" : "Usuario"} · {disabled ? "Desactivado" : "Activo"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={btn}
                    disabled={busy || (isMe && u.is_global_admin)}
                    onClick={() => update(u, { is_global_admin: !u.is_global_admin })}
                  >
                    {u.is_global_admin ? "Quitar admin" : "Hacer admin"}
                  </button>
                  {disabled ? (
                    <>
                      <button className={btn} disabled={busy} onClick={() => update(u, { status: "active" })}>
                        Activar
                      </button>
                      <button
                        className={`${btn} !text-red-400 !border-red-400/50`}
                        disabled={busy}
                        onClick={() => remove(u)}
                      >
                        Eliminar
                      </button>
                    </>
                  ) : (
                    <button className={btn} disabled={busy || isMe} onClick={() => update(u, { status: "disabled" })}>
                      Desactivar
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
