import re, sys, shutil, time

p = sys.argv[1] if len(sys.argv) > 1 else '/home/ubuntu/inout-mail-api/src/index.ts'
s = open(p, encoding='utf-8').read()

if 'CARPETAS (patch23)' in s:
    sys.exit('Ya estaba aplicado, no hago nada')
if 'CONTADOR DE SIN LEER (patch22)' not in s:
    sys.exit('Falta aplicar antes el parche 22. No se ha cambiado nada.')
if s.count('const start = async') != 1:
    sys.exit('NO SE ENCONTRO const start. No se ha cambiado nada.')


def segment(head):
    i = s.find(head)
    if i < 0 or s.count(head) != 1:
        sys.exit('NO SE ENCONTRO la ruta ' + head + ' . No se ha cambiado nada.')
    j = s.index("\n});\n", i) + 5
    return i, j


# 1) Las rutas que ya listan/leen mensajes aceptan ?folder=
LOCK_OLD = "getMailboxLock('INBOX')"
LOCK_NEW = "getMailboxLock(await folderPath(client, (request.query as any)?.folder))"
for head in ["app.get('/mailboxes/:id/messages',", "app.get('/mailboxes/:id/messages/:uid',"]:
    i, j = segment(head)
    seg = s[i:j]
    if seg.count(LOCK_OLD) != 1:
        sys.exit('NO SE ENCONTRO el acceso a INBOX en ' + head + ' . No se ha cambiado nada.')
    s = s[:i] + seg.replace(LOCK_OLD, LOCK_NEW, 1) + s[j:]

# 2) Copia en Enviados al enviar
i, j = segment("app.post('/mailboxes/:id/send'")
seg = s[i:j]
m = list(re.finditer(r"\[mailboxId, userId, 'sent', JSON\.stringify\(.*?\)\]\s*\);\n", seg, re.S))
if len(m) != 1:
    sys.exit('NO SE ENCONTRO el final del envio. No se ha cambiado nada.')
if 'const rawMessage' not in seg:
    sys.exit('NO SE ENCONTRO rawMessage en el envio. No se ha cambiado nada.')
seg = seg[:m[0].end()] + "  saveToSent(Number(mailboxId), rawMessage).catch(() => {});\n" + seg[m[0].end():]
s = s[:i] + seg + s[j:]

