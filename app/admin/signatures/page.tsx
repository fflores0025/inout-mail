"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  MailboxSignature,
  SignatureUser,
  adminSetGroupSignature,
  adminSetMailboxSignature,
  adminGetSignatures,
  adminSetJobTitle,
  adminSetSignatureFooter,
} from "@/lib/api";
import { getToken } from "@/lib/session";

const input =
  "w-full bg-transparent border border-line px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-paper";

function preview(name: string, title: string) {
  const t = title.trim();
  if (!t) return "";
  return [name, t].join("\n");
}

export default function AdminSignaturesPage() {
  const [users, setUsers] = useState<SignatureUser[]>([]);
  const [titles, setTitles] = useState<Record<number, string>>({});
  const [footer, setFooter] = useState("");
  const [boxes, setBoxes] = useState<MailboxSignature[]>([]);
  const [boxSigs, setBoxSigs] = useState<Record<number, string>>({});
  const [boxOnly, setBoxOnly] = useState<Record<number, boolean>>({});
  const [groups, setGroups] = useState<{ id: number; name: string; address: string; signature: string }[]>([]);
  const [groupSigs, setGroupSigs] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingFooter, setSavingFooter] = useState(false);

  const errMsg = (err: unknown) =>
    err instanceof ApiError ? err.message : "No se pudo conectar con el servidor";

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const data = await adminGetSignatures(token);
      setUsers(data.users);
      setFooter(data.footer || "");
      const t: Record<number, string> = {};
      data.users.forEach((u) => {
        t[u.id] = u.job_title || "";
      });
      setTitles(t);
      const list = data.mailboxes || [];
      setBoxes(list);
      const gl = data.groups || [];
      setGroups(gl);
      setGroupSigs(Object.fromEntries(gl.map((g) => [g.id, g.signature || ""])));
      setBoxSigs(Object.fromEntries(list.map((m) => [m.id, m.signature || ""])));
      setBoxOnly(Object.fromEntries(list.map((m) => [m.id, !!m.signature_only])));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveFooter(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setSavingFooter(true);
    setError(null);
    setNotice(null);
    try {
      await adminSetSignatureFooter(token, footer);
      setNotice("Pie de firma guardado.");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSavingFooter(false);
    }
  }

  async function saveTitle(u: SignatureUser) {
    const token = getToken();
    if (!token) return;
    setError(null);
    setNotice(null);
    try {
      await adminSetJobTitle(token, u.id, titles[u.id] || "");
      setNotice(`Cargo de ${u.full_name} guardado.`);
    } catch (err) {
      setError(errMsg(err));
    }
  }

  async function saveBoxSig(m: MailboxSignature) {
    const token = getToken();
    if (!token) return;
    setError(null);
    setNotice(null);
    try {
      await adminSetMailboxSignature(token, m.id, boxSigs[m.id] || "", !!boxOnly[m.id]);
      setNotice(`Firma de ${m.display_name} guardada.`);
    } catch (err) {
      setError(errMsg(err));
    }
  }

  async function saveGroupSig(g: { id: number; name: string }) {
    const token = getToken();
    if (!token) return;
    setError(null);
    setNotice(null);
    try {
      await adminSetGroupSignature(token, g.id, groupSigs[g.id] || "");
      setNotice(`Firma del grupo ${g.name} guardada.`);
    } catch (err) {
      setError(errMsg(err));
    }
  }

  return (
    <div className="space-y-10">
      {error && <p className="text-sm text-red-400 border border-red-400/40 px-3 py-2">{error}</p>}
      {notice && <p className="text-sm text-paper border border-line px-3 py-2">{notice}</p>}

      <form onSubmit={saveFooter} className="space-y-3 max-w-md">
        <h2 className="font-display text-xl text-paper">Pie común de la firma</h2>
        <p className="text-xs text-muted">
          Sale siempre al final de todos los correos que se envían (por ejemplo: empresa, teléfono, web).
        </p>
        <textarea
          value={footer}
          onChange={(e) => setFooter(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder={"InOut Media\nwww.inout-media.es"}
          className={`${input} resize-none`}
        />
        <button
          type="submit"
          disabled={savingFooter}
          className="px-4 py-2 text-sm border border-paper text-paper hover:bg-paper hover:text-ink transition-colors disabled:opacity-50"
        >
          {savingFooter ? "Guardando…" : "Guardar pie"}
        </button>
      </form>

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl text-paper">Firma de cada buzón</h2>
          <p className="text-xs text-muted mt-1">
            Aquí salen los buzones departamentales y los que no tienen un titular. Esta firma sale siempre al
            enviar desde el buzón. Antes de enviar, quien escribe elige si añade también su firma personal.
            Déjala vacía si ese buzón no lleva firma propia.
          </p>
        </div>
        {boxes.length === 0 && !loading && <p className="text-sm text-muted">No hay buzones.</p>}
        <ul className="divide-y divide-line border-y border-line">
          {boxes.map((m) => (
            <li key={m.id} className="py-4 space-y-2">
              <div>
                <p className="text-sm text-paper">{m.display_name}</p>
                <p className="text-xs text-muted break-all">{m.email}</p>
              </div>
              <textarea
                value={boxSigs[m.id] || ""}
                onChange={(e) => setBoxSigs((p) => ({ ...p, [m.id]: e.target.value }))}
                rows={2}
                maxLength={1000}
                placeholder="Ej. Departamento Comercial de InOut Media"
                className={`${input} resize-none`}
              />
              <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!boxOnly[m.id]}
                  onChange={(e) => setBoxOnly((p) => ({ ...p, [m.id]: e.target.checked }))}
                />
                Nunca añadir firma personal en este buzón (no pregunta al enviar)
              </label>
              <button
                onClick={() => saveBoxSig(m)}
                className="px-4 py-2 text-sm border border-line text-paper hover:border-paper transition-colors"
              >
                Guardar firma
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl text-paper">Firma de cada grupo</h2>
          <p className="text-xs text-muted mt-1">
            Los miembros de un grupo pueden enviar como el grupo al redactar (elegir &quot;Desde grupo&quot;). Sale
            esta firma y debajo la firma personal de quien envía.
          </p>
        </div>
        {groups.length === 0 && !loading && <p className="text-sm text-muted">Todavía no hay grupos.</p>}
        <ul className="divide-y divide-line border-y border-line">
          {groups.map((g) => (
            <li key={g.id} className="py-4 space-y-2">
              <div>
                <p className="text-sm text-paper">{g.name}</p>
                <p className="text-xs text-muted break-all">{g.address}</p>
              </div>
              <textarea
                value={groupSigs[g.id] || ""}
                onChange={(e) => setGroupSigs((p) => ({ ...p, [g.id]: e.target.value }))}
                rows={2}
                maxLength={1000}
                placeholder="Ej. Departamento Comercial de InOut Media"
                className={`${input} resize-none`}
              />
              <button
                onClick={() => saveGroupSig(g)}
                className="px-4 py-2 text-sm border border-line text-paper hover:border-paper transition-colors"
              >
                Guardar firma
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-xl text-paper">Cargo y datos de cada usuario</h2>
        <p className="text-xs text-muted mt-1 mb-4">
          Puedes escribir varias líneas: cargo, extensión, teléfono directo… Salen debajo del nombre en su firma.
        </p>
        {loading && <p className="text-sm text-muted">Cargando…</p>}
        <ul className="divide-y divide-line border-y border-line">
          {users.map((u) => {
            const text = preview(u.full_name, titles[u.id] || "");
            return (
              <li key={u.id} className="py-4 space-y-2">
                <div>
                  <p className="text-sm text-paper">{u.full_name}</p>
                  <p className="text-xs text-muted break-all">{u.login_email}</p>
                </div>
                <textarea
                  value={titles[u.id] || ""}
                  onChange={(e) => setTitles((p) => ({ ...p, [u.id]: e.target.value }))}
                  rows={3}
                  maxLength={600}
                  placeholder={"Cargo (ej. Director comercial)\nExtensión 101 · Tel. 936 942 696"}
                  className={`${input} resize-none`}
                />
                <button
                  onClick={() => saveTitle(u)}
                  className="px-4 py-2 text-sm border border-line text-paper hover:border-paper transition-colors"
                >
                  Guardar
                </button>
                {text && (
                  <pre className="whitespace-pre-wrap text-xs text-muted/80 border-l border-line pl-3 font-body">
                    {text}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
