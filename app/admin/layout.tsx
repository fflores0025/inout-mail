"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getMe, Me, ApiError } from "@/lib/api";
import { clearToken, getToken } from "@/lib/session";

const ALL_TABS = [
  { href: "/admin/users", label: "Usuarios", superOnly: true },
  { href: "/admin/addresses", label: "Direcciones", superOnly: true },
  { href: "/admin/groups", label: "Grupos", superOnly: true },
  { href: "/admin/signatures", label: "Firmas", superOnly: true },
  { href: "/admin/templates", label: "Plantillas", superOnly: true },
  { href: "/admin/respuestas", label: "R.A.", superOnly: true },
  { href: "/admin/mailboxes", label: "Buzones", superOnly: false },
  { href: "/admin/audit", label: "Auditoría", superOnly: false },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    getMe(token)
      .then((user) => {
        if (user.role === "employee") {
          router.replace("/inbox");
          return;
        }
        setMe(user);
      })
      .catch((err) => {
        // Solo se cierra la sesion si el servidor dice que ya no vale
        if (err instanceof ApiError && err.status === 401) {
          clearToken();
          router.replace("/login");
        }
      });
  }, [router]);

  const isSuper = me?.role === "super_admin";
  const tabs = ALL_TABS.filter((t) => isSuper || !t.superOnly);

  useEffect(() => {
    if (me && !isSuper && ALL_TABS.some((t) => t.superOnly && pathname.startsWith(t.href))) {
      router.replace("/admin/mailboxes");
    }
  }, [me, isSuper, pathname, router]);

  if (!me) {
    return <p className="px-6 py-8 text-sm text-muted">Cargando…</p>;
  }

  const currentTab = tabs.find((t) => pathname.startsWith(t.href));

  return (
    <div className="min-h-dvh">
      <header className="px-6 sm:px-8 pt-6 pb-5 border-b border-line flex items-center gap-4">
        <button onClick={() => setMenuOpen(true)} aria-label="Abrir menú de administración" className="text-paper shrink-0">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
          </svg>
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-2xl text-paper truncate">
            {currentTab ? currentTab.label : "Administración"}
          </h1>
          <p className="text-xs text-muted mt-0.5">
            Administración · {isSuper ? "Super administrador" : "Director de departamento"}
          </p>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="w-72 max-w-[80%] bg-ink border-r border-line h-full flex flex-col">
            <div className="flex items-center justify-between px-5 py-5 border-b border-line">
              <span className="font-display text-xl text-paper">Administración</span>
              <button onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" className="text-muted hover:text-paper">
                ✕
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-2">
              {tabs.map((t) => {
                const active = pathname.startsWith(t.href);
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    onClick={() => setMenuOpen(false)}
                    className={`block px-5 py-3 text-lg font-display ${
                      active ? "text-paper bg-line/40" : "text-muted hover:text-paper hover:bg-line/30"
                    }`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-line py-2">
              <Link href="/inbox" className="block px-5 py-3 text-sm text-muted hover:text-paper">
                ← Volver al correo
              </Link>
              <Link href="/account" className="block px-5 py-3 text-sm text-muted hover:text-paper">
                Mi contraseña
              </Link>
            </div>
          </div>
          <div className="flex-1 bg-black/60" onClick={() => setMenuOpen(false)} />
        </div>
      )}

      <div className="px-6 sm:px-8 py-8 pb-16">{children}</div>
    </div>
  );
}
