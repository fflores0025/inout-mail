"use client";

import { useState } from "react";

const input =
  "w-full bg-transparent border border-line px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-paper";

export function PasswordForm({
  askCurrent,
  mailboxLabel,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  askCurrent: boolean;
  mailboxLabel?: string;
  submitLabel: string;
  onSubmit: (v: { current: string; next: string; alsoMailbox: boolean }) => Promise<void>;
  onCancel?: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [alsoMailbox, setAlsoMailbox] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError("La contraseña nueva debe tener al menos 8 caracteres");
    if (next !== repeat) return setError("Las contraseñas nuevas no coinciden");
    setBusy(true);
    try {
      await onSubmit({ current, next, alsoMailbox });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handle} className="space-y-3 max-w-md">
      {error && <p className="text-sm text-red-400 border border-red-400/40 px-3 py-2">{error}</p>}
      {askCurrent && (
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="Contraseña actual"
          required
          autoComplete="current-password"
          className={input}
        />
      )}
      <input
        type="password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        placeholder="Contraseña nueva (mínimo 8 caracteres)"
        required
        minLength={8}
        autoComplete="new-password"
        className={input}
      />
      <input
        type="password"
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
        placeholder="Repite la contraseña nueva"
        required
        autoComplete="new-password"
        className={input}
      />
      {mailboxLabel && (
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={alsoMailbox}
            onChange={(e) => setAlsoMailbox(e.target.checked)}
          />
          {mailboxLabel}
        </label>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 text-sm border border-paper text-paper hover:bg-paper hover:text-ink transition-colors disabled:opacity-50"
        >
          {busy ? "Guardando…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-line text-muted hover:text-paper"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
