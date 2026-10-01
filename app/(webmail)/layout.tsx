"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMailboxes, Mailbox } from "@/lib/api";
import { getToken, clearToken, getUserFromToken } from "@/lib/session";

export default function WebmailLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    const user = getUserFromToken();
    setIsAdmin(!!user?.is_global_admin);

    getMailboxes(token)
      .then(setMailboxes)
      .catch(() => router.replace("/login"));
  }, [router]);

  function handleLogout() {
    clearToken();
    router.replace("/login");
  }

  return (
    <div className="h-dvh overflow-hidden flex relative">
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 border-b border-line bg-ink z-30 flex items-center px-4">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Abrir menú"
          className="text-paper"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
          </svg>
        </button>
        <span className="font-display text-lg text-paper ml-4 tracking-wide">InOut Mail</span>
      </div>

      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`w-72 md:w-60 shrink-0 border-r border-line flex flex-col h-dvh overflow-y-auto fixed md:static top-0 left-0 z-50 bg-ink transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="px-5 py-6 border-b border-line flex items-center justify-between shrink-0">
          <span className="font-display text-xl text-paper tracking-wide">InOut Mail</span>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú"
            className="md:hidden text-muted"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {mailboxes.map((mb) => (
            <a
              key={mb.id}
              href={`/inbox?mailbox=${mb.id}`}
              className="block px-3 py-2 text-sm text-muted hover:text-paper hover:bg-line/40 transition-colors"
            >
              {mb.display_name}
              <span className="block text-xs text-muted/70">{mb.email}</span>
            </a>
          ))}
          {mailboxes.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted">Sin buzones asignados</p>
          )}
        </nav>

        {isAdmin && (
          <a
            href="/admin"
            className="mx-4 mb-3 px-3 py-2 text-xs text-center text-muted border border-line hover:border-paper hover:text-paper transition-colors shrink-0"
          >
            Panel de administración
          </a>
        )}

        <button
          onClick={handleLogout}
          className="mx-4 mb-5 py-2 text-xs text-muted border border-line hover:border-paper hover:text-paper transition-colors shrink-0"
        >
          Cerrar sesión
        </button>
      </aside>

      <div className="flex-1 min-w-0 pt-14 md:pt-0 h-dvh overflow-y-auto">{children}</div>
    </div>
  );
}
