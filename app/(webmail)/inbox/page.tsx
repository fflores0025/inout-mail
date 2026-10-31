"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  getMailboxes,
  sortMailboxes,
  getMessages,
  getMessage,
  FOLDERS,
  moveMessage,
  deleteMessage,
  saveDraft,
  sendMessage,
  getMySignature,
  getSenders,
  getContacts,
  Contacts,
  Sender,
  Message,
  FullMessage,
  ApiError,
} from "@/lib/api";
import { getToken, getUserFromToken } from "@/lib/session";

function formatDate(d: string | null | undefined) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function sortByDateDesc(list: Message[]) {
  return [...list].sort(
    (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
  );
}

type ComposeInit = { to: string; subject: string; body: string; draftUid?: number };

export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxContent />
    </Suspense>
  );
}

function InboxContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mailboxParam = searchParams.get("mailbox");
  const folder = (searchParams.get("folder") || "inbox") as string;
  const folderLabel = FOLDERS.find((f) => f.key === folder)?.label ?? "Bandeja de entrada";

  const [mailboxId, setMailboxId] = useState<string | null>(mailboxParam);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [compose, setCompose] = useState<ComposeInit | null>(null);

  const [opened, setOpened] = useState<FullMessage | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    async function load() {
      setOpened(null);
      let targetId = mailboxParam;
      if (!targetId) {
        const mailboxes = sortMailboxes(await getMailboxes(token!), getUserFromToken()?.email);
        targetId = mailboxes[0]?.id != null ? String(mailboxes[0].id) : null;
        setMailboxId(targetId);
      } else {
        setMailboxId(targetId);
      }
      if (!targetId) {
        setLoading(false);
        return;
      }
      const msgs = await getMessages(targetId, token!, folder);
      setMessages(sortByDateDesc(msgs));
      setLoading(false);
    }

    setLoading(true);
    load().catch(() => setLoading(false));
  }, [mailboxParam, folder, router]);

  function reload() {
    if (!mailboxId) return;
    const token = getToken()!;
    setLoading(true);
    getMessages(mailboxId, token, folder)
      .then((m) => setMessages(sortByDateDesc(m)))
      .finally(() => setLoading(false));
  }

  async function openMessage(uid: number) {
    if (!mailboxId) return;
    const token = getToken();
    if (!token) return;
    setOpening(true);
    setOpenError(null);
    try {
      const full = await getMessage(mailboxId, uid, token, folder);
      if (folder === "drafts") {
        setCompose({ to: full.to || "", subject: full.subject || "", body: full.text || "", draftUid: uid });
        return;
      }
      setOpened(full);
      setMessages((prev) => prev.map((m) => (m.uid === uid ? { ...m, seen: true } : m)));
    } catch (err) {
      setOpenError(err instanceof ApiError ? err.message : "No se pudo abrir el mensaje");
    } finally {
      setOpening(false);
    }
  }

  async function removeOpened(m: FullMessage) {
    if (!mailboxId) return;
    if (folder === "trash" && !window.confirm("¿Eliminar definitivamente este correo?")) return;
    try {
      await deleteMessage(mailboxId, m.uid, folder, getToken()!);
      setOpened(null);
      reload();
    } catch (err) {
      setOpenError(err instanceof ApiError ? err.message : "No se pudo eliminar");
      setOpened(null);
    }
  }

  async function moveOpened(m: FullMessage, to: string) {
    if (!mailboxId) return;
    try {
      await moveMessage(mailboxId, m.uid, folder, to, getToken()!);
      setOpened(null);
      reload();
    } catch (err) {
      setOpenError(err instanceof ApiError ? err.message : "No se pudo mover");
      setOpened(null);
    }
  }

  function startReply(m: FullMessage) {
    const subject = /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`;
    const when = m.date ? new Date(m.date).toLocaleString("es-ES") : "";
    const who = m.from_name ? `${m.from_name} <${m.from}>` : m.from;
    const quoted = (m.text || "")
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    setCompose({
      to: m.reply_to || m.from,
      subject,
      body: `\n\nEl ${when}, ${who} escribió:\n${quoted}`,
    });
  }

  // Deslizar de lado para salir del correo abierto
  const swipeHandlers = {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      swipeStart.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s0 = swipeStart.current;
      swipeStart.current = null;
      if (!s0 || compose) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s0.x;
      const dy = t.clientY - s0.y;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) setOpened(null);
    },
  };

  // ---------- Vista de mensaje abierto ----------
  if (opened) {
    const srcDoc = opened.html
      ? `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><base target="_blank"><style>body{font-family:system-ui,sans-serif;font-size:14px;color:#111;margin:12px;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>${opened.html}</body></html>`
      : null;

    return (
      <main className="h-full overflow-y-auto relative" {...swipeHandlers}>
        {/* Franja del borde izquierdo: permite deslizar tambien sobre correos con imagenes/HTML */}
        <div className="md:hidden fixed left-0 top-14 bottom-0 w-6 z-20" {...swipeHandlers} />
        <div className="px-6 sm:px-8 py-4 border-b border-line flex items-center justify-between gap-3">
          <button onClick={() => setOpened(null)} className="text-sm text-muted hover:text-paper">
            ← Volver
          </button>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {(folder === "trash" || folder === "junk") && (
              <button
                onClick={() => moveOpened(opened, "inbox")}
                className="px-3 py-2 text-sm border border-line text-muted hover:border-paper hover:text-paper transition-colors shrink-0"
              >
                Recuperar
              </button>
            )}
            {folder === "inbox" && (
              <button
                onClick={() => moveOpened(opened, "junk")}
                className="px-3 py-2 text-sm border border-line text-muted hover:border-paper hover:text-paper transition-colors shrink-0"
              >
                Spam
              </button>
            )}
            <button
              onClick={() => removeOpened(opened)}
              className="px-3 py-2 text-sm border border-line text-muted hover:border-red-400 hover:text-red-400 transition-colors shrink-0"
            >
              {folder === "trash" ? "Eliminar definitivamente" : "Eliminar"}
            </button>
            <button
              onClick={() => startReply(opened)}
              className="px-4 py-2 text-sm border border-paper text-paper hover:bg-paper hover:text-ink transition-colors shrink-0"
            >
              Responder
            </button>
          </div>
        </div>

        <div className="px-6 sm:px-8 py-5 border-b border-line space-y-1">
          <h1 className="font-display text-2xl text-paper break-words">{opened.subject}</h1>
          <p className="text-sm text-paper break-words">
            {opened.from_name ? `${opened.from_name} ` : ""}
            <span className="text-muted">&lt;{opened.from}&gt;</span>
          </p>
          <p className="text-xs text-muted break-words">Para: {opened.to}</p>
          {opened.cc && <p className="text-xs text-muted break-words">Cc: {opened.cc}</p>}
          <p className="text-xs text-muted">
            {opened.date ? new Date(opened.date).toLocaleString("es-ES") : ""}
          </p>
        </div>

        <div className="px-6 sm:px-8 py-5">
          {srcDoc ? (
            <iframe
              title="Mensaje"
              sandbox=""
              srcDoc={srcDoc}
              className="w-full bg-white"
              style={{ height: "65vh", border: 0 }}
            />
          ) : (
            <pre className="whitespace-pre-wrap break-words text-sm text-paper font-sans">
              {opened.text || "(mensaje vacío)"}
            </pre>
          )}

          {opened.attachments.length > 0 && (
            <p className="text-xs text-muted mt-4">
              Adjuntos: {opened.attachments.map((a) => a.filename).join(", ")} (descarga aún no disponible)
            </p>
          )}
        </div>

        {compose && mailboxId && (
          <ComposeModal
            mailboxId={mailboxId}
            initial={compose}
            onClose={() => {
              setCompose(null);
              if (folder === "drafts") reload();
            }}
            onSent={() => {
              setCompose(null);
              reload();
            }}
          />
        )}
      </main>
    );
  }

  // ---------- Lista ----------
  return (
    <main className="h-full overflow-y-auto relative">
      <div className="px-6 sm:px-8 py-6 border-b border-line flex items-center justify-between">
        <h1 className="font-display text-2xl text-paper">{folderLabel}</h1>
        <div className="flex items-center gap-4 shrink-0">
          {mailboxId && (
            <button
              onClick={() => setCompose({ to: "", subject: "", body: "" })}
              className="px-4 py-2 text-sm border border-paper text-paper hover:bg-paper hover:text-ink transition-colors shrink-0"
            >
              Redactar
            </button>
          )}
        </div>
      </div>

      {loading && <p className="px-6 sm:px-8 py-6 text-sm text-muted">Cargando mensajes…</p>}
      {openError && <p className="px-6 sm:px-8 py-3 text-sm text-red-400">{openError}</p>}
      {opening && <p className="px-6 sm:px-8 py-3 text-sm text-muted">Abriendo…</p>}

      {!loading && messages.length === 0 && (
        <p className="px-6 sm:px-8 py-6 text-sm text-muted">No hay mensajes en esta carpeta.</p>
      )}

      <ul className="divide-y divide-line">
        {messages.map((msg) => (
          <li
            key={msg.uid}
            onClick={() => openMessage(msg.uid)}
            className="px-6 sm:px-8 py-4 hover:bg-line/30 transition-colors cursor-pointer"
          >
            <div className="flex items-baseline justify-between gap-4">
              <span className={`text-sm truncate ${msg.seen ? "text-muted" : "text-paper font-medium"}`}>
                {folder === "sent" || folder === "drafts" ? `Para: ${msg.to}` : msg.from}
              </span>
              <span className="text-xs text-muted shrink-0">{formatDate(msg.date)}</span>
            </div>
            <p className={`text-sm mt-1 truncate ${msg.seen ? "text-muted" : "text-paper"}`}>
              {msg.subject}
            </p>
          </li>
        ))}
      </ul>

      {compose && mailboxId && (
        <ComposeModal
          mailboxId={mailboxId}
          initial={compose}
          onClose={() => {
            setCompose(null);
            if (folder === "drafts") reload();
          }}
          onSent={() => {
            setCompose(null);
            reload();
          }}
        />
      )}
    </main>
  );
}

