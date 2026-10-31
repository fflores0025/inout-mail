import sys, shutil, time

p = sys.argv[1] if len(sys.argv) > 1 else '/home/ubuntu/inout-mail-api/src/index.ts'
s = open(p, encoding='utf-8').read()

if 'BORRADORES (patch25)' in s:
    sys.exit('Ya estaba aplicado, no hago nada')
if 'CARPETAS (patch23)' not in s:
    sys.exit('Falta aplicar antes el parche 23. No se ha cambiado nada.')
if s.count('const start = async') != 1:
    sys.exit('NO SE ENCONTRO const start. No se ha cambiado nada.')

# En Borradores, "eliminar" borra de verdad (sin pasar por Eliminados)
old = "      if (from === trash) {"
new = "      if (from === trash || from === (await folderPath(client, 'drafts'))) {"
if s.count(old) != 1:
    sys.exit('NO SE ENCONTRO la ruta de eliminar. No se ha cambiado nada.')
s = s.replace(old, new, 1)

CODE = r"""// ===== BORRADORES (patch25) =====
app.post('/mailboxes/:id/drafts', { preHandler: [(app as any).authenticate], bodyLimit: 2 * 1024 * 1024 }, async (request: any) => {
  const b = (request.body || {}) as { to?: string; subject?: string; text?: string; replace_uid?: number; discard_uid?: number };
  const client = await folderClient(request, Number(request.params.id), 'can_read');
  try {
    const path = await folderPath(client, 'drafts');
    const oldUid = Number(b.replace_uid || b.discard_uid || 0);
    let uid: number | null = null;
    if (!b.discard_uid) {
      const who = await pool.query(
        `SELECT vu.email, mb.display_name FROM mailboxes mb JOIN virtual_users vu ON vu.id = mb.virtual_user_id WHERE mb.id = $1`,
        [Number(request.params.id)]
      );
      const mc: any = await import('nodemailer/lib/mail-composer');
      const MailComposer = mc.default || mc;
      const raw: Buffer = await new Promise((resolve, reject) => {
        new MailComposer({
          from: { name: who.rows[0]?.display_name || '', address: who.rows[0]?.email || '' },
          to: String(b.to || ''),
          subject: String(b.subject || ''),
          text: String(b.text || ''),
        })
          .compile()
          .build((err: any, msg: Buffer) => (err ? reject(err) : resolve(msg)));
      });
      const res: any = await client.append(path, raw, ['\\Seen', '\\Draft']);
      uid = res && res.uid ? Number(res.uid) : null;
    }
    if (oldUid > 0) {
      const lock = await client.getMailboxLock(path);
      try {
        await client.messageDelete(String(oldUid), { uid: true });
      } finally {
        lock.release();
      }
    }
    return { success: true, uid };
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
shutil.copy(p, p + '.bak25-' + time.strftime('%Y%m%d-%H%M%S'))
open(p, 'w', encoding='utf-8').write(s)
print('OK: borradores aplicados')
