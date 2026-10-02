"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getMailboxes, getMessages, sendMessage, Message, ApiError } from "@/lib/api";
import { getToken } from "@/lib/session";

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
  const [composeOpen, setComposeOpen] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    async function load() {
      let targetId = mailboxParam;
      if (!targetId) {
        const mailboxes = await getMailboxes(token!);
        targetId = mailboxes[0]?.id != null ? String(mailboxes[0].id) : null;
        setMailboxId(targetId);
      }
      if (!targetId) {
        setLoading(false);
        return;
      }
      const msgs = await getMessages(targetId, token!);
      setMessages(msgs);
      setLoading(false);
    }

    load().catch(() => setLoading(false));
  }, [mailboxParam, router]);

  function reload() {
    if (!mailboxId) return;
    const token = getToken()!;
    setLoading(true);
    getMessages(mailboxId, token)
      .then(setMessages)
      .finally(() => setLoading(false));
  }

  return (
    <main className="h-full overflow-y-auto relative">
      <div className="px-8 py-6 border-b border-line flex items-center justify-between">
        <h1 className="font-display text-2xl text-paper">Bandeja de entrada</h1>
        {mailboxId && (
          <button
            onClick={() => setComposeOpen(true)}
            className="px-4 py-2 text-sm border border-paper text-paper hover:bg-paper hover:text-ink transition-colors shrink-0"
          >
            Redactar
          </button>
        )}
      </div>

      {loading && <p className="px-8 py-6 text-sm text-muted">Cargando mensajes…</p>}

      {!loading && messages.length === 0 && (
        <p className="px-8 py-6 text-sm text-muted">No hay mensajes en este buzón.</p>
      )}

      <ul className="divide-y divide-line">
        {messages.map((msg) => (
          <li
            key={msg.uid}
            className="px-8 py-4 hover:bg-line/30 transition-colors cursor-pointer"
          >
            <div className="flex items-baseline justify-between gap-4">
              <span className={`text-sm ${msg.seen ? "text-muted" : "text-paper"}`}>
                {msg.from}
              </span>
              <span className="text-xs text-muted shrink-0">{msg.date}</span>
            </div>
            <p className={`text-sm mt-1 ${msg.seen ? "text-muted" : "text-paper"}`}>
              {msg.subject}
            </p>
            <p className="text-xs text-muted mt-1 truncate">{msg.snippet}</p>
          </li>
        ))}
      </ul>

      {composeOpen && mailboxId && (
        <ComposeModal
          mailboxId={mailboxId}
          onClose={() => setComposeOpen(false)}
          onSent={() => {
            setComposeOpen(false);
            reload();
          }}
        />
      )}
    </main>
  );
}

function ComposeModal({
  mailboxId,
  onClose,
  onSent,
}: {
  mailboxId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
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
      <div className="bg-ink border border-line w-full sm:max-w-lg flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <h2 className="font-display text-lg text-paper">Nuevo mensaje</h2>
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
            rows={8}
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