const MAX_ATTACH_BYTES = 15 * 1024 * 1024;

type Attachment = { filename: string; content_type: string; data: string; size: number };

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ComposeModal({
  mailboxId,
  initial,
  onClose,
  onSent,
}: {
  mailboxId: string;
  initial: ComposeInit;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState(initial.to);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [signature, setSignature] = useState("");
  const [personal, setPersonal] = useState("");
  const [choice, setChoice] = useState(false);
  const [askPersonal, setAskPersonal] = useState(false);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [contacts, setContacts] = useState<Contacts>({ recent: [], directory: [] });
  const [fromGroup, setFromGroup] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    getMySignature(token, mailboxId, fromGroup ? Number(fromGroup) : null)
      .then((r) => {
        setSignature(r.signature);
        setPersonal(r.personal);
        setChoice(r.choice);
      })
      .catch(() => {
        setSignature("");
        setPersonal("");
        setChoice(false);
      });
  }, [mailboxId, fromGroup]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    getSenders(token)
      .then(setSenders)
      .catch(() => setSenders([]));
    getContacts(token)
      .then(setContacts)
      .catch(() => {});
  }, []);

  const totalBytes = attachments.reduce((sum, a) => sum + a.size, 0);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setError(null);
    let running = totalBytes;
    const added: Attachment[] = [];
    for (const file of files) {
      if (attachments.length + added.length >= 10) {
        setError("Máximo 10 adjuntos por correo");
        break;
      }
      if (running + file.size > MAX_ATTACH_BYTES) {
        setError(`Los adjuntos no pueden superar los ${formatSize(MAX_ATTACH_BYTES)} en total`);
        break;
      }
      try {
        const data = await readAsBase64(file);
        added.push({
          filename: file.name,
          content_type: file.type || "application/octet-stream",
          data,
          size: file.size,
        });
        running += file.size;
      } catch {
        setError(`No se pudo leer ${file.name}`);
      }
    }
    if (added.length > 0) setAttachments((prev) => [...prev, ...added]);
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (choice) {
      setAskPersonal(true);
      return;
    }
    doSend("omit");
  }

  // Al cerrar con texto sin enviar, se guarda como borrador
  async function closeAndSave() {
    const changed = to.trim() !== initial.to || subject.trim() !== initial.subject || body.trim() !== initial.body.trim();
    const hasContent = to.trim() || subject.trim() || body.trim();
    if (hasContent && (changed || initial.draftUid)) {
      try {
        await saveDraft(mailboxId, getToken()!, { to, subject, text: body, replace_uid: initial.draftUid });
      } catch {
        /* si falla, se cierra igualmente */
      }
    } else if (initial.draftUid && !hasContent) {
      await saveDraft(mailboxId, getToken()!, { discard_uid: initial.draftUid }).catch(() => {});
    }
    onClose();
  }

  async function doSend(mode: "include" | "omit") {
    setAskPersonal(false);
    setSending(true);
    setError(null);
    try {
      const token = getToken()!;
      await sendMessage(mailboxId, token, {
        to,
        subject,
        text: body,
        attachments: attachments.map(({ filename, content_type, data }) => ({ filename, content_type, data })),
        personal_signature: mode,
        from_group_id: fromGroup ? Number(fromGroup) : undefined,
      });
      if (initial.draftUid) {
        await saveDraft(mailboxId, token, { discard_uid: initial.draftUid }).catch(() => {});
      }
      onSent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar el mensaje");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
      <div className="bg-ink border border-line w-full sm:max-w-lg flex flex-col max-h-[85dvh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <h2 className="font-display text-lg text-paper">
            {initial.draftUid ? "Borrador" : initial.to ? "Responder" : "Nuevo mensaje"}
          </h2>
          <button onClick={closeAndSave} className="text-muted hover:text-paper">
            ✕
          </button>
        </div>

        <form onSubmit={handleSend} className="p-5 space-y-3 overflow-y-auto">
          {error && <p className="text-sm text-red-400">{error}</p>}
          {senders.length > 0 && (
            <select
              value={fromGroup}
              onChange={(e) => setFromGroup(e.target.value)}
              className="w-full bg-ink border border-line px-3 py-2 text-sm text-paper focus:outline-none focus:border-paper"
            >
              <option value="">Desde: este buzón</option>
              {senders.map((g) => (
                <option key={g.id} value={g.id}>
                  Desde grupo: {g.name} ({g.address})
                </option>
              ))}
            </select>
          )}
          <RecipientInput value={to} onChange={setTo} contacts={contacts} />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Asunto"
            className="w-full bg-transparent border border-line px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-paper"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escribe tu mensaje…"
            rows={10}
            required={attachments.length === 0}
            className="w-full bg-transparent border border-line px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-paper resize-none"
          />

          {signature && (
            <div className="space-y-1">
              <p className="text-xs text-muted">Firma y pie que saldrán siempre en este correo:</p>
              <pre className="whitespace-pre-wrap text-xs text-muted/80 border-l border-line pl-3 font-body">
                {signature}
              </pre>
            </div>
          )}

          {attachments.length > 0 && (
            <ul className="divide-y divide-line border-y border-line">
              {attachments.map((a, i) => (
                <li key={`${a.filename}-${i}`} className="py-2 flex items-center justify-between gap-3">
                  <span className="text-xs text-paper truncate">
                    {a.filename} <span className="text-muted">({formatSize(a.size)})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                    className="text-xs text-muted hover:text-paper shrink-0"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between gap-3">
            <button
              type="submit"
              disabled={sending}
              className="px-4 py-2 text-sm border border-paper text-paper hover:bg-paper hover:text-ink transition-colors disabled:opacity-50"
            >
              {sending ? "Enviando…" : "Enviar"}
            </button>
            <label className="px-4 py-2 text-sm border border-line text-paper hover:border-paper transition-colors cursor-pointer">
              Adjuntar archivo
              <input type="file" multiple onChange={handleFiles} className="hidden" />
            </label>
          </div>
          {attachments.length > 0 && (
            <p className="text-xs text-muted">
              {attachments.length} adjunto{attachments.length === 1 ? "" : "s"} · {formatSize(totalBytes)} de{" "}
              {formatSize(MAX_ATTACH_BYTES)}
            </p>
          )}
        </form>

        {askPersonal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
            <div className="bg-ink border border-line w-full max-w-md p-5 space-y-4">
              <h3 className="font-display text-lg text-paper">¿Aceptas que se envíe este correo con tu firma personal?</h3>
              <pre className="whitespace-pre-wrap text-xs text-muted/80 border-l border-line pl-3 font-body">
                {personal}
              </pre>
              <p className="text-xs text-muted">
                La firma del buzón y el pie de página salen siempre. Elige si además va tu firma personal.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => doSend("include")}
                  className="px-4 py-2 text-sm border border-paper text-paper hover:bg-paper hover:text-ink transition-colors"
                >
                  Enviar con mi firma personal
                </button>
                <button
                  type="button"
                  onClick={() => doSend("omit")}
                  className="px-4 py-2 text-sm border border-amber-400 text-amber-400 hover:bg-amber-400/10 transition-colors"
                >
                  Solo firma del buzón
                </button>
                <button
                  type="button"
                  onClick={() => setAskPersonal(false)}
                  className="px-4 py-2 text-sm border border-line text-muted hover:text-paper hover:border-paper transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


function RecipientInput({
  value,
  onChange,
  contacts,
}: {
  value: string;
  onChange: (v: string) => void;
  contacts: Contacts;
}) {
  const [open, setOpen] = useState(false);
  const parts = value.split(/[,;]/);
  const last = (parts[parts.length - 1] || "").trim().toLowerCase();
  const before = parts.slice(0, -1).map((x) => x.trim()).filter(Boolean);
  const already = new Set(before.map((x) => x.toLowerCase()));

  const match = (email: string, name?: string) =>
    !already.has(email) && (!last || email.includes(last) || (name || "").toLowerCase().includes(last));

  const mine = (contacts.mine || []).filter((c) => match(c.email, `${c.name} ${c.company}`)).slice(0, 8);
  const mineSet = new Set((contacts.mine || []).map((c) => c.email));
  const recent = contacts.recent.filter((e) => !mineSet.has(e) && match(e)).slice(0, 8);
  const usedSet = new Set([...mineSet, ...contacts.recent]);
  const directory = contacts.directory.filter((c) => !usedSet.has(c.email) && match(c.email, c.name));
  const hasAny = mine.length > 0 || recent.length > 0 || directory.length > 0;

  function pick(email: string) {
    onChange([...before, email].join(", "));
    setOpen(false);
  }

  const row =
    "w-full text-left px-3 py-2 text-sm text-paper hover:bg-line/40 focus:bg-line/40 focus:outline-none";

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        type="text"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Para (varias direcciones separadas por coma)"
        required
        className="w-full bg-transparent border border-line px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-paper"
      />
      {open && hasAny && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto bg-ink border border-line">
          {mine.length > 0 && (
            <>
              <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted">Contactos</p>
              {mine.map((c) => (
                <button
                  key={c.email}
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => pick(c.email)}
                  className={row}
                >
                  {c.name}
                  {(c.company || c.job_title) && (
                    <span className="text-xs text-muted"> · {[c.company, c.job_title].filter(Boolean).join(" · ")}</span>
                  )}
                  <span className="block text-xs text-muted break-all">{c.email}</span>
                </button>
              ))}
            </>
          )}
          {recent.length > 0 && (
            <>
              <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted">Enviados recientemente</p>
              {recent.map((e) => (
                <button key={e} type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => pick(e)} className={row}>
                  {e}
                </button>
              ))}
            </>
          )}
          {directory.length > 0 && (
            <>
              <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted">Directorio de InOut Media</p>
              {directory.map((c) => (
                <button
                  key={c.email}
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => pick(c.email)}
                  className={row}
                >
                  {c.name}
                  <span className="block text-xs text-muted break-all">{c.email}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
