"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMailboxes, Mailbox } from "@/lib/api";
import { getToken, clearToken } from "@/lib/session";

export default function WebmailLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    getMailboxes(token)
      .then(setMailboxes)
      .catch(() => router.replace("/login"));
  }, [router]);

  function handleLogout() {
    clearToken();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 border-r border-line flex flex-col">
        <div className="px-5 py-6 border-b border-line">
          <span className="font-display text-xl text-paper tracking-wide">InOut Mail</span>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {mailboxes.map((mb) => (
            <a
              key={mb.id}
              href={`/inbox?mailbox=${mb.id}`}
              className="block px-3 py-2 text-sm text-muted hover:text-paper hover:bg-line/40 transition-colors"
            >
              {mb.display_name}
              <span className="block text-xs text-muted/70">{mb.address}</span>
            </a>
          ))}
          {mailboxes.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted">Sin buzones asignados</p>
          )}
        </nav>

        <button
          onClick={handleLogout}
          className="mx-4 mb-5 py-2 text-xs text-muted border border-line hover:border-paper hover:text-paper transition-colors"
        >
          Cerrar sesión
        </button>
      </aside>

      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
