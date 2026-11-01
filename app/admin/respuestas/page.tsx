"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  MailTemplate,
  adminCreateTemplate,
  adminDeleteTemplate,
  adminGetTemplates,
  adminUpdateTemplate,
} from "@/lib/api";
import { getToken } from "@/lib/session";

const input =
  "w-full bg-transparent border border-line px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-paper";
const btn =
  "px-4 py-2 text-sm border border-line text-paper hover:border-paper transition-colors disabled:opacity-50";

function errMsg(e: unknown) {
  return e instanceof ApiError ? e.message : "Ha ocurrido un error";
}

export default function AdminRespuestasPage() {
  const [list, setList] = useState<MailTemplate[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState({ name: "", body: "", active: true });
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState({ name: "", body: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await adminGetTemplates(getToken()!);
      setList(all.filter((t) => t.quick));
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(ok);
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl text-paper">R.A. · Respuestas preparadas</h2>
          <p className="text-xs text-muted mt-1 max-w-md">
            Textos que todos los usuarios pueden elegir al responder a un correo. No se envían solos: se colocan en la
            respuesta y se pueden editar antes de enviar.
          </p>
        </div>
        <button className={btn} onClick={() => setCreating((v) => !v)}>
          {creating ? "Cancelar" : "Nueva"}
        </button>
      </div>

      {error && <p className="text-sm text-red-400 border border-red-400/40 px-3 py-2">{error}</p>}
      {notice && <p className="text-sm text-paper border border-line px-3 py-2">{notice}</p>}

      {creating && (
        <form
          className="space-y-3 max-w-xl border border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await adminCreateTemplate(getToken()!, {
                key: `ra_${Date.now()}`,
                name: fresh.name,
                subject: fresh.name,
                body: fresh.body,
                quick: true,
              });
              setFresh({ name: "", body: "" });
              setCreating(false);
            }, "Respuesta creada.");
          }}
        >
          <input className={input} placeholder="Nombre (ej. Recibido, lo reviso)" value={fresh.name} onChange={(e) => setFresh({ ...fresh, name: e.target.value })} />
          <textarea className={input} rows={7} placeholder="Texto de la respuesta" value={fresh.body} onChange={(e) => setFresh({ ...fresh, body: e.target.value })} />
          <button className={btn} disabled={busy}>Crear respuesta</button>
        </form>
      )}

      {list.length === 0 && !creating && <p className="text-sm text-muted">Todavía no hay respuestas preparadas.</p>}

      <ul className="divide-y divide-line border-y border-line">
        {list.map((t) => (
          <li key={t.id} className="py-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-paper">
                  {t.name} {!t.active && <span className="text-xs text-muted">(desactivada)</span>}
                </p>
                <p className="text-xs text-muted mt-1 line-clamp-2 whitespace-pre-line">{t.body}</p>
              </div>
              <button
                className={btn}
                onClick={() => {
                  if (editing === t.id) return setEditing(null);
                  setEditing(t.id);
                  setDraft({ name: t.name, body: t.body, active: t.active });
                  setNotice(null);
                  setError(null);
                }}
              >
                {editing === t.id ? "Cerrar" : "Editar"}
              </button>
            </div>

            {editing === t.id && (
              <div className="space-y-3 max-w-xl">
                <input className={input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                <textarea className={input} rows={8} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                  Activa
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={btn}
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          adminUpdateTemplate(getToken()!, t.id, {
                            name: draft.name,
                            subject: draft.name,
                            body: draft.body,
                            active: draft.active,
                            quick: true,
                          }),
                        "Respuesta guardada."
                      )
                    }
                  >
                    Guardar
                  </button>
                  <button
                    className={`${btn} hover:border-red-400 hover:text-red-400`}
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm("¿Eliminar esta respuesta?")) return;
                      setEditing(null);
                      run(() => adminDeleteTemplate(getToken()!, t.id), "Respuesta eliminada.");
                    }}
                  >
                    Eliminar
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
