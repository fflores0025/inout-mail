"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, changeMyPassword } from "@/lib/api";
import { getToken } from "@/lib/session";
import { PasswordForm } from "@/components/PasswordForm";

export default function AccountPage() {
  const router = useRouter();
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  async function submit(v: { current: string; next: string; alsoMailbox: boolean }) {
    const token = getToken();
    if (!token) return;
    try {
      const res = await changeMyPassword(token, {
        current_password: v.current,
        new_password: v.next,
        also_mailbox: v.alsoMailbox,
      });
      setDone(
        res.mailbox_updated
          ? "Contraseña cambiada, tanto la de acceso a la web como la de tu buzón."
          : "Contraseña de acceso cambiada."
      );
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "No se pudo conectar con el servidor");
    }
  }

  return (
    <div className="min-h-dvh px-6 sm:px-8 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-display text-3xl text-paper">Mi contraseña</h1>
        <Link href="/inbox" className="text-sm text-muted hover:text-paper shrink-0">
          ← Volver al correo
        </Link>
      </div>
      {done ? (
        <p className="text-sm text-paper border border-line px-3 py-2 max-w-md">{done}</p>
      ) : (
        <PasswordForm
          askCurrent
          mailboxLabel="Cambiar también la contraseña de mi buzón de correo (si tengo uno personal)"
          submitLabel="Cambiar contraseña"
          onSubmit={submit}
        />
      )}
    </div>
  );
}
