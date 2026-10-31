// Recrea en Enviados los correos enviados antes del parche 23 (desde el registro de auditoria).
// Se puede ejecutar mas de una vez: no duplica.
import fs from 'node:fs';
import pg from 'pg';
import { ImapFlow } from 'imapflow';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';

const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

const rows = (
  await pool.query(
    `SELECT a.id, a.mailbox_id, a.details, a.created_at, vu.email AS mb_email
     FROM mailbox_audit_log a
     JOIN mailboxes mb ON mb.id = a.mailbox_id
     JOIN virtual_users vu ON vu.id = mb.virtual_user_id
     WHERE a.action = 'sent' ORDER BY a.created_at`
  )
).rows;

const byMailbox = new Map();
for (const r of rows) {
  if (!byMailbox.has(r.mb_email)) byMailbox.set(r.mb_email, []);
  byMailbox.get(r.mb_email).push(r);
}

let added = 0;
let skipped = 0;
for (const [email, list] of byMailbox) {
  const client = new ImapFlow({
    host: '127.0.0.1', port: 993, secure: true, tls: { rejectUnauthorized: false },
    auth: { user: email + '*mailapi', pass: env.DOVECOT_MASTER_PASSWORD }, logger: false,
  });
  client.on('error', () => {});
  await client.connect();
  try {
    const folders = await client.list();
    let sent = folders.find((x) => x.specialUse === '\\Sent') ||
      folders.find((x) => /^(sent|sent items|sent mail|enviados|elementos enviados)$/i.test(x.name));
    let path = sent ? sent.path : 'Sent';
    if (!sent) {
      try { await client.mailboxCreate('Sent'); await client.mailboxSubscribe('Sent'); } catch {}
    }
    const lock = await client.getMailboxLock(path);
    try {
      for (const r of list) {
        const d = typeof r.details === 'string' ? JSON.parse(r.details) : r.details || {};
        if (!d.to) continue;
        const messageId = `<audit-${r.id}@inout-media.es>`;
        const found = await client.search({ header: { 'message-id': messageId } }, { uid: true });
        if (found && found.length > 0) { skipped++; continue; }
        const atts = Array.isArray(d.attachments) ? d.attachments : [];
        const text = (d.text || '') + (atts.length ? `\n\n[Adjuntos enviados: ${atts.join(', ')}]` : '');
        const raw = await new Promise((resolve, reject) => {
          new MailComposer({
            from: d.from || email, to: d.to, subject: d.subject || '(sin asunto)', text,
            date: new Date(r.created_at), messageId,
          }).compile().build((e, m) => (e ? reject(e) : resolve(m)));
        });
        await client.append(path, raw, ['\\Seen'], new Date(r.created_at));
        added++;
      }
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch {}
  }
}
await pool.end();
console.log(`Hecho: ${added} correos recreados en Enviados, ${skipped} ya estaban.`);
