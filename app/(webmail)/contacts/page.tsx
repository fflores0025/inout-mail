"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  Contact,
  ContactInput,
  createContact,
  deleteContact,
  getContactList,
  updateContact,
} from "@/lib/api";
import { getToken } from "@/lib/session";

const input =
  "w-full bg-transparent border border-line px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-paper";
const btn =
  "px-3 py-1.5 text-xs border border-line text-paper hover:border-paper transition-colors disabled:opacity-40";

const EMPTY: ContactInput = { name: "", company: "", job_title: "", emails: "", phone: "", notes: "" };

function ContactForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ContactInput;
  submitLabel: string;
  onSubmit: (v: ContactInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ContactInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSubmit(v);
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-2"
    >
      <input value={v.name} onChange={set("name")} placeholder="Nombre" className={input} />
      <input value={v.company} onChange={set("company")} placeholder="Empresa" className={input} />
      <input value={v.job_title} onChange={set("job_title")} placeholder="Cargo" className={input} />
      <input
        value={v.emails}
        onChange={set("emails")}
        placeholder="Correo (varios separados por coma)"
        inputMode="email"
        autoCapitalize="none"
        className={input}
      />
      <input value={v.phone} onChange={set("phone")} placeholder="Teléfono (opcional)" inputMode="tel" className={input} />
      <textarea value={v.notes} onChange={set("notes")} placeholder="Notas (opcional)" rows={2} className={`${input} resize-none`} />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 text-sm border border-paper text-paper hover:bg-paper hover:text-ink transition-colors disabled:opacity-50"
        >
          {busy ? "Guardando…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-line text-muted hover:text-paper">
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const errMsg = (err: unknown) => (err instanceof ApiError ? err.message : "No se pudo conectar con el servidor");

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      setContacts(await getContactList(token));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return contacts;
    return contacts.filter((c) =>
      [c.name, c.company, c.job_title, c.phone, c.owner_name, ...c.emails].join(" ").toLowerCase().includes(t)
    );
  }, [contacts, q]);

  async function run(fn: (token: string) => Promise<unknown>, ok: string) {
    const token = getToken();
    if (!token) return;
    setError(null);
    setNotice(null);
    try {
      await fn(token);
      setNotice(ok);
      await load();
    } catch (err) {
      setError(errMsg(err));
      throw err;
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-paper">Contactos</h1>
        <button
          onClick={() => {
            setAdding((v) => !v);
            setEditId(null);
          }}
          className="px-4 py-2 text-sm border border-paper text-paper hover:bg-paper hover:text-ink transition-colors"
        >
          {adding ? "Cerrar" : "Nuevo contacto"}
        </button>
      </div>

      {error && <p className="text-sm text-red-400 border border-red-400/40 px-3 py-2">{error}</p>}
      {notice && <p className="text-sm text-paper border border-line px-3 py-2">{notice}</p>}

      {adding && (
        <div className="border border-line p-4">
          <ContactForm
            initial={EMPTY}
            submitLabel="Guardar contacto"
            onCancel={() => setAdding(false)}
            onSubmit={async (v) => {
              await run((t) => createContact(t, v), "Contacto guardado.").catch(() => {});
              setAdding(false);
            }}
          />
        </div>
      )}

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre, empresa, cargo o correo"
        className={input}
      />

      {loading && <p className="text-sm text-muted">Cargando…</p>}
      {!loading && filtered.length === 0 && (
        <p className="text-sm text-muted">
          {contacts.length === 0
            ? "Todavía no hay contactos. Se añaden solos al escribir a direcciones externas nuevas."
            : "Sin resultados."}
        </p>
      )}

      <ul className="divide-y divide-line border-y border-line">
        {filtered.map((c) => (
          <li key={c.id} className="py-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-paper">{c.name}</p>
                {(c.company || c.job_title) && (
                  <p className="text-xs text-muted">{[c.company, c.job_title].filter(Boolean).join(" · ")}</p>
                )}
                {c.emails.map((e) => (
                  <p key={e} className="text-xs text-muted break-all">
                    {e}
                  </p>
                ))}
                {c.phone && <p className="text-xs text-muted">{c.phone}</p>}
                {c.notes && <p className="text-xs text-muted/80 mt-1 whitespace-pre-wrap">{c.notes}</p>}
                {!c.mine && c.owner_name && <p className="text-[11px] text-muted/70 mt-1">De {c.owner_name}</p>}
                {c.auto_added && <p className="text-[11px] text-muted/70 mt-1">Añadido automáticamente al enviar</p>}
              </div>
              {c.can_edit && (
                <button className={`${btn} shrink-0`} onClick={() => setEditId(editId === c.id ? null : c.id)}>
                  {editId === c.id ? "Cerrar" : "Editar"}
                </button>
              )}
            </div>
            {editId === c.id && (
              <div className="border border-line p-3 space-y-4">
                <ContactForm
                  initial={{
                    name: c.name,
                    company: c.company || "",
                    job_title: c.job_title || "",
                    emails: c.emails.join(", "),
                    phone: c.phone || "",
                    notes: c.notes || "",
                  }}
                  submitLabel="Guardar cambios"
                  onSubmit={async (v) => {
                    await run((t) => updateContact(t, c.id, v), "Contacto actualizado.").catch(() => {});
                    setEditId(null);
                  }}
                />
                <div className="pt-3 border-t border-line">
                  <button
                    className={`${btn} !text-red-400 !border-red-400/50`}
                    onClick={async () => {
                      if (!window.confirm(`¿Eliminar a ${c.name}? No se puede deshacer.`)) return;
                      await run((t) => deleteContact(t, c.id), "Contacto eliminado.").catch(() => {});
                      setEditId(null);
                    }}
                  >
                    Eliminar contacto
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
