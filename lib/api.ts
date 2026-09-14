const API_BASE = process.env.NEXT_PUBLIC_MAIL_API_URL ?? "https://mail-api.inout-media.es";

export interface Mailbox {
  id: string;
  address: string;
  display_name: string;
  type: "personal" | "department";
}

export interface Message {
  uid: number;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  seen: boolean;
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.message ?? `Error ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export function login(address: string, password: string) {
  return request<{ token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: address, password }),
  });
}

export function getMailboxes(token: string) {
  return request<Mailbox[]>("/mailboxes", {}, token);
}

export function getMessages(mailboxId: string, token: string) {
  return request<Message[]>(`/mailboxes/${mailboxId}/messages`, {}, token);
}

export function sendMessage(
  mailboxId: string,
  token: string,
  payload: { to: string; subject: string; body: string }
) {
  return request<{ sent: boolean }>(
    `/mailboxes/${mailboxId}/send`,
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
}

export { ApiError };
