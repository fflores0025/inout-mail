const API_BASE = process.env.NEXT_PUBLIC_MAIL_API_URL ?? "https://mail-api.inout-media.es";

export interface Mailbox {
  id: number;
  email: string;
  display_name: string;
  kind: "personal" | "department";
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

export interface FullMessage {
  uid: number;
  subject: string;
  from_name: string;
  from: string;
  reply_to: string;
  to: string;
  cc: string;
  date: string | null;
  text: string;
  html: string | null;
  attachments: { filename: string; size: number }[];
}

export interface AdminUser {
  id: number;
  full_name: string;
  login_email: string;
  is_global_admin: boolean;
  status: string;
  created_at: string;
}

export interface AdminAddress {
  id: number;
  email: string;
  maildir: string;
}

export interface AdminMailbox {
  id: number;
  kind: "personal" | "department";
  display_name: string;
  email: string;
  owner_name: string | null;
}

export interface AdminPermission {
  app_user_id: number;
  full_name: string;
  login_email: string;
  can_read: boolean;
  can_send: boolean;
  can_delete: boolean;
  can_manage: boolean;
}

export interface AuditLogEntry {
  id: number;
  mailbox: string;
  actor: string;
  action: string;
  details: unknown;
  created_at: string;
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
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.error ?? body?.message ?? `Error ${res.status}`);
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
  return request<{ mailboxes: Mailbox[] }>("/mailboxes", {}, token).then(
    (res) => res.mailboxes
  );
}

export function getMessages(mailboxId: string, token: string) {
  return request<{ messages: Message[] }>(
    `/mailboxes/${mailboxId}/messages`,
    {},
    token
  ).then((res) => res.messages);
}

export function getMessage(mailboxId: string, uid: number, token: string) {
  return request<{ message: FullMessage }>(
    `/mailboxes/${mailboxId}/messages/${uid}`,
    {},
    token
  ).then((res) => res.message);
}

export function sendMessage(
  mailboxId: string,
  token: string,
  payload: { to: string; subject: string; text: string }
) {
  return request<{ sent: boolean }>(
    `/mailboxes/${mailboxId}/send`,
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
}

// --- Admin: usuarios ---

export function adminGetUsers(token: string) {
  return request<{ users: AdminUser[] }>("/admin/users", {}, token).then(
    (res) => res.users
  );
}

export function adminCreateUser(
  token: string,
  data: { full_name: string; login_email: string; password: string; is_global_admin?: boolean }
) {
  return request<{ user: AdminUser }>(
    "/admin/users",
    { method: "POST", body: JSON.stringify(data) },
    token
  ).then((res) => res.user);
}

export function adminUpdateUser(
  token: string,
  id: number,
  data: { status?: string; is_global_admin?: boolean }
) {
  return request<{ user: AdminUser }>(
    `/admin/users/${id}`,
    { method: "PATCH", body: JSON.stringify(data) },
    token
  ).then((res) => res.user);
}

export function adminDeleteUser(token: string, id: number) {
  return request<{ success: boolean }>(`/admin/users/${id}`, { method: "DELETE" }, token);
}

// --- Admin: direcciones de correo (virtual_users) ---

export function adminGetAddresses(token: string) {
  return request<{ addresses: AdminAddress[] }>("/admin/addresses", {}, token).then(
    (res) => res.addresses
  );
}

export function adminCreateAddress(
  token: string,
  data: { email: string; password: string }
) {
  return request<{ address: AdminAddress }>(
    "/admin/addresses",
    { method: "POST", body: JSON.stringify(data) },
    token
  ).then((res) => res.address);
}

// --- Admin: buzones ---

export function adminGetMailboxes(token: string) {
  return request<{ mailboxes: AdminMailbox[] }>("/admin/mailboxes", {}, token).then(
    (res) => res.mailboxes
  );
}

export function adminCreateMailbox(
  token: string,
  data: { virtual_user_email: string; kind: "personal" | "department"; display_name: string; owner_user_id?: number }
) {
  return request<{ mailbox: AdminMailbox }>(
    "/admin/mailboxes",
    { method: "POST", body: JSON.stringify(data) },
    token
  ).then((res) => res.mailbox);
}

// --- Admin: permisos sobre un buzón ---

export function adminGetPermissions(token: string, mailboxId: number) {
  return request<{ permissions: AdminPermission[] }>(
    `/admin/mailboxes/${mailboxId}/permissions`,
    {},
    token
  ).then((res) => res.permissions);
}

export function adminSetPermission(
  token: string,
  mailboxId: number,
  data: { app_user_id: number; can_read?: boolean; can_send?: boolean; can_delete?: boolean; can_manage?: boolean }
) {
  return request(
    `/admin/mailboxes/${mailboxId}/permissions`,
    { method: "POST", body: JSON.stringify(data) },
    token
  );
}

export function adminRevokePermission(token: string, mailboxId: number, userId: number) {
  return request(
    `/admin/mailboxes/${mailboxId}/permissions/${userId}`,
    { method: "DELETE" },
    token
  );
}

// --- Admin: auditoría ---

export function adminGetAuditLog(token: string) {
  return request<{ audit_log: AuditLogEntry[] }>("/admin/audit-log", {}, token).then(
    (res) => res.audit_log
  );
}

export { ApiError };
