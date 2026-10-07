"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdminMailbox,
  AdminPermission,
  AdminUser,
  ApiError,
  Me,
  adminCreateMailbox,
  adminGetMailboxes,
  adminGetPermissions,
  adminGetUsers,
  adminRevokePermission,
  adminSetPermission,
  getMe,
} from "@/lib/api";
import { getToken } from "@/lib/session";
import { EmailInput, fullEmail } from "@/components/EmailInput";

const input =
  "w-full bg-transparent border border-line px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-paper";
const selectBox =
  "w-full bg-ink border border-line px-3 py-2 text-sm text-paper focus:outline-none focus:border-paper";

export default function AdminMailboxesPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [mailboxes, setMailboxes] = useState<AdminMailbox[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // crear buzón
  const [displayName, setDisplayName] = useState("");
  const [local, setLocal] = useState("");
  const [kind, setKind] = useState<"department" | "personal">("department");
  const [ownerId, setOwnerId] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  // permisos
  const [selected, setSelected] = useState<AdminMailbox | null>(null);
  const [perms, setPerms] = useState<AdminPermission[]>([]);
  const [grantUser, setGrantUser] = useState("");
  const [canRead, setCanRead] = useState(true);
  const [canSend, setCanSend] = useState(true);
  const [canDelete, setCanDelete] = useState(false);
  const [canManage, setCanManage] = useState(false);

  const isSuper = me?.role === "super_admin";
  const errMsg = (err: unknown) =>
    err instanceof ApiError ? err.message : "No se pudo conectar con el servidor";

  const loadMailboxes = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      setMailboxes(await adminGetMailboxes(token));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPerms = useCallback(async (mailboxId: number) => {
    const token = getToken();
    if (!token) return;
    try {
      setPerms(await adminGetPermissions(token, mailboxId));
    } catch (err) {
      setError(errMsg(err));
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    getMe(token).then(setMe).catch(() => {});
    adminGetUsers(token).then(setUsers).catch(() => {});
    loadMailboxes();
  }, [loadMailboxes]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const created = await adminCreateMailbox(token, {
        virtual_user_email: fullEmail(local),
        kind,
        display_name: displayName.trim(),
        owner_user_id: kind === "personal" && ownerId ? Number(ownerId) : undefined,
        password: password || undefined,
      });
      setNotice(`Buzón "${created.display_name}" creado.`);
      setDisplayName("");
      setLocal("");
      setOwnerId("");
      setPassword("");
      await loadMailboxes();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setCreating(false);
    }
  }

  function select(m: AdminMailbox) {
    setSelected(m);
    setPerms([]);
    setError(null);
    setNotice(null);
    loadPerms(m.id);
  }

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !selected || !grantUser) return;
    setError(null);
    setNotice(null);
    try {
      await adminSetPermission(token, selected.id, {
        app_user_id: Number(grantUser),
        can_read: canRead,
        can_send: canSend,
        can_delete: canDelete,
        can_manage: isSuper ? canManage : false,
      });
      setGrantUser("");
      await loadPerms(selected.id);
    } catch (err) {
      setError(errMsg(err));
    }
  }

  async function revoke(p: AdminPermission) {
    const token = getToken();
    if (!token || !selected) return;
    if (!window.confirm(`¿Quitar el acceso de ${p.full_name} a ${selected.display_name}?`)) return;
    setError(null);
    setNotice(null);
    try {
      await adminRevokePermission(token, selected.id, p.app_user_id);
      await loadPerms(selected.id);
    } catch (err) {
      setError(errMsg(err));
    }
  }

  const flags = (p: AdminPermission) =>
    [p.can_read && "leer", p.can_send && "enviar", p.can_delete && "borrar", p.can_manage && "gestionar"]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="space-y-10">
      {error && <p className="text-sm text-red-400 border border-red-400/40 px-3 py-2">{error}</p>}
      {notice && <p className="text-sm text-paper border border-line px-3 py-2">{notice}</p>}

      {isSuper && (
        <form onSubmit={handleCreate} className="space-y-3 max-w-md">
          <h2 className="font-display text-xl text-paper">Crear buzón</h2>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Nombre (ej. Recursos Humanos)"
            required
            className={input}
          />
          <EmailInput value={local} onChange={setLocal} placeholder="rrhh" />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "department" | "personal")}
            className={selectBox}
          >
            <option value="department">Departamental</option>
            <option value="personal">Personal</option>
          </select>
          {kind === "personal" && (
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={selectBox}>
              <option value="">Titular (opcional)…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
          )}
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Contraseña (solo si la dirección es nueva)"
            minLength={8}
            className={input}
          />
          <p className="text-xs text-muted">
            Si la dirección todavía no existe, se crea con esa contraseña. Si ya existe, déjala vacía.
          </p>
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 text-sm border border-paper text-paper hover:bg-paper hover:text-ink transition-colors disabled:opacity-50"
          >
            {creating ? "Creando…" : "Crear buzón"}
          </button>
        </form>
      )}

      <section>
        <h2 className="font-display text-xl text-paper mb-4">
          {isSuper ? "Buzones existentes" : "Tus departamentos"}
        </h2>
        {loading && <p className="text-sm text-muted">Cargando…</p>}
        {!loading && mailboxes.length === 0 && (
          <p className="text-sm text-muted">No tienes buzones que gestionar.</p>
        )}
        <ul className="divide-y divide-line border-y border-line">
          {mailboxes.map((m) => (
            <li
              key={m.id}
              onClick={() => select(m)}
              className={`py-4 px-1 flex items-center justify-between gap-4 cursor-pointer hover:bg-line/30 ${
                selected?.id === m.id ? "bg-line/30" : ""
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm text-paper">{m.display_name}</p>
                <p className="text-xs text-muted break-all">{m.email}</p>
              </div>
              <span className="text-xs text-muted shrink-0">
                {m.kind === "department" ? "Departamental" : "Personal"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {selected && (
        <section className="space-y-6">
          <div>
            <h2 className="font-display text-xl text-paper">Accesos a {selected.display_name}</h2>
            <p className="text-xs text-muted break-all">{selected.email}</p>
          </div>

          <ul className="divide-y divide-line border-y border-line">
            {perms.map((p) => (
              <li key={p.app_user_id} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-paper">{p.full_name}</p>
                  <p className="text-xs text-muted break-all">{p.login_email}</p>
                  <p className="text-xs text-muted mt-1">{flags(p) || "sin permisos"}</p>
                </div>
                {(isSuper || p.role !== "super_admin") && (
                  <button
                    onClick={() => revoke(p)}
                    className="px-3 py-1.5 text-xs border border-red-400/50 text-red-400 hover:bg-red-400/10 shrink-0"
                  >
                    Revocar
                  </button>
                )}
              </li>
            ))}
          </ul>

          <form onSubmit={handleGrant} className="space-y-3 max-w-md">
            <h3 className="font-display text-lg text-paper">Dar acceso a alguien</h3>
            <select value={grantUser} onChange={(e) => setGrantUser(e.target.value)} className={selectBox} required>
              <option value="">Selecciona un usuario…</option>
              {users
                .filter((u) => u.status !== "disabled" && (isSuper || u.role !== "super_admin"))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.login_email})
                  </option>
                ))}
            </select>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={canRead} onChange={(e) => setCanRead(e.target.checked)} /> Leer
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={canSend} onChange={(e) => setCanSend(e.target.checked)} /> Enviar
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={canDelete} onChange={(e) => setCanDelete(e.target.checked)} /> Borrar
              </label>
              {isSuper && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={canManage} onChange={(e) => setCanManage(e.target.checked)} />{" "}
                  Gestionar
                </label>
              )}
            </div>
            <button
              type="submit"
              className="px-4 py-2 text-sm border border-paper text-paper hover:bg-paper hover:text-ink transition-colors"
            >
              Dar acceso
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
