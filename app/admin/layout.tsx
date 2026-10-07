"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getMe, Me } from "@/lib/api";
import { clearToken, getToken } from "@/lib/session";

const ALL_TABS = [
  { href: "/admin/users", label: "Usuarios", superOnly: true },
  { href: "/admin/addresses", label: "Direcciones", superOnly: true },
  { href: "/admin/mailboxes", label: "Buzones", superOnly: false },
  { href: "/admin/audit", label: "Auditoría", superOnly: false },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);

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
      .catch(() => {
        clearToken();
        router.replace("/login");
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

  return (
    <div className="min-h-dvh">
      <header className="px-6 sm:px-8 pt-8 pb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-paper">Administración</h1>
          <p className="text-xs text-muted mt-1">
            InOut Mail · {isSuper ? "Super administrador" : "Director de departamento"}
          </p>
        </div>
        <Link href="/inbox" className="text-sm text-muted hover:text-paper shrink-0">
          ← Volver al correo
        </Link>
      </header>

      <nav className="px-6 sm:px-8 border-y border-line flex gap-6 overflow-x-auto">
        {tabs.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`py-4 text-lg font-display whitespace-nowrap border-b-2 -mb-px ${
                active ? "text-paper border-paper" : "text-muted border-transparent hover:text-paper"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-6 sm:px-8 py-8 pb-16">{children}</div>
    </div>
  );
}
