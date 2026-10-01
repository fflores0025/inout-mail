"use client";

import { useEffect, useState } from "react";
import {
  adminGetMailboxes,
  adminCreateMailbox,
  adminGetUsers,
  adminGetPermissions,
  adminSetPermission,
  adminRevokePermission,
  AdminMailbox,
  AdminUser,
  AdminPermission,
  ApiError,
} from "@/lib/api";
import { getToken } from "@/lib/session";

export default function AdminMailboxesPage() {
  const [mailboxes, setMailboxes] = useState<AdminMailbox[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [virtualUserEmail, setVirtualUserEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [kind, setKind] = useState<"personal" | "department">("personal");
  const [creating, setCreating] = useState(false);

  const [selectedMailbox, setSelectedMailbox] = useState<AdminMailbox | null>(null);
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [permUserId, setPermUserId] = useState<number | "">("");
  const [permCanRead, setPermCanRead] = useState(true);
  const [permCanSend, setPermCanSend] = useState(true);
  const [permCanDelete, setPermCanDelete] = useState(false);
  const [permCanManage, setPermCanManage] = useState(false);

  function load() {
    const token = getToken()!;
    setLoading(true);
    Promise.all([adminGetMailboxes(token), adminGetUsers(token)])
      .then(([mbs, us]) => {
        setMailboxes(mbs);
        setUsers(us);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error al cargar"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const token = getToken()!;
      await adminCreateMailbox(token, {
        virtual_user_email: virtualUserEmail,
        display_name: displayName,
        kind,
      });
      setVirtualUserEmail("");
      setDisplayName("");
      setKind("personal");
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al crear el buzón");
    } finally {
      setCreating(false);
    }
  }

  function openPermissions(mb: AdminMailbox) {
    setSelectedMailbox(mb);
    const token = getToken()!;
    adminGetPermissions(token, mb.id).then(setPermissions);
  }

  async function handleAddPermission(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMailbox || permUserId === "") return;
    const token = getToken()!;
    await adminSetPermission(token, selectedMailbox.id, {
      app_user_id: Number(permUserId),
      can_read: permCanRead,
      can_send: permCanSend,
      can_delete: permCanDelete,
      can_manage: permCanManage,
    });
    const updated = await adminGetPermissions(token, selectedMailbox.id);
    setPermissions(updated);
    setPermUserId("");
  }

  async function handleRevoke(userId: number) {
    if (!selectedMailbox) return;
    const token = getToken()!;
    await adminRevokePermission(token, selectedMailbox.id, userId);
    const updated = await adminGetPermissions(token, selectedMailbox.id);
    setPermissions(updated);
  }

  return (
    <div className="max-w-4xl space-y-10">
      <section>
        <h2 className="font-display text-lg text-paper mb-4">Nuevo buzón</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <input
            value={virtualUserEmail}
            onChange={(e) => setVirtualUserEmail(e.target.value)}
            type="email"
            placeholder="Dirección ya creada (p.ej. ventas@inout-media.es)"
            required
            className="w-full bg-transparent border border-line px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-paper"
          />
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Nombre a mostrar (p.ej. Ventas)"
            required
            className="w-full bg-transparent border border-line px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-paper"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "personal" | "department")}
            className="w-full bg-ink border border-line px-3 py-2 text-sm text-paper focus:outline-none focus:border-paper"
          >
            <option value="personal">Personal</option>
            <option value="department">Departamental</option>
          </select>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 text-sm border border-paper text-paper hover:bg-paper hover:text-ink transition-colors disabled:opacity-50"
          >
            {creating ? "Creando…" : "Crear buzón"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-display text-lg text-paper mb-4">Buzones existentes</h2>
        {loading && <p className="text-sm text-muted">Cargando…</p>}
        <div className="divide-y divide-line border-t border-line">
          {mailboxes.map((mb) => (
            <button
              key={mb.id}
              onClick={() => openPermissions(mb)}
              className={`w-full text-left py-3 flex items-center justify-between gap-4 hover:bg-line/20 transition-colors ${
                selectedMailbox?.id === mb.id ? "bg-line/20" : ""
              }`}
            >
              <div>
                <p className="text-sm text-paper">{mb.display_name}</p>
                <p className="text-xs text-muted">{mb.email}</p>
              </div>
              <span className="text-xs text-muted shrink-0">
                {mb.kind === "personal" ? "Personal" : "Departamental"}
              </span>
            </button>
          ))}
        </div>
      </section>

      {selectedMailbox && (
        <section>
          <h2 className="font-display text-lg text-paper mb-1">
            Accesos a {selectedMailbox.display_name}
          </h2>
          <p className="text-xs text-muted mb-4">{selectedMailbox.email}</p>

          <div className="divide-y divide-line border-t border-b border-line mb-6">
            {permissions.length === 0 && (
              <p className="py-3 text-sm text-muted">Nadie tiene acceso todavía.</p>
            )}
            {permissions.map((p) => (
              <div key={p.app_user_id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-paper">{p.full_name}</p>
                  <p className="text-xs text-muted">{p.login_email}</p>
                  <p className="text-xs text-muted mt-1">
                    {[
                      p.can_read && "leer",
                      p.can_send && "enviar",
                      p.can_delete && "borrar",
                      p.can_manage && "gestionar",
                    ]
                      .filter(Boolean)
                      .join(" · ") || "sin permisos"}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(p.app_user_id)}
                  className="text-xs text-muted hover:text-red-400 border border-line px-2 py-1 transition-colors shrink-0"
                >
                  Revocar
                </button>
              </div>
            ))}
          </div>

          <h3 className="text-sm text-paper mb-3">Dar acceso a alguien</h3>
          <form onSubmit={handleAddPermission} className="space-y-3">
            <select
              value={permUserId}
              onChange={(e) => setPermUserId(e.target.value ? Number(e.target.value) : "")}
              required
              className="w-full bg-ink border border-line px-3 py-2 text-sm text-paper focus:outline-none focus:border-paper"
            >
              <option value="">Selecciona un usuario…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.login_email})
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-4 text-sm text-muted">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={permCanRead} onChange={(e) => setPermCanRead(e.target.checked)} />
                Leer
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={permCanSend} onChange={(e) => setPermCanSend(e.target.checked)} />
                Enviar
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={permCanDelete} onChange={(e) => setPermCanDelete(e.target.checked)} />
                Borrar
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={permCanManage} onChange={(e) => setPermCanManage(e.target.checked)} />
                Gestionar
              </label>
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
