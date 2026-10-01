"use client";

import { useEffect, useState } from "react";
import { adminGetUsers, adminCreateUser, adminUpdateUser, AdminUser, ApiError } from "@/lib/api";
import { getToken } from "@/lib/session";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);

  function load() {
    const token = getToken()!;
    setLoading(true);
    adminGetUsers(token)
      .then(setUsers)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error al cargar usuarios"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const token = getToken()!;
      await adminCreateUser(token, {
        full_name: fullName,
        login_email: loginEmail,
        password,
        is_global_admin: isAdmin,
      });
      setFullName("");
      setLoginEmail("");
      setPassword("");
      setIsAdmin(false);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al crear el usuario");
    } finally {
      setCreating(false);
    }
  }

  async function toggleStatus(user: AdminUser) {
    const token = getToken()!;
    const newStatus = user.status === "active" ? "disabled" : "active";
    await adminUpdateUser(token, user.id, { status: newStatus });
    load();
  }

  async function toggleAdmin(user: AdminUser) {
    const token = getToken()!;
    await adminUpdateUser(token, user.id, { is_global_admin: !user.is_global_admin });
    load();
  }

  return (
    <div className="max-w-3xl space-y-10">
      <section>
        <h2 className="font-display text-lg text-paper mb-4">Nuevo usuario</h2>
        <form onSubmit={handleCreate} className="space-y-3">
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
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
            Administrador global
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 text-sm border border-paper text-paper hover:bg-paper hover:text-ink transition-colors disabled:opacity-50"
          >
            {creating ? "Creando…" : "Crear usuario"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-display text-lg text-paper mb-4">Usuarios existentes</h2>
        {loading && <p className="text-sm text-muted">Cargando…</p>}
        <div className="divide-y divide-line border-t border-line">
          {users.map((u) => (
            <div key={u.id} className="py-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-paper">
                  {u.full_name}
                  {u.is_global_admin && (
                    <span className="ml-2 text-xs text-muted border border-line px-1.5 py-0.5">admin</span>
                  )}
                </p>
                <p className="text-xs text-muted">{u.login_email}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-xs ${u.status === "active" ? "text-muted" : "text-red-400"}`}>
                  {u.status}
                </span>
                <button
                  onClick={() => toggleAdmin(u)}
                  className="text-xs text-muted hover:text-paper border border-line px-2 py-1 transition-colors"
                >
                  {u.is_global_admin ? "Quitar admin" : "Hacer admin"}
                </button>
                <button
                  onClick={() => toggleStatus(u)}
                  className="text-xs text-muted hover:text-paper border border-line px-2 py-1 transition-colors"
                >
                  {u.status === "active" ? "Desactivar" : "Activar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
