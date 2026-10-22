import sys, shutil, time

p = sys.argv[1] if len(sys.argv) > 1 else '/home/ubuntu/inout-mail-api/src/index.ts'
s = open(p, encoding='utf-8').read()

if 'NOTIFICACIONES PUSH (patch9)' in s:
    sys.exit('Ya estaba aplicado, no hago nada')
if 'DESACTIVAR Y ELIMINAR DIRECCIONES (patch8)' not in s:
    sys.exit('Falta aplicar antes el parche 8. No se ha cambiado nada.')
if s.count('const start = async') != 1:
    sys.exit('NO SE ENCONTRO const start. No se ha cambiado nada.')

ROUTES = r"""// ===== NOTIFICACIONES PUSH (patch9) =====
let webpushLib: any = null;
async function getWebPush(): Promise<any> {
  if (webpushLib) return webpushLib;
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return null;
  const wp: any = await import('web-push');
  const lib = wp.default || wp;
  lib.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:postmaster@inout-media.es',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  webpushLib = lib;
  return lib;
}

async function sendPushToUsers(userIds: number[], payload: any): Promise<number> {
  if (userIds.length === 0) return 0;
  const lib = await getWebPush();
  if (!lib) return 0;
  const subs = await pool.query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE app_user_id = ANY($1::int[])',
    [userIds]
  );
  let sent = 0;
  for (const sub of subs.rows) {
    try {
      await lib.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 86400 }
      );
      sent++;
    } catch (err: any) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
      } else {
        app.log.error({ err: String(err && err.message) }, 'push: error al enviar');
      }
    }
  }
  return sent;
}

app.get('/push/public-key', { preHandler: [(app as any).authenticate] }, async () => {
  if (!process.env.VAPID_PUBLIC_KEY) throw httpError(503, 'Las notificaciones no estan configuradas en el servidor');
  return { key: process.env.VAPID_PUBLIC_KEY };
});

app.post('/push/subscribe', { preHandler: [(app as any).authenticate] }, async (request: any) => {
  const body = (request.body || {}) as any;
  const endpoint = String(body.endpoint || '');
  const p256dh = String((body.keys && body.keys.p256dh) || '');
  const auth = String((body.keys && body.keys.auth) || '');
  if (!endpoint || !p256dh || !auth) throw httpError(400, 'Suscripcion no valida');
  await pool.query(
    `INSERT INTO push_subscriptions (app_user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET app_user_id = EXCLUDED.app_user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [request.user.sub, endpoint, p256dh, auth]
  );
  refreshWatchers().catch(() => {});
  return { success: true };
});

app.post('/push/unsubscribe', { preHandler: [(app as any).authenticate] }, async (request: any) => {
  const body = (request.body || {}) as any;
  const endpoint = String(body.endpoint || '');
  if (!endpoint) throw httpError(400, 'Falta endpoint');
  await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND app_user_id = $2', [endpoint, request.user.sub]);
  return { success: true };
});

app.post('/push/test', { preHandler: [(app as any).authenticate] }, async (request: any) => {
  const sent = await sendPushToUsers([Number(request.user.sub)], {
    title: 'InOut Mail',
    body: 'Las notificaciones funcionan',
    url: '/inbox',
  });
  if (sent === 0) throw httpError(404, 'No hay ningun dispositivo suscrito');
  return { success: true, sent };
});

// Vigilancia de buzones: una conexion IMAP por buzon que tenga alguien suscrito
const pushWatchers = new Map<number, { stop: boolean; client: any }>();

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notifyNewMail(mb: any, items: { from: string; subject: string }[]) {
  const who = await pool.query(
    `SELECT DISTINCT mp.app_user_id FROM mailbox_permissions mp
     JOIN push_subscriptions ps ON ps.app_user_id = mp.app_user_id
     WHERE mp.mailbox_id = $1 AND mp.can_read = true`,
    [mb.id]
  );
  const ids = who.rows.map((r: any) => Number(r.app_user_id));
  if (ids.length === 0 || items.length === 0) return;
  const body =
    items.length === 1
      ? items[0].from + ': ' + items[0].subject
      : items.length + ' correos nuevos';
  await sendPushToUsers(ids, {
    title: mb.display_name,
    body: body,
    url: '/inbox?mailbox=' + mb.id,
  });
}

async function watchMailbox(mb: any) {
  const state = { stop: false, client: null as any };
  pushWatchers.set(mb.id, state);
  let lastUid = 0;
  const { ImapFlow } = await import('imapflow');
  while (!state.stop) {
    const client: any = new ImapFlow({
      host: '127.0.0.1',
      port: 993,
      secure: true,
      tls: { rejectUnauthorized: false },
      auth: { user: mb.email + '*mailapi', pass: process.env.DOVECOT_MASTER_PASSWORD! },
      logger: false,
    });
    state.client = client;
    client.on('error', () => {});
    let checking = false;
    const checkNew = async () => {
      if (checking || state.stop) return;
      checking = true;
      try {
        const found: { from: string; subject: string }[] = [];
        let maxUid = lastUid;
        const msgs: any[] = await client.fetchAll(String(lastUid + 1) + ':*', { uid: true, envelope: true }, { uid: true });
        for (const msg of msgs) {
          if (msg.uid <= lastUid) continue;
          if (msg.uid > maxUid) maxUid = msg.uid;
          const f = msg.envelope && msg.envelope.from && msg.envelope.from[0];
          const from = f ? f.name || f.address || 'Remitente desconocido' : 'Remitente desconocido';
          found.push({ from: from, subject: (msg.envelope && msg.envelope.subject) || '(sin asunto)' });
        }
        lastUid = maxUid;
        await notifyNewMail(mb, found);
      } catch (err: any) {
        app.log.error({ err: String(err && err.message) }, 'push: error al revisar correo nuevo');
      } finally {
        checking = false;
      }
    };
    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        if (lastUid === 0) {
          lastUid = Number(client.mailbox.uidNext || 1) - 1;
        } else {
          await checkNew();
        }
        client.on('exists', () => {
          checkNew();
        });
        await new Promise<void>((resolve) => {
          client.once('close', () => resolve());
          const t = setInterval(() => {
            if (state.stop) {
              clearInterval(t);
              resolve();
            }
          }, 5000);
          client.once('close', () => clearInterval(t));
        });
      } finally {
        try {
          lock.release();
        } catch (e) {
          /* la conexion ya estaba cerrada */
        }
      }
    } catch (err: any) {
      app.log.error({ err: String(err && err.message), mailbox: mb.email }, 'push: conexion IMAP perdida');
    } finally {
      try {
        await client.logout();
      } catch (e) {
        /* nada que cerrar */
      }
    }
    if (!state.stop) await sleepMs(15000);
  }
  pushWatchers.delete(mb.id);
}

let refreshing = false;
async function refreshWatchers() {
  if (refreshing) return;
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.DOVECOT_MASTER_PASSWORD) return;
  refreshing = true;
  try {
    const r = await pool.query(
      `SELECT DISTINCT mb.id, mb.display_name, vu.email
       FROM mailboxes mb
       JOIN virtual_users vu ON vu.id = mb.virtual_user_id
       JOIN mailbox_permissions mp ON mp.mailbox_id = mb.id AND mp.can_read = true
       JOIN push_subscriptions ps ON ps.app_user_id = mp.app_user_id
       WHERE COALESCE(mb.status, 'active') <> 'disabled' AND vu.active = true`
    );
    const wanted = new Set<number>(r.rows.map((x: any) => Number(x.id)));
    for (const mb of r.rows) {
      if (!pushWatchers.has(Number(mb.id))) {
        watchMailbox(mb).catch((e: any) => app.log.error({ err: String(e && e.message) }, 'push: watcher caido'));
      }
    }
    for (const [id, st] of Array.from(pushWatchers.entries())) {
      if (!wanted.has(id)) {
        st.stop = true;
        try {
          if (st.client) st.client.close();
        } catch (e) {
          /* ya cerrado */
        }
      }
    }
  } catch (err: any) {
    app.log.error({ err: String(err && err.message) }, 'push: error al refrescar vigilancia');
  } finally {
    refreshing = false;
  }
}
setTimeout(() => {
  refreshWatchers();
}, 5000);
setInterval(() => {
  refreshWatchers();
}, 60000);

"""

s = s.replace('const start = async', ROUTES + 'const start = async', 1)
shutil.copy(p, p + '.bak9-' + time.strftime('%Y%m%d-%H%M%S'))
open(p, 'w', encoding='utf-8').write(s)
print('OK: notificaciones push aplicadas')
