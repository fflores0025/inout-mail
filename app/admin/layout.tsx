"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getToken, getUserFromToken } from "@/lib/session";

const TABS = [
  { href: "/admin/users", label: "Usuarios" },
  { href: "/admin/addresses", label: "Direcciones" },
  { href: "/admin/mailboxes", label: "Buzones" },
  { href: "/admin/audit", label: "Auditoría" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = getToken();
    const user = getUserFromToken();
    if (!token || !user?.is_global_admin) {
      router.replace("/inbox");
      return;
    }
    setChecked(true);
  }, [router]);

  if (!checked) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-sm">Comprobando acceso…</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line px-8 py-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-paper">Administración</h1>
          <p className="text-muted text-xs mt-1">InOut Mail</p>
        </div>
        <a href="/inbox" className="text-xs text-muted hover:text-paper transition-colors">
          ← Volver al correo
        </a>
      </header>

      <nav className="border-b border-line px-8 flex gap-6">
        {TABS.map((tab) => (
          <a
            key={tab.href}
            href={tab.href}
            className={`py-3 text-sm border-b-2 transition-colors ${
              pathname === tab.href
                ? "text-paper border-paper"
                : "text-muted border-transparent hover:text-paper"
            }`}
          >
            {tab.label}
          </a>
        ))}
      </nav>

      <main className="flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
