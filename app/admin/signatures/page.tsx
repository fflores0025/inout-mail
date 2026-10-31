"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  SignatureUser,
  adminGetSignatures,
  adminSetJobTitle,
  adminSetSignatureFooter,
} from "@/lib/api";
import { getToken } from "@/lib/session";

const input =
  "w-full bg-transparent border border-line px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-paper";

function preview(name: string, title: string, footer: string) {
  const t = title.trim();
  const f = footer.trim();
  if (!t && !f) return "";
  return ["-- ", name, ...(t ? [t] : []), ...(f ? [f] : [])].join("\n");
}

export default function AdminSignaturesPage() {
  const [users, setUsers] = useState<SignatureUser[]>([]);
  const [titles, setTitles] = useState<Record<number, string>>({});
  const [footer, setFooter] = useState("");
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

  return (
    <div className="space-y-10">
      {error && <p className="text-sm text-red-400 border border-red-400/40 px-3 py-2">{error}</p>}
      {notice && <p className="text-sm text-paper border border-line px-3 py-2">{notice}</p>}

      <form onSubmit={saveFooter} className="space-y-3 max-w-md">
        <h2 className="font-display text-xl text-paper">Pie común de la firma</h2>
        <p className="text-xs text-muted">
          Se añade debajo del nombre y el cargo en todas las firmas (por ejemplo: empresa, teléfono, web).
          La firma es opcional: cada persona puede quitarla al redactar un correo.
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

      <section>
        <h2 className="font-display text-xl text-paper mb-4">Cargo de cada usuario</h2>
        {loading && <p className="text-sm text-muted">Cargando…</p>}
        <ul className="divide-y divide-line border-y border-line">
          {users.map((u) => {
            const text = preview(u.full_name, titles[u.id] || "", footer);
            return (
              <li key={u.id} className="py-4 space-y-2">
                <div>
                  <p className="text-sm text-paper">{u.full_name}</p>
                  <p className="text-xs text-muted break-all">{u.login_email}</p>
                </div>
                <div className="flex gap-2">
                  <input
                    value={titles[u.id] || ""}
                    onChange={(e) => setTitles((p) => ({ ...p, [u.id]: e.target.value }))}
                    maxLength={120}
                    placeholder="Cargo (ej. Director comercial)"
                    className={input}
                  />
                  <button
                    onClick={() => saveTitle(u)}
                    className="px-4 py-2 text-sm border border-line text-paper hover:border-paper transition-colors shrink-0"
                  >
                    Guardar
                  </button>
                </div>
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
