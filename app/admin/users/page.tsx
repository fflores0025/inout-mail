"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdminUser,
  ApiError,
  Role,
  adminCreatePersonalMailbox,
  adminCreateUser,
  adminDeleteUser,
  adminGetUsers,
  adminSetUserPassword,
  adminUpdateUser,
  getMe,
} from "@/lib/api";
import { getToken } from "@/lib/session";
import { EmailInput, fullEmail } from "@/components/EmailInput";
import { PasswordForm } from "@/components/PasswordForm";

const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super admin",
  admin: "Admin (director)",
  employee: "Empleado",
};

const input =
  "w-full bg-transparent border border-line px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-paper";
const selectBox =
  "w-full bg-ink border border-line px-3 py-2 text-sm text-paper focus:outline-none focus:border-paper";
const btn =
  "px-3 py-1.5 text-xs border border-line text-paper hover:border-paper transition-colors disabled:opacity-40";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [myId, setMyId] = useState<number | null>(null);
  const [pwUserId, setPwUserId] = useState<number | null>(null);

  const [fullName, setFullName] = useState("");
  const [local, setLocal] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [withMailbox, setWithMailbox] = useState(true);
  const [creating, setCreating] = useState(false);

  const errMsg = (err: unknown) =>
    err instanceof ApiError ? err.message : "No se pudo conectar con el servidor";

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      setUsers(await adminGetUsers(token));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (token) getMe(token).then((m) => setMyId(m.id)).catch(() => {});
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
      const res = await adminCreateUser(token, {
        full_name: fullName.trim(),
        login_email: fullEmail(local),
        password,
        role,
        create_personal_mailbox: withMailbox,
      });
      setNotice(
        `Usuario creado${res.mailbox ? ` con buzón personal ${res.mailbox.email}` : ""}.`
      );
      setFullName("");
      setLocal("");
      setPassword("");
      setRole("employee");
      setWithMailbox(true);
      await load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setCreating(false);
    }
  }

  async function run(u: AdminUser, fn: (token: string) => Promise<unknown>, ok?: string) {
    const token = getToken();
    if (!token) return;
    setBusyId(u.id);
    setError(null);
    setNotice(null);
    try {
      await fn(token);
      if (ok) setNotice(ok);
      await load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusyId(null);
    }
  }

  function changeRole(u: AdminUser, next: Role) {
    if (next === u.role) return;
    if (u.role === "super_admin") {
      const sure = window.confirm(
        `${u.full_name} dejará de ser super admin y perderá el acceso a todos los buzones salvo los suyos. ¿Continuar?`
      );
      if (!sure) return;
    }
    run(u, (t) => adminUpdateUser(t, u.id, { role: next }));
  }

  function remove(u: AdminUser) {
    if (!window.confirm(`¿Eliminar definitivamente a ${u.full_name}? No se puede deshacer.`)) return;
    run(u, (t) => adminDeleteUser(t, u.id));
  }

  function createMailbox(u: AdminUser) {
    const pw = window.prompt(
      `Contraseña para el buzón de ${u.login_email} (mínimo 8 caracteres). Déjala vacía si la dirección ya existe.`
    );
    if (pw === null) return;
    run(u, (t) => adminCreatePersonalMailbox(t, u.id, pw || undefined), "Buzón personal creado.");
  }

  return (
    <div className="space-y-10">
      {error && <p className="text-sm text-red-400 border border-red-400/40 px-3 py-2">{error}</p>}
      {notice && <p className="text-sm text-paper border border-line px-3 py-2">{notice}</p>}

      <form onSubmit={handleCreate} className="space-y-3 max-w-md">
        <h2 className="font-display text-xl text-paper">Crear usuario</h2>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Nombre completo"
          required
          className={input}
        />
        <EmailInput value={local} onChange={setLocal} placeholder="usuario" />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Contraseña (mínimo 8 caracteres)"
          required
          minLength={8}
          className={input}
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className={selectBox}
        >
          <option value="employee" className="bg-ink">Empleado</option>
          <option value="admin" className="bg-ink">Admin (director de departamento)</option>
          <option value="super_admin" className="bg-ink">Super admin</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={withMailbox}
            onChange={(e) => setWithMailbox(e.target.checked)}
          />
          Crear su buzón personal (misma dirección y contraseña)
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
              <li key={u.id} className="py-4 space-y-3">
                <div className={disabled ? "opacity-50" : ""}>
                  <p className="text-sm text-paper">
                    {u.full_name}
                    {isMe && <span className="text-muted"> (tú)</span>}
                  </p>
                  <p className="text-xs text-muted">{u.login_email}</p>
                  <p className="text-xs text-muted mt-1">
                    {ROLE_LABEL[u.role]} · {disabled ? "Desactivado" : "Activo"} ·{" "}
                    {u.personal_mailbox_id ? "Con buzón personal" : "Sin buzón personal"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={u.role}
                    disabled={busy || isMe}
                    onChange={(e) => changeRole(u, e.target.value as Role)}
                    className="bg-ink border border-line px-2 py-1.5 text-xs text-paper disabled:opacity-40"
                  >
                    <option value="employee">Empleado</option>
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super admin</option>
                  </select>
                  <button
                    className={btn}
                    disabled={busy}
                    onClick={() => setPwUserId(pwUserId === u.id ? null : u.id)}
                  >
                    Contraseña
                  </button>
                  {!u.personal_mailbox_id && (
                    <button className={btn} disabled={busy} onClick={() => createMailbox(u)}>
                      Crear buzón personal
                    </button>
                  )}
                  {disabled ? (
                    <>
                      <button
                        className={btn}
                        disabled={busy}
                        onClick={() => run(u, (t) => adminUpdateUser(t, u.id, { status: "active" }))}
                      >
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
                    <button
                      className={btn}
                      disabled={busy || isMe}
                      onClick={() => run(u, (t) => adminUpdateUser(t, u.id, { status: "disabled" }))}
                    >
                      Desactivar
                    </button>
                  )}
                </div>
                {pwUserId === u.id && (
                  <div className="border border-line p-4">
                    <p className="text-xs text-muted mb-3">
                      Nueva contraseña para {u.full_name}
                    </p>
                    <PasswordForm
                      askCurrent={false}
                      mailboxLabel={
                        u.personal_mailbox_id
                          ? "Cambiar también la contraseña de su buzón personal"
                          : undefined
                      }
                      submitLabel="Guardar contraseña"
                      onCancel={() => setPwUserId(null)}
                      onSubmit={async (v) => {
                        const token = getToken();
                        if (!token) return;
                        try {
                          const res = await adminSetUserPassword(token, u.id, {
                            password: v.next,
                            also_mailbox: !!u.personal_mailbox_id && v.alsoMailbox,
                          });
                          setNotice(
                            res.mailbox_updated
                              ? `Contraseña de ${u.full_name} cambiada (acceso y buzón).`
                              : `Contraseña de acceso de ${u.full_name} cambiada.`
                          );
                          setPwUserId(null);
                        } catch (err) {
                          throw new Error(errMsg(err));
                        }
                      }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
