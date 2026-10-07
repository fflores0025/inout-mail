"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdminMailbox,
  AdminUser,
  ApiError,
  AuditLogEntry,
  FullMessage,
  adminGetAuditLog,
  adminGetAuditMessage,
  adminGetMailboxes,
  adminGetUsers,
} from "@/lib/api";
import { getToken } from "@/lib/session";

const selectBox =
  "w-full bg-ink border border-line px-3 py-2 text-sm text-paper focus:outline-none focus:border-paper";

const ACTION_LABEL: Record<string, string> = {
  sent: "Envió un correo",
  read: "Abrió un correo",
};

function summary(e: AuditLogEntry): string {
  const d = (e.details ?? {}) as Record<string, unknown>;
  const subject = typeof d.subject === "string" ? d.subject : "";
  if (e.action === "sent") return `Para: ${d.to ?? ""}${subject ? ` · ${subject}` : ""}`;
  if (e.action === "read") return `De: ${d.from ?? ""}${subject ? ` · ${subject}` : ""}`;
  const { text: _omit, ...rest } = d;
  void _omit;
  return Object.keys(rest).length ? JSON.stringify(rest) : "";
}

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [mailboxes, setMailboxes] = useState<AdminMailbox[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [mailboxId, setMailboxId] = useState("");
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openEntry, setOpenEntry] = useState<AuditLogEntry | null>(null);
  const [openMsg, setOpenMsg] = useState<FullMessage | null>(null);
  const [openLoading, setOpenLoading] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const load = useCallback(async (mb: string, us: string) => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setEntries(
        await adminGetAuditLog(token, {
          mailbox_id: mb ? Number(mb) : undefined,
          user_id: us ? Number(us) : undefined,
        })
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    adminGetMailboxes(token).then(setMailboxes).catch(() => {});
    adminGetUsers(token).then(setUsers).catch(() => {});
    load("", "");
  }, [load]);

  async function openMail(e: AuditLogEntry) {
    const token = getToken();
    if (!token) return;
    setOpenEntry(e);
    setOpenMsg(null);
    setOpenError(null);
    setOpenLoading(true);
    try {
      setOpenMsg(await adminGetAuditMessage(token, e.id));
    } catch (err) {
      setOpenError(err instanceof ApiError ? err.message : "No se pudo abrir el correo");
    } finally {
      setOpenLoading(false);
    }
  }

  function closeMail() {
    setOpenEntry(null);
    setOpenMsg(null);
    setOpenError(null);
  }

  const srcDoc =
    openMsg && openMsg.html
      ? `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><base target="_blank"><style>body{font-family:system-ui,sans-serif;font-size:14px;color:#111;margin:12px;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>${openMsg.html}</body></html>`
      : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
        <label className="space-y-1">
          <span className="text-xs text-muted">Buzón o departamento</span>
          <select
            value={mailboxId}
            onChange={(e) => {
              setMailboxId(e.target.value);
              load(e.target.value, userId);
            }}
            className={selectBox}
          >
            <option value="">Todos</option>
            {mailboxes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted">Empleado</span>
          <select
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              load(mailboxId, e.target.value);
            }}
            className={selectBox}
          >
            <option value="">Todos</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-red-400 border border-red-400/40 px-3 py-2">{error}</p>}
      {loading && <p className="text-sm text-muted">Cargando…</p>}
      {!loading && !error && (
        <p className="text-xs text-muted">
          {entries.length === 0 ? "Sin registros." : `Últimos ${entries.length} registros (máximo 500).`}
        </p>
      )}

      <ul className="divide-y divide-line border-y border-line">
        {entries.map((e) => (
          <li key={e.id} className="py-3 space-y-1">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-sm text-paper">
                {e.actor} · <span className="text-muted">{ACTION_LABEL[e.action] ?? e.action}</span>
              </p>
              <p className="text-xs text-muted shrink-0">
                {new Date(e.created_at).toLocaleString("es-ES", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <p className="text-xs text-muted">{e.mailbox}</p>
            {summary(e) && <p className="text-xs text-muted break-all">{summary(e)}</p>}
            {(e.action === "sent" || e.action === "read") && (
              <button
                onClick={() => openMail(e)}
                className="mt-1 px-3 py-1.5 text-xs border border-line text-paper hover:border-paper transition-colors"
              >
                Abrir correo
              </button>
            )}
          </li>
        ))}
      </ul>

      {openEntry && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
          <div className="bg-ink border border-line w-full sm:max-w-2xl flex flex-col max-h-[88dvh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
              <h2 className="font-display text-lg text-paper">Correo del registro</h2>
              <button onClick={closeMail} className="text-muted hover:text-paper">
                ✕
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3">
              {openLoading && <p className="text-sm text-muted">Abriendo…</p>}
              {openError && <p className="text-sm text-red-400">{openError}</p>}
              {openMsg && (
                <>
                  <h3 className="font-display text-xl text-paper break-words">{openMsg.subject}</h3>
                  <p className="text-sm text-paper break-words">
                    {openMsg.from_name ? `${openMsg.from_name} ` : ""}
                    <span className="text-muted">&lt;{openMsg.from}&gt;</span>
                  </p>
                  <p className="text-xs text-muted break-words">Para: {openMsg.to}</p>
                  <p className="text-xs text-muted">
                    {openMsg.date ? new Date(openMsg.date).toLocaleString("es-ES") : ""}
                  </p>
                  <div className="border-t border-line pt-3">
                    {srcDoc ? (
                      <iframe
                        title="Mensaje"
                        sandbox=""
                        srcDoc={srcDoc}
                        className="w-full bg-white"
                        style={{ height: "50vh", border: 0 }}
                      />
                    ) : (
                      <pre className="whitespace-pre-wrap break-words text-sm text-paper font-sans">
                        {openMsg.text || "(mensaje vacío)"}
                      </pre>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
