"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  MailTemplate,
  adminCreateTemplate,
  adminDeleteTemplate,
  adminGetTemplates,
  adminTestTemplate,
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

const VARS = ["nombre", "evento", "fecha", "cantidad", "importe", "saldo", "gastado", "enlace", "contacto"];

// Campos de asunto y texto con botones para colocar los huecos {…} donde esté el cursor
function Fields({
  v,
  set,
}: {
  v: { subject: string; body: string };
  set: (next: { subject: string; body: string }) => void;
}) {
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const last = useRef<"subject" | "body">("body");
  const [custom, setCustom] = useState<string[]>([]);
  const [extra, setExtra] = useState("");

  function insert(name: string) {
    const tag = `{${name}}`;
    const field = last.current;
    const el = field === "subject" ? subjectRef.current : bodyRef.current;
    const text = field === "subject" ? v.subject : v.body;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + tag + text.slice(end);
    set(field === "subject" ? { ...v, subject: next } : { ...v, body: next });
    setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  }

  function addCustom() {
    const n = extra.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (n && !VARS.includes(n) && !custom.includes(n)) setCustom([...custom, n]);
    setExtra("");
  }

  const chip =
    "px-2.5 py-1 text-xs border border-line text-muted hover:border-paper hover:text-paper transition-colors rounded-full";

  return (
    <div className="space-y-3">
      <input
        ref={subjectRef}
        className={input}
        placeholder="Asunto"
        value={v.subject}
        onFocus={() => (last.current = "subject")}
        onChange={(e) => set({ ...v, subject: e.target.value })}
      />
      <textarea
        ref={bodyRef}
        className={input}
        rows={8}
        placeholder="Texto del correo"
        value={v.body}
        onFocus={() => (last.current = "body")}
        onChange={(e) => set({ ...v, body: e.target.value })}
      />
      <div className="space-y-2">
        <p className="text-xs text-muted">Toca un hueco para colocarlo donde tengas el cursor (asunto o texto):</p>
        <div className="flex flex-wrap gap-2">
          {[...VARS, ...custom].map((n) => (
            <button key={n} type="button" className={chip} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(n)}>
              {`{${n}}`}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className={input}
            placeholder="Otro hueco propio (ej. mesa)"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <button type="button" className={`${btn} shrink-0`} onClick={addCustom}>
            Añadir
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminTemplatesPage() {
  const [list, setList] = useState<MailTemplate[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState({ name: "", subject: "", body: "", active: true, quick: false });
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState({ key: "", name: "", subject: "", body: "", quick: false });
  const [testTo, setTestTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await adminGetTemplates(getToken()!));
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(t: MailTemplate) {
    setEditing(t.id);
    setDraft({ name: t.name, subject: t.subject, body: t.body, active: t.active, quick: !!t.quick });
    setNotice(null);
    setError(null);
  }

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
          <h2 className="font-display text-xl text-paper">Plantillas de No Reply</h2>
          <p className="text-xs text-muted mt-1 max-w-md">
            Correos ya escritos que las apps envían desde no_reply. Usa huecos entre llaves, por ejemplo{" "}
            {"{nombre}"}, {"{importe}"} o {"{saldo}"}: la app los rellena al enviar. Con Nueva creas las que quieras.
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
              await adminCreateTemplate(getToken()!, fresh);
              setFresh({ key: "", name: "", subject: "", body: "", quick: false });
              setCreating(false);
            }, "Plantilla creada.");
          }}
        >
          <input className={input} placeholder="Identificador (ej. recibo_recarga)" value={fresh.key} onChange={(e) => setFresh({ ...fresh, key: e.target.value })} />
          <input className={input} placeholder="Nombre (ej. Recibo de recarga)" value={fresh.name} onChange={(e) => setFresh({ ...fresh, name: e.target.value })} />
          <Fields v={fresh} set={(n) => setFresh({ ...fresh, ...n })} />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={fresh.quick} onChange={(e) => setFresh({ ...fresh, quick: e.target.checked })} />
            Disponible como respuesta rápida al redactar
          </label>
          <button className={btn} disabled={busy}>Crear plantilla</button>
        </form>
      )}

      {list.length === 0 && !creating && <p className="text-sm text-muted">Todavía no hay plantillas.</p>}

      <ul className="divide-y divide-line border-y border-line">
        {list.map((t) => (
          <li key={t.id} className="py-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-paper">
                  {t.name} {!t.active && <span className="text-xs text-muted">(desactivada)</span>}{t.quick && <span className="text-xs text-muted"> · respuesta rápida</span>}
                </p>
                <p className="text-xs text-muted break-all">{t.key}</p>
              </div>
              <button className={btn} onClick={() => (editing === t.id ? setEditing(null) : startEdit(t))}>
                {editing === t.id ? "Cerrar" : "Editar"}
              </button>
            </div>

            {editing === t.id && (
              <div className="space-y-3 max-w-xl">
                <input className={input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                <Fields v={draft} set={(n) => setDraft({ ...draft, ...n })} />
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input type="checkbox" checked={draft.quick} onChange={(e) => setDraft({ ...draft, quick: e.target.checked })} />
                  Disponible como respuesta rápida al redactar
                </label>
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                  Activa
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={btn}
                    disabled={busy}
                    onClick={() => run(() => adminUpdateTemplate(getToken()!, t.id, draft), "Plantilla guardada.")}
                  >
                    Guardar
                  </button>
                  <button
                    className={`${btn} hover:border-red-400 hover:text-red-400`}
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm("¿Eliminar esta plantilla?")) return;
                      setEditing(null);
                      run(() => adminDeleteTemplate(getToken()!, t.id), "Plantilla eliminada.");
                    }}
                  >
                    Eliminar
                  </button>
                </div>
                <div className="flex gap-2 pt-1">
                  <input className={input} placeholder="Enviar prueba a… (correo)" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                  <button
                    className={`${btn} shrink-0`}
                    disabled={busy || !testTo.trim()}
                    onClick={() => run(() => adminTestTemplate(getToken()!, t.id, testTo.trim()), "Prueba enviada.")}
                  >
                    Probar
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
