import re, sys, shutil, time

p = sys.argv[1] if len(sys.argv) > 1 else '/home/ubuntu/inout-mail-api/src/index.ts'
s = open(p, encoding='utf-8').read()

if 'ADJUNTOS Y FIRMAS (patch12)' in s:
    sys.exit('Ya estaba aplicado, no hago nada')
if 'GRUPOS DE REENVIO (patch11)' not in s:
    sys.exit('Falta aplicar antes el parche 11. No se ha cambiado nada.')
if s.count('const start = async') != 1:
    sys.exit('NO SE ENCONTRO const start. No se ha cambiado nada.')

start = s.find("app.post('/mailboxes/:id/send'")
if start < 0 or s.count("app.post('/mailboxes/:id/send'") != 1:
    sys.exit('NO SE ENCONTRO la ruta de envio. No se ha cambiado nada.')
end = s.index("\n});\n", start) + 5
seg = s[start:end]

def rep(old, new):
    global seg
    if seg.count(old) != 1:
        sys.exit('NO SE ENCONTRO esta parte del envio: ' + old[:60] + ' . No se ha cambiado nada.')
    seg = seg.replace(old, new, 1)

rep("{ preHandler: (app as any).authenticate }", "{ preHandler: (app as any).authenticate, bodyLimit: 24 * 1024 * 1024 }")
rep("const body = request.body as { to?: string; subject?: string; text?: string };",
    "const body = request.body as { to?: string; subject?: string; text?: string; attachments?: any[]; include_signature?: boolean };")
rep("if (!body.to || !body.text) {",
    "if (!body.to || (!body.text && !(Array.isArray(body.attachments) && body.attachments.length > 0))) {")

ADJ = r"""const textBody = body.text;

  // Adjuntos y firma automatica (patch12)
  const rawAtts: any[] = Array.isArray(body.attachments) ? body.attachments : [];
  if (rawAtts.length > 10) return reply.status(400).send({ error: 'Maximo 10 adjuntos por correo' });
  let totalBytes = 0;
  const attachmentList: any[] = [];
  for (const a of rawAtts) {
    const buf = Buffer.from(String(a && a.data ? a.data : ''), 'base64');
    totalBytes += buf.length;
    attachmentList.push({
      filename: String((a && a.filename) || 'adjunto').slice(0, 200),
      content: buf,
      contentType: a && a.content_type ? String(a.content_type) : undefined,
    });
  }
  if (totalBytes > 15 * 1024 * 1024) return reply.status(413).send({ error: 'Los adjuntos superan los 15 MB' });
  const signature = body.include_signature === false ? '' : await buildSignature(Number(userId));
  const fullText = (textBody || '') + (signature ? '\n\n' + signature : '');"""
rep("const textBody = body.text;", ADJ)

m = re.search(r"  const rawMessage = \[.*?\]\.join\('\\r\\n'\);\n", seg, re.S)
if not m:
    sys.exit('NO SE ENCONTRO la construccion del mensaje. No se ha cambiado nada.')
NEWRAW = """  const mc: any = await import('nodemailer/lib/mail-composer');
  const MailComposer = mc.default || mc;
  const rawMessage: Buffer = await new Promise((resolve, reject) => {
    new MailComposer({
      from: { name: senderName, address: senderEmail },
      to: toAddress,
      subject: subject,
      text: fullText,
      attachments: attachmentList,
    })
      .compile()
      .build((err: any, msg: Buffer) => (err ? reject(err) : resolve(msg)));
  });
"""
seg = seg[:m.start()] + NEWRAW + seg[m.end():]

rep("JSON.stringify({ to: toAddress, subject: subject, text: textBody })",
    "JSON.stringify({ to: toAddress, subject: subject, text: textBody, attachments: attachmentList.map((a: any) => a.filename) })")

s = s[:start] + seg + s[end:]

ROUTES = r"""// ===== ADJUNTOS Y FIRMAS (patch12) =====
async function buildSignature(userId: number): Promise<string> {
  const u = await pool.query('SELECT full_name, job_title FROM app_users WHERE id = $1', [userId]);
  if (u.rows.length === 0) return '';
  const f = await pool.query("SELECT value FROM app_settings WHERE key = 'signature_footer'");
  const footer = f.rows.length > 0 ? String(f.rows[0].value || '').trim() : '';
  const title = String(u.rows[0].job_title || '').trim();
  if (!title && !footer) return '';
  const lines: string[] = ['-- ', String(u.rows[0].full_name || '').trim()];
  if (title) lines.push(title);
  if (footer) lines.push(footer.replace(/\r\n/g, '\n'));
  return lines.join('\n');
}

app.get('/me/signature', { preHandler: [(app as any).authenticate] }, async (request: any) => {
  return { signature: await buildSignature(Number(request.user.sub)) };
});

app.get('/admin/signatures', { preHandler: SUPER_PRE }, async () => {
  const f = await pool.query("SELECT value FROM app_settings WHERE key = 'signature_footer'");
  const users = await pool.query(
    "SELECT id, full_name, login_email, job_title FROM app_users WHERE status IS DISTINCT FROM 'disabled' ORDER BY full_name"
  );
  return { footer: f.rows.length > 0 ? f.rows[0].value : '', users: users.rows };
});

app.post('/admin/signatures/footer', { preHandler: SUPER_PRE }, async (request: any) => {
  const footer = String(((request.body || {}) as any).footer || '').trim();
  if (footer.length > 1000) throw httpError(400, 'El pie de firma es demasiado largo (maximo 1000 caracteres)');
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('signature_footer', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [footer]
  );
  return { success: true };
});

app.patch('/admin/users/:id/job-title', { preHandler: SUPER_PRE }, async (request: any) => {
  const userId = Number(request.params.id);
  const title = String(((request.body || {}) as any).job_title || '').trim();
  if (title.length > 120) throw httpError(400, 'El cargo es demasiado largo (maximo 120 caracteres)');
  const r = await pool.query(
    'UPDATE app_users SET job_title = $1 WHERE id = $2 RETURNING id, full_name, job_title',
    [title === '' ? null : title, userId]
  );
  if (r.rows.length === 0) throw httpError(404, 'Usuario no encontrado');
  return { user: r.rows[0] };
});

"""

s = s.replace('const start = async', ROUTES + 'const start = async', 1)
shutil.copy(p, p + '.bak12-' + time.strftime('%Y%m%d-%H%M%S'))
open(p, 'w', encoding='utf-8').write(s)
print('OK: adjuntos y firmas aplicados')
