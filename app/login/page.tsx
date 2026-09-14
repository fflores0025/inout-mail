"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { login, ApiError } from "@/lib/api";
import { setToken } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token } = await login(address, password);
      setToken(token);
      router.push("/inbox");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se ha podido iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-12">
          {/* Símbolo O orgánico de la marca, trazo simplificado */}
          <svg
            width="56"
            height="56"
            viewBox="0 0 120 120"
            fill="none"
            className="mb-5"
            aria-hidden="true"
          >
            <path
              d="M60 15c14 0 22 9 24 20 10 2 20 10 20 25 0 20-19 35-44 35S16 80 16 60c0-15 10-23 20-25 2-11 10-20 24-20z"
              fill="none"
              stroke="#F3EFE7"
              strokeWidth="3"
            />
          </svg>
          <h1 className="font-display text-3xl text-paper tracking-wide">InOut Mail</h1>
          <p className="text-muted text-xs mt-2 tracking-widest2">CORREO INOUT MEDIA</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="address" className="block text-xs text-muted mb-2">
              Dirección
            </label>
            <input
              id="address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="nombre@inout-media.es"
              autoComplete="username"
              required
              className="w-full bg-transparent border border-line rounded-none px-3 py-2.5 text-paper placeholder:text-muted/60 focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs text-muted mb-2">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full bg-transparent border border-line rounded-none px-3 py-2.5 text-paper focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 border border-paper text-paper hover:bg-paper hover:text-ink transition-colors disabled:opacity-50"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
