"use client";

import { useEffect, useState } from "react";
import { getPushKey, pushSubscribe, pushUnsubscribe, pushTest } from "@/lib/api";
import { getToken } from "@/lib/session";

type PushState = "checking" | "unsupported" | "off" | "on" | "denied" | "busy";

const OFF_KEY = "inout_push_off";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function readOffFlag(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) === "1";
  } catch {
    return false;
  }
}

function writeOffFlag(off: boolean) {
  try {
    if (off) localStorage.setItem(OFF_KEY, "1");
    else localStorage.removeItem(OFF_KEY);
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

async function subscribeAndRegister(token: string): Promise<void> {
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const key = await getPushKey(token);
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    });
  }
  await pushSubscribe(sub.toJSON(), token);
}

/** Al cerrar sesion: este dispositivo deja de recibir avisos de esa cuenta. */
export async function pushLogoutCleanup(): Promise<void> {
  try {
    if (!supported()) return;
    const token = getToken();
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return;
    if (token) {
      try {
        await pushUnsubscribe(sub.endpoint, token);
      } catch {
        /* si falla, el servidor lo limpiara cuando el aviso no llegue */
      }
    }
    await sub.unsubscribe();
  } catch {
    /* nunca debe impedir cerrar sesion */
  }
}

export default function PushToggle() {
  const [state, setState] = useState<PushState>("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supported()) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      const token = getToken();
      if (Notification.permission === "granted" && token && !readOffFlag()) {
        try {
          await subscribeAndRegister(token);
          if (!cancelled) setState("on");
          return;
        } catch {
          /* se queda en "off" y se puede reintentar con el boton */
        }
      }
      if (!cancelled) setState("off");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    const token = getToken();
    if (!token) return;
    setMessage("");
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      writeOffFlag(false);
      await subscribeAndRegister(token);
      setState("on");
      try {
        await pushTest(token);
      } catch {
        /* el aviso de prueba es opcional */
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudieron activar");
      setState("off");
    }
  }

  async function disable() {
    const token = getToken();
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        if (token) {
          try {
            await pushUnsubscribe(sub.endpoint, token);
          } catch {
            /* se limpia solo mas adelante */
          }
        }
        await sub.unsubscribe();
      }
      writeOffFlag(true);
    } finally {
      setState("off");
    }
  }

  const base =
    "mx-4 mb-3 px-3 py-2 text-xs text-center border border-line transition-colors shrink-0";

  if (state === "checking") return null;

  if (state === "unsupported") {
    return (
      <p className="mx-4 mb-3 text-xs text-muted/70 text-center shrink-0">
        Para recibir notificaciones, instala la app desde Safari con &laquo;A&ntilde;adir a pantalla de inicio&raquo;.
      </p>
    );
  }

  if (state === "denied") {
    return (
      <p className="mx-4 mb-3 text-xs text-muted/70 text-center shrink-0">
        Notificaciones bloqueadas. Act&iacute;valas en los ajustes del dispositivo.
      </p>
    );
  }

  if (state === "on") {
    return (
      <button
        onClick={disable}
        className={`${base} text-accent hover:border-paper hover:text-paper`}
      >
        Notificaciones activadas
      </button>
    );
  }

  return (
    <>
      <button
        onClick={enable}
        disabled={state === "busy"}
        className={`${base} text-muted hover:border-paper hover:text-paper disabled:opacity-50`}
      >
        {state === "busy" ? "Activando..." : "Activar notificaciones"}
      </button>
      {message && <p className="mx-4 mb-3 text-xs text-muted/70 text-center">{message}</p>}
    </>
  );
}
