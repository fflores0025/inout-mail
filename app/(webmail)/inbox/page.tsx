"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  getMailboxes,
  getMessages,
  getMessage,
  sendMessage,
  Message,
  FullMessage,
  ApiError,
} from "@/lib/api";
import { getToken } from "@/lib/session";

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

type ComposeInit = { to: string; subject: string; body: string };

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

  const [mailboxId, setMailboxId] = useState<string | null>(mailboxParam);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [compose, setCompose] = useState<ComposeInit | null>(null);

  const [opened, setOpened] = useState<FullMessage | null>(null);
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
        const mailboxes = await getMailboxes(token!);
        targetId = mailboxes[0]?.id != null ? String(mailboxes[0].id) : null;
        setMailboxId(targetId);
      } else {
        setMailboxId(targetId);
      }
      if (!targetId) {
        setLoading(false);
        return;
      }
      const msgs = await getMessages(targetId, token!);
      setMessages(sortByDateDesc(msgs));
      setLoading(false);
    }

    setLoading(true);
    load().catch(() => setLoading(false));
  }, [mailboxParam, router]);

  function reload() {
    if (!mailboxId) return;
    const token = getToken()!;
    setLoading(true);
    getMessages(mailboxId, token)
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
      const full = await getMessage(mailboxId, uid, token);
      setOpened(full);
      setMessages((prev) => prev.map((m) => (m.uid === uid ? { ...m, seen: true } : m)));
    } catch (err) {
      setOpenError(err instanceof ApiError ? err.message : "No se pudo abrir el mensaje");
    } finally {
      setOpening(false);
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

  // ---------- Vista de mensaje abierto ----------
  if (opened) {
    const srcDoc = opened.html
      ? `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><base target="_blank"><style>body{font-family:system-ui,sans-serif;font-size:14px;color:#111;margin:12px;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>${opened.html}</body></html>`
      : null;

    return (
      <main className="h-full overflow-y-auto relative">
        <div className="px-6 sm:px-8 py-4 border-b border-line flex items-center justify-between gap-3">
          <button onClick={() => setOpened(null)} className="text-sm text-muted hover:text-paper">
            ← Volver
          </button>
          <button
            onClick={() => startReply(opened)}
            className="px-4 py-2 text-sm border border-paper text-paper hover:bg-paper hover:text-ink transition-colors shrink-0"
          >
            Responder
          </button>
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
            onClose={() => setCompose(null)}
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
        <h1 className="font-display text-2xl text-paper">Bandeja de entrada</h1>
        <div className="flex items-center gap-4 shrink-0">
          <Link href="/account" className="text-sm text-muted hover:text-paper">
            Mi contraseña
          </Link>
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
        <p className="px-6 sm:px-8 py-6 text-sm text-muted">No hay mensajes en este buzón.</p>
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
                {msg.from}
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
          onClose={() => setCompose(null)}
          onSent={() => {
            setCompose(null);
            reload();
          }}
        />
      )}
    </main>
  );
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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const token = getToken()!;
      await sendMessage(mailboxId, token, { to, subject, text: body });
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
            {initial.to ? "Responder" : "Nuevo mensaje"}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-paper">
            ✕
          </button>
        </div>

        <form onSubmit={handleSend} className="p-5 space-y-3 overflow-y-auto">
          {error && <p className="text-sm text-red-400">{error}</p>}
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            type="email"
            placeholder="Para"
            required
            className="w-full bg-transparent border border-line px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-paper"
          />
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
            required
            className="w-full bg-transparent border border-line px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-paper resize-none"
          />
          <button
            type="submit"
            disabled={sending}
            className="px-4 py-2 text-sm border border-paper text-paper hover:bg-paper hover:text-ink transition-colors disabled:opacity-50"
          >
            {sending ? "Enviando…" : "Enviar"}
          </button>
        </form>
      </div>
    </div>
  );
}
