"use client";

import { useEffect, useState } from "react";
import { adminGetAddresses, adminCreateAddress, AdminAddress, ApiError } from "@/lib/api";
import { getToken } from "@/lib/session";

export default function AdminAddressesPage() {
  const [addresses, setAddresses] = useState<AdminAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  function load() {
    const token = getToken()!;
    setLoading(true);
    adminGetAddresses(token)
      .then(setAddresses)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error al cargar direcciones"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const token = getToken()!;
      await adminCreateAddress(token, { email, password });
      setEmail("");
      setPassword("");
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al crear la dirección");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-10">
      <section>
        <h2 className="font-display text-lg text-paper mb-4">Nueva dirección de correo</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="nombre@inout-media.es"
            required
            className="w-full bg-transparent border border-line px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-paper"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Contraseña del buzón"
            required
            className="w-full bg-transparent border border-line px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-paper"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 text-sm border border-paper text-paper hover:bg-paper hover:text-ink transition-colors disabled:opacity-50"
          >
            {creating ? "Creando…" : "Crear dirección"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-display text-lg text-paper mb-4">Direcciones existentes</h2>
        {loading && <p className="text-sm text-muted">Cargando…</p>}
        <div className="divide-y divide-line border-t border-line">
          {addresses.map((a) => (
            <div key={a.id} className="py-3">
              <p className="text-sm text-paper">{a.email}</p>
              <p className="text-xs text-muted">{a.maildir}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
