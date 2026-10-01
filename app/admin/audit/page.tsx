"use client";

import { useEffect, useState } from "react";
import { adminGetAuditLog, AuditLogEntry, ApiError } from "@/lib/api";
import { getToken } from "@/lib/session";

export default function AdminAuditPage() {
  const [log, setLog] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken()!;
    adminGetAuditLog(token)
      .then(setLog)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error al cargar la auditoría"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl">
      <h2 className="font-display text-lg text-paper mb-4">Últimas 100 acciones</h2>
      {loading && <p className="text-sm text-muted">Cargando…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="divide-y divide-line border-t border-line">
        {log.map((entry) => (
          <div key={entry.id} className="py-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-paper">
                {entry.actor} <span className="text-muted">·</span> {entry.action} en{" "}
                {entry.mailbox}
              </p>
              <span className="text-xs text-muted shrink-0">
                {new Date(entry.created_at).toLocaleString("es-ES")}
              </span>
            </div>
            {entry.details != null && (
              <pre className="text-xs text-muted/70 mt-1 overflow-x-auto">
                {JSON.stringify(entry.details, null, 0)}
              </pre>
            )}
          </div>
        ))}
        {!loading && log.length === 0 && (
          <p className="py-3 text-sm text-muted">Sin actividad registrada todavía.</p>
        )}
      </div>
    </div>
  );
}
