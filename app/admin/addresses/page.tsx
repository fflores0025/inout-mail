"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminAddress, ApiError, adminCreateAddress, adminGetAddresses } from "@/lib/api";
import { getToken } from "@/lib/session";
import { EmailInput, fullEmail } from "@/components/EmailInput";

const input =
  "w-full bg-transparent border border-line px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-paper";

export default function AdminAddressesPage() {
  const [addresses, setAddresses] = useState<AdminAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [local, setLocal] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const errMsg = (err: unknown) =>
    err instanceof ApiError ? err.message : "No se pudo conectar con el servidor";

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      setAddresses(await adminGetAddresses(token));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const created = await adminCreateAddress(token, { email: fullEmail(local), password });
      setNotice(`Dirección ${created.email} creada. Para verla en el webmail, crea su buzón en la pestaña Buzones.`);
      setLocal("");
      setPassword("");
      await load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-10">
      {error && <p className="text-sm text-red-400 border border-red-400/40 px-3 py-2">{error}</p>}
      {notice && <p className="text-sm text-paper border border-line px-3 py-2">{notice}</p>}

      <form onSubmit={handleCreate} className="space-y-3 max-w-md">
        <h2 className="font-display text-xl text-paper">Crear dirección</h2>
        <EmailInput value={local} onChange={setLocal} />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Contraseña (mínimo 8 caracteres)"
          required
          minLength={8}
          className={input}
        />
        <button
          type="submit"
          disabled={creating}
          className="px-4 py-2 text-sm border border-paper text-paper hover:bg-paper hover:text-ink transition-colors disabled:opacity-50"
        >
          {creating ? "Creando…" : "Crear dirección"}
        </button>
      </form>

      <section>
        <h2 className="font-display text-xl text-paper mb-4">Direcciones existentes</h2>
        {loading && <p className="text-sm text-muted">Cargando…</p>}
        <ul className="divide-y divide-line border-y border-line">
          {addresses.map((a) => (
            <li key={a.id} className="py-3 text-sm text-paper break-all">
              {a.email}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
