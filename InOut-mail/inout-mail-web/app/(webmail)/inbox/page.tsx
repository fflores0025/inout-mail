"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getMailboxes, getMessages, Message } from "@/lib/api";
import { getToken } from "@/lib/session";

export default function InboxPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mailboxParam = searchParams.get("mailbox");

  const [mailboxId, setMailboxId] = useState<string | null>(mailboxParam);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

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
        targetId = mailboxes[0]?.id ?? null;
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

  return (
    <main className="h-screen overflow-y-auto">
      <div className="px-8 py-6 border-b border-line">
        <h1 className="font-display text-2xl text-paper">Bandeja de entrada</h1>
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
    </main>
  );
}
