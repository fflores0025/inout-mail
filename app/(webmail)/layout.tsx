"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getMailboxes, getUnread, sortMailboxes, Mailbox, ApiError, FOLDERS } from "@/lib/api";
import { getToken, clearToken, getUserFromToken } from "@/lib/session";
import PushToggle, { pushLogoutCleanup } from "@/components/PushToggle";
import { renewSessionIfNeeded } from "@/lib/refresh";

// Version corta del nombre de un buzon: DPO, SPO, F Flores...
function shortName(m: Mailbox): string {
  const full = m.display_name.trim();
  if (m.kind === "department") {
    const local = m.email.split("@")[0].toUpperCase();
    return local.length < full.length ? local : full;
  }
  const parts = full.split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0].toUpperCase()} ${parts[1]}`;
  return full;
}

function TopLabel({ mailbox }: { mailbox: Mailbox }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [short, setShort] = useState(false);
  const full = mailbox.display_name;

  useLayoutEffect(() => {
    function check() {
      const el = ref.current;
      if (!el) return;
      setShort(false);
      requestAnimationFrame(() => {
        if (ref.current && ref.current.scrollWidth > ref.current.clientWidth + 1) setShort(true);
      });
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [full]);

  return (
    <span
      ref={ref}
      title={full}
      className="ml-2 pl-2 border-l border-line text-sm text-muted truncate min-w-0"
    >
      {short ? shortName(mailbox) : full}
    </span>
  );
}

export default function WebmailLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [currentFolder, setCurrentFolder] = useState("inbox");

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    const user = getUserFromToken();
    setIsAdmin(!!user?.is_global_admin);

    renewSessionIfNeeded(token);

    const cur = new URLSearchParams(window.location.search).get("mailbox");
    setCurrentId(cur);
    setCurrentFolder(new URLSearchParams(window.location.search).get("folder") || "inbox");

    getMailboxes(token)
      .then((list) => {
        const sorted = sortMailboxes(list, user?.email);
        setMailboxes(sorted);
        // Si ya estas viendo uno de los otros buzones, se deja desplegada la lista
        if (cur && sorted.length > 0 && String(sorted[0].id) !== cur) setShowOthers(true);
      })
      .catch((err) => {
        // Solo se cierra la sesion si el servidor dice que ya no vale
        if (err instanceof ApiError && err.status === 401) {
          clearToken();
          router.replace("/login");
        }
      });
  }, [router]);

  // Contador de sin leer: icono de la app y numeros del menu
  useEffect(() => {
    let stop = false;
    async function refresh() {
      const token = getToken();
      if (!token || stop || document.visibilityState === "hidden") return;
      try {
        const u = await getUnread(token);
        if (stop) return;
        setUnread(u.by);
        const nav: any = navigator;
        if (u.total > 0 && nav.setAppBadge) nav.setAppBadge(u.total).catch(() => {});
        else if (nav.clearAppBadge) nav.clearAppBadge().catch(() => {});
      } catch {
        /* sin conexion: se reintenta en el siguiente ciclo */
      }
    }
    refresh();
    const t = setInterval(refresh, 45000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  async function handleLogout() {
    await pushLogoutCleanup();
    clearToken();
    router.replace("/login");
  }

  const current = mailboxes.find((m) => String(m.id) === currentId) ?? mailboxes[0];

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
        <span className="font-display text-lg text-paper ml-4 tracking-wide shrink-0">InOut Mail</span>
        {current && <TopLabel mailbox={current} />}
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
          {current && (
            <div className="pb-2 mb-2 border-b border-line">
              <p className="px-3 pb-1 text-[11px] uppercase tracking-wide text-muted/70 truncate">{current.display_name}</p>
              {FOLDERS.map((f) => (
                <a
                  key={f.key}
                  href={`/inbox?mailbox=${current.id}${f.key === "inbox" ? "" : `&folder=${f.key}`}`}
                  className={`flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-line/40 transition-colors ${
                    currentFolder === f.key ? "text-paper" : "text-muted"
                  }`}
                >
                  {f.label}
                  {f.key === "inbox" && unread[String(current.id)] > 0 && (
                    <span className="text-[11px] px-1.5 py-0.5 bg-paper text-ink rounded-sm">{unread[String(current.id)]}</span>
                  )}
                </a>
              ))}
            </div>
          )}
          {mailboxes.slice(0, 1).map((mb) => (
            <a
              key={mb.id}
              href={`/inbox?mailbox=${mb.id}`}
              className="block px-3 py-2 text-sm text-paper hover:bg-line/40 transition-colors"
            >
              <span className="flex items-center justify-between gap-2">
                {mb.display_name}
                {unread[String(mb.id)] > 0 && (
                  <span className="text-[11px] px-1.5 py-0.5 bg-paper text-ink rounded-sm">{unread[String(mb.id)]}</span>
                )}
              </span>
              <span className="block text-xs text-muted/70">{mb.email}</span>
            </a>
          ))}
          {mailboxes.length > 1 && (
            <>
              <button
                onClick={() => setShowOthers((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs uppercase tracking-wide text-muted hover:text-paper"
              >
                <span>Otros buzones ({mailboxes.length - 1})</span>
                <span>{showOthers ? "−" : "+"}</span>
              </button>
              {showOthers &&
                mailboxes.slice(1).map((mb) => (
                  <a
                    key={mb.id}
                    href={`/inbox?mailbox=${mb.id}`}
                    className={`block px-3 py-2 text-sm hover:text-paper hover:bg-line/40 transition-colors ${
                      currentId === String(mb.id) ? "text-paper" : "text-muted"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      {mb.display_name}
                      {unread[String(mb.id)] > 0 && (
                        <span className="text-[11px] px-1.5 py-0.5 bg-paper text-ink rounded-sm">{unread[String(mb.id)]}</span>
                      )}
                    </span>
                    <span className="block text-xs text-muted/70">{mb.email}</span>
                  </a>
                ))}
            </>
          )}
          {mailboxes.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted">Sin buzones asignados</p>
          )}
        </nav>

        <a
          href="/contacts"
          className="mx-4 mb-3 px-3 py-2 text-xs text-center text-muted border border-line hover:border-paper hover:text-paper transition-colors shrink-0"
        >
          Contactos
        </a>

        {isAdmin && (
          <a
            href="/admin"
            className="mx-4 mb-3 px-3 py-2 text-xs text-center text-muted border border-line hover:border-paper hover:text-paper transition-colors shrink-0"
          >
            Panel de administración
          </a>
        )}

        <PushToggle />

        <a
          href="/account"
          className="mx-4 mb-3 px-3 py-2 text-xs text-center text-muted border border-line hover:border-paper hover:text-paper transition-colors shrink-0"
        >
          Mi contraseña
        </a>

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
