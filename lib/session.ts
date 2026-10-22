const TOKEN_KEY = "inout_mail_token";

const TOKEN_DAYS = 90;

export function setToken(token: string) {
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${60 * 60 * 24 * TOKEN_DAYS}; samesite=lax`;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* sin almacenamiento: queda solo la cookie */
  }
}

export function getToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${TOKEN_KEY}=([^;]*)`));
  if (match) return decodeURIComponent(match[1]);
  // Si el sistema borro la cookie, se recupera la sesion guardada
  try {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) {
      document.cookie = `${TOKEN_KEY}=${saved}; path=/; max-age=${60 * 60 * 24 * TOKEN_DAYS}; samesite=lax`;
      return saved;
    }
  } catch {
    /* sin almacenamiento */
  }
  return null;
}

export function clearToken() {
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem("inout_token_refreshed");
  } catch {
    /* nada que borrar */
  }
}

export interface SessionUser {
  sub: number;
  email: string;
  is_global_admin: boolean;
}

export function getUserFromToken(): SessionUser | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}