CODE = r"""// ===== CARPETAS (patch23) =====
const FOLDER_SPECIAL: Record<string, { use: string; names: RegExp; create: string; label: string }> = {
  sent: { use: '\\Sent', names: /^(sent|sent items|sent mail|enviados|elementos enviados)$/i, create: 'Sent', label: 'Enviados' },
  drafts: { use: '\\Drafts', names: /^(drafts|borradores)$/i, create: 'Drafts', label: 'Borradores' },
  junk: { use: '\\Junk', names: /^(junk|spam|junk e-?mail|correo no deseado)$/i, create: 'Junk', label: 'Spam' },
  trash: { use: '\\Trash', names: /^(trash|deleted items|deleted|eliminados|papelera)$/i, create: 'Trash', label: 'Eliminados' },
};

async function folderPath(client: any, key: any): Promise<string> {
  const k = String(key || 'inbox').toLowerCase();
  if (k === 'inbox') return 'INBOX';
  const def = FOLDER_SPECIAL[k];
  if (!def) throw httpError(400, 'Carpeta no valida');
  const list: any[] = await client.list();
  const found =
    list.find((x: any) => x.specialUse === def.use) ||
    list.find((x: any) => def.names.test(String(x.name || '')));
  if (found) return found.path;
  try {
    await client.mailboxCreate(def.create);
    try {
      await client.mailboxSubscribe(def.create);
    } catch (e) {
      /* no pasa nada */
    }
  } catch (e) {
    /* puede que ya exista */
  }
  return def.create;
}

async function folderClient(request: any, mailboxId: number, need: 'can_read' | 'can_delete') {
  const userId = Number(request.user.sub);
  const r = await pool.query(
    `SELECT vu.email, mp.can_read, mp.can_delete FROM mailboxes mb
     JOIN virtual_users vu ON vu.id = mb.virtual_user_id
     LEFT JOIN mailbox_permissions mp ON mp.mailbox_id = mb.id AND mp.app_user_id = $2
     WHERE mb.id = $1`,
    [mailboxId, userId]
  );
  if (r.rows.length === 0) throw httpError(404, 'Buzon no encontrado');
  const row = r.rows[0];
  const isSuper = request.user && request.user.role === 'super_admin';
  if (!isSuper && !row[need]) throw httpError(403, 'No tienes permiso para esto');
  const { ImapFlow } = await import('imapflow');
  const client: any = new ImapFlow({
    host: '127.0.0.1',
    port: 993,
    secure: true,
    tls: { rejectUnauthorized: false },
    auth: { user: row.email + '*mailapi', pass: process.env.DOVECOT_MASTER_PASSWORD! },
    logger: false,
  });
  client.on('error', () => {});
  await client.connect();
  return client;
}

async function saveToSent(mailboxId: number, raw: Buffer) {
  const r = await pool.query(
    'SELECT vu.email FROM mailboxes mb JOIN virtual_users vu ON vu.id = mb.virtual_user_id WHERE mb.id = $1',
    [mailboxId]
  );
  if (r.rows.length === 0) return;
  const { ImapFlow } = await import('imapflow');
  const client: any = new ImapFlow({
    host: '127.0.0.1',
    port: 993,
    secure: true,
    tls: { rejectUnauthorized: false },
    auth: { user: r.rows[0].email + '*mailapi', pass: process.env.DOVECOT_MASTER_PASSWORD! },
    logger: false,
  });
  client.on('error', () => {});
  try {
    await client.connect();
    const path = await folderPath(client, 'sent');
    await client.append(path, raw, ['\\Seen']);
  } finally {
    try {
      await client.logout();
    } catch (e) {
      /* nada que cerrar */
    }
  }
}

app.get('/mailboxes/:id/folders', { preHandler: [(app as any).authenticate] }, async (request: any) => {
  const client = await folderClient(request, Number(request.params.id), 'can_read');
  try {
    const out: { key: string; label: string; unseen: number }[] = [];
    const keys: [string, string][] = [['inbox', 'Bandeja de entrada'], ['sent', 'Enviados'], ['drafts', 'Borradores'], ['junk', 'Spam'], ['trash', 'Eliminados']];
    for (const [key, label] of keys) {
      let unseen = 0;
      try {
        const path = await folderPath(client, key);
        const st = await client.status(path, { unseen: true });
        unseen = Number(st.unseen || 0);
      } catch (e) {
        /* carpeta sin estado */
      }
      out.push({ key, label, unseen });
    }
    return { folders: out };
  } finally {
    try {
      await client.logout();
    } catch (e) {
      /* nada que cerrar */
    }
  }
});

app.post('/mailboxes/:id/messages/:uid/move', { preHandler: [(app as any).authenticate] }, async (request: any) => {
  const b = (request.body || {}) as { from?: string; to?: string };
  const client = await folderClient(request, Number(request.params.id), 'can_read');
  try {
    const from = await folderPath(client, b.from);
    const to = await folderPath(client, b.to);
    const lock = await client.getMailboxLock(from);
    try {
      await client.messageMove(String(request.params.uid), to, { uid: true });
    } finally {
      lock.release();
    }
    return { success: true };
  } finally {
    try {
      await client.logout();
    } catch (e) {
      /* nada que cerrar */
    }
  }
});

app.post('/mailboxes/:id/messages/:uid/delete', { preHandler: [(app as any).authenticate] }, async (request: any) => {
  const b = (request.body || {}) as { folder?: string };
  const client = await folderClient(request, Number(request.params.id), 'can_delete');
  try {
    const from = await folderPath(client, b.folder);
    const trash = await folderPath(client, 'trash');
    const lock = await client.getMailboxLock(from);
    try {
      if (from === trash) {
        await client.messageDelete(String(request.params.uid), { uid: true });
      } else {
        await client.messageMove(String(request.params.uid), trash, { uid: true });
      }
    } finally {
      lock.release();
    }
    return { success: true };
  } finally {
    try {
      await client.logout();
    } catch (e) {
      /* nada que cerrar */
    }
  }
});

"""
s = s.replace('const start = async', CODE + 'const start = async', 1)
shutil.copy(p, p + '.bak23-' + time.strftime('%Y%m%d-%H%M%S'))
open(p, 'w', encoding='utf-8').write(s)
print('OK: carpetas aplicadas')
