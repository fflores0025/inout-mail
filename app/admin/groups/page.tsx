"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdminUser,
  ApiError,
  MailGroup,
  adminAddGroupMember,
  adminCreateGroup,
  adminDeleteGroup,
  adminGetGroups,
  adminGetUsers,
  adminRemoveGroupMember,
} from "@/lib/api";
import { getToken } from "@/lib/session";
import { EmailInput, fullEmail } from "@/components/EmailInput";

const input =
  "w-full bg-transparent border border-line px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-paper";

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<MailGroup[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [local, setLocal] = useState("");
  const [creating, setCreating] = useState(false);
  const [pick, setPick] = useState<Record<number, string>>({});

  const errMsg = (err: unknown) =>
    err instanceof ApiError ? err.message : "No se pudo conectar con el servidor";

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const [g, u] = await Promise.all([adminGetGroups(token), adminGetUsers(token)]);
      setGroups(g);
      setUsers(u);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const g = await adminCreateGroup(token, { name, address: fullEmail(local) });
      setNotice(`Grupo ${g.address} creado. Añade ahora a sus miembros.`);
      setName("");
      setLocal("");
      await load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setCreating(false);
    }
  }

  async function addMember(g: MailGroup) {
    const token = getToken();
    const userId = Number(pick[g.id]);
    if (!token || !userId) return;
    setError(null);
    setNotice(null);
    try {
      await adminAddGroupMember(token, g.id, userId);
      setPick((p) => ({ ...p, [g.id]: "" }));
      await load();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  async function removeMember(g: MailGroup, aliasId: number, label: string) {
    const token = getToken();
    if (!token) return;
    const sure = window.confirm(`¿Quitar a ${label} del grupo ${g.address}?\n\nDejará de recibir copia de sus correos.`);
    if (!sure) return;
    setError(null);
    setNotice(null);
    try {
      await adminRemoveGroupMember(token, g.id, aliasId);
      await load();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  async function removeGroup(g: MailGroup) {
    const token = getToken();
    if (!token) return;
    const sure = window.confirm(
      `¿Eliminar el grupo ${g.address}?\n\nLa dirección dejará de existir y no se reenviará nada. Los correos ya entregados a cada persona no se tocan.`
    );
    if (!sure) return;
    setError(null);
    setNotice(null);
    try {
      await adminDeleteGroup(token, g.id);
      setNotice(`Grupo ${g.address} eliminado.`);
      await load();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  const candidates = users.filter((u) => u.personal_mailbox_id && u.status !== "disabled");

  return (
    <div className="space-y-10">
      {error && <p className="text-sm text-red-400 border border-red-400/40 px-3 py-2">{error}</p>}
      {notice && <p className="text-sm text-paper border border-line px-3 py-2">{notice}</p>}

      <form onSubmit={handleCreate} className="space-y-3 max-w-md">
        <h2 className="font-display text-xl text-paper">Crear grupo</h2>
        <p className="text-xs text-muted">
          Cada correo que llegue a la dirección del grupo se copia al buzón personal de cada miembro. Cada
          persona lo ve y lo marca como leído por su cuenta.
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del grupo (ej. Equipo técnico)"
          required
          className={input}
        />
        <EmailInput value={local} onChange={setLocal} placeholder="direccion-del-grupo" />
        <button
          type="submit"
          disabled={creating}
          className="px-4 py-2 text-sm border border-paper text-paper hover:bg-paper hover:text-ink transition-colors disabled:opacity-50"
        >
          {creating ? "Creando…" : "Crear grupo"}
        </button>
      </form>

      <section className="space-y-6">
        <h2 className="font-display text-xl text-paper">Grupos existentes</h2>
        {loading && <p className="text-sm text-muted">Cargando…</p>}
        {!loading && groups.length === 0 && <p className="text-sm text-muted">Todavía no hay grupos.</p>}
        {groups.map((g) => {
          const memberIds = new Set(g.members.map((m) => m.user_id));
          const free = candidates.filter((u) => !memberIds.has(u.id));
          return (
            <div key={g.id} className="border border-line p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-paper">{g.name}</p>
                  <p className="text-xs text-muted break-all">{g.address}</p>
                </div>
                <button
                  onClick={() => removeGroup(g)}
                  className="px-3 py-1.5 text-xs border border-red-400/50 text-red-400 hover:bg-red-400/10 shrink-0"
                >
                  Eliminar grupo
                </button>
              </div>

              <ul className="divide-y divide-line border-y border-line">
                {g.members.length === 0 && (
                  <li className="py-2 text-xs text-muted">Sin miembros: de momento el correo no llega a nadie.</li>
                )}
                {g.members.map((m) => (
                  <li key={m.alias_id} className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-paper">{m.full_name || m.destination}</p>
                      <p className="text-xs text-muted break-all">{m.destination}</p>
                      {!m.mailbox_exists && (
                        <p className="text-xs text-red-400">Este buzón ya no existe: quítalo del grupo.</p>
                      )}
                    </div>
                    <button
                      onClick={() => removeMember(g, m.alias_id, m.full_name || m.destination)}
                      className="px-3 py-1.5 text-xs border border-line text-paper hover:border-paper transition-colors shrink-0"
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>

              <div className="flex gap-2">
                <select
                  value={pick[g.id] || ""}
                  onChange={(e) => setPick((p) => ({ ...p, [g.id]: e.target.value }))}
                  className={`${input} bg-ink`}
                >
                  <option value="">Añadir miembro…</option>
                  {free.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.login_email})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => addMember(g)}
                  disabled={!pick[g.id]}
                  className="px-4 py-2 text-sm border border-paper text-paper hover:bg-paper hover:text-ink transition-colors disabled:opacity-40 shrink-0"
                >
                  Añadir
                </button>
              </div>
              {free.length === 0 && (
                <p className="text-xs text-muted">No quedan usuarios con buzón personal por añadir.</p>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
