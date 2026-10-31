import sys, shutil, time

p = sys.argv[1] if len(sys.argv) > 1 else '/home/ubuntu/inout-mail-api/src/index.ts'
s = open(p, encoding='utf-8').read()

if 'CONTADOR DE SIN LEER (patch22)' in s:
    sys.exit('Ya estaba aplicado, no hago nada')
if 'NOTIFICACIONES PUSH (patch9)' not in s:
    sys.exit('Faltan las notificaciones (parche 9). No se ha cambiado nada.')
if s.count('const start = async') != 1:
    sys.exit('NO SE ENCONTRO const start. No se ha cambiado nada.')

def rep(old, new):
    global s
    if s.count(old) != 1:
        sys.exit('NO SE ENCONTRO esta parte: ' + old[:70] + ' . No se ha cambiado nada.')
    s = s.replace(old, new, 1)

rep("""  await sendPushToUsers(ids, {
    title: mb.display_name,
    body: body,
    url: '/inbox?mailbox=' + mb.id,
  });""",
"""  unreadCache.delete(mb.id);
  for (const uid of ids) {
    let badge = 0;
    try {
      badge = (await unreadForUser(uid)).total;
    } catch (e) {
      badge = 0;
    }
    await sendPushToUsers([uid], {
      title: mb.display_name,
      body: body,
      url: '/inbox?mailbox=' + mb.id,
      badge: badge,
    });
  }""")

ROUTES = r"""// ===== CONTADOR DE SIN LEER (patch22) =====
const unreadCache = new Map<number, { t: number; n: number }>();

async function mailboxUnread(mb: { id: number; email: string }): Promise<number> {
  const c = unreadCache.get(mb.id);
  if (c && Date.now() - c.t < 15000) return c.n;
  const { ImapFlow } = await import('imapflow');
  const client: any = new ImapFlow({
    host: '127.0.0.1',
    port: 993,
    secure: true,
    tls: { rejectUnauthorized: false },
    auth: { user: mb.email + '*mailapi', pass: process.env.DOVECOT_MASTER_PASSWORD! },
    logger: false,
  });
  client.on('error', () => {});
  let n = 0;
  try {
    await client.connect();
    const st = await client.status('INBOX', { unseen: true });
    n = Number(st.unseen || 0);
  } catch (e) {
    return c ? c.n : 0;
  } finally {
    try {
      await client.logout();
    } catch (e) {
      /* nada que cerrar */
    }
  }
  unreadCache.set(mb.id, { t: Date.now(), n });
  return n;
}

async function unreadForUser(userId: number): Promise<{ total: number; by: Record<string, number> }> {
  const r = await pool.query(
    `SELECT mb.id, vu.email FROM mailbox_permissions mp
     JOIN mailboxes mb ON mb.id = mp.mailbox_id
     JOIN virtual_users vu ON vu.id = mb.virtual_user_id
     WHERE mp.app_user_id = $1 AND mp.can_read = true
       AND COALESCE(mb.status, 'active') <> 'disabled' AND vu.active = true`,
    [userId]
  );
  const by: Record<string, number> = {};
  let total = 0;
  await Promise.all(
    r.rows.map(async (mb: any) => {
      const n = await mailboxUnread(mb);
      by[String(mb.id)] = n;
      total += n;
    })
  );
  return { total, by };
}

app.get('/me/unread', { preHandler: [(app as any).authenticate] }, async (request: any) => {
  return await unreadForUser(Number(request.user.sub));
});

"""
s = s.replace('const start = async', ROUTES + 'const start = async', 1)
shutil.copy(p, p + '.bak22-' + time.strftime('%Y%m%d-%H%M%S'))
open(p, 'w', encoding='utf-8').write(s)
print('OK: contador de sin leer aplicado')
