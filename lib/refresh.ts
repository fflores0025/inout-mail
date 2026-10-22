import { refreshToken } from "@/lib/api";
import { setToken } from "@/lib/session";

const KEY = "inout_token_refreshed";
const EVERY_MS = 12 * 60 * 60 * 1000;

/** Renueva el inicio de sesion (otros 90 dias) como mucho una vez cada 12 horas. */
export async function renewSessionIfNeeded(token: string): Promise<void> {
  try {
    const last = Number(localStorage.getItem(KEY) || 0);
    if (Date.now() - last < EVERY_MS) return;
    const fresh = await refreshToken(token);
    setToken(fresh);
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* si falla (sin red, servidor sin actualizar), se sigue con la sesion actual */
  }
}
