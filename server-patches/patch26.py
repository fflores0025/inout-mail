import sys, shutil, time

p = sys.argv[1] if len(sys.argv) > 1 else '/home/ubuntu/inout-mail-api/src/index.ts'
s = open(p, encoding='utf-8').read()

if 'PLANTILLAS DE CORREO (patch26)' in s:
    sys.exit('Ya estaba aplicado, no hago nada')
if 'CARPETAS (patch23)' not in s or 'FIRMAS OBLIGATORIAS Y PERSONAL A ELEGIR (patch18)' not in s:
    sys.exit('Faltan parches anteriores (18 y 23). No se ha cambiado nada.')
if s.count('const start = async') != 1:
    sys.exit('NO SE ENCONTRO const start. No se ha cambiado nada.')

CODE = r"""// ===== PLANTILLAS DE CORREO (patch26) =====
function renderTpl(text: string, vars: Record<string, any>, sample: boolean): string {
  return String(text || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_m: string, k: string) => {
    if (vars && vars[k] !== undefined && vars[k] !== null) return String(vars[k]);
    return sample ? '[' + k + ']' : '';
  });
}

async function sendNoReply(to: string, subject: string, text: string): Promise<void> {
  const mbq = await pool.query(
    `SELECT mb.id, mb.display_name, vu.email FROM mailboxes mb JOIN virtual_users vu ON vu.id = mb.virtual_user_id WHERE lower(vu.email) = 'no_reply@inout-media.es'`
  );
  if (mbq.rows.length === 0) throw httpError(500, 'No existe el buzon no_reply@inout-media.es');
  const mb = mbq.rows[0];
  const blocks = await signatureBlocks(0, Number(mb.id), null, false);
  const sigText = signatureText(blocks);
  const fullText = text + (sigText ? '\n\n' + sigText : '');
  const fullHtml =
    '<div style="font-size:14px;line-height:1.5;white-space:pre-wrap">' + escHtml(text) + '</div>' + signatureHtml(blocks);
  const mc: any = await import('nodemailer/lib/mail-composer');
  const MailComposer = mc.default || mc;
  const raw: Buffer = await new Promise((resolve, reject) => {
    new MailComposer({
      from: { name: mb.display_name, address: mb.email },
      to: to,
      subject: subject,
      text: fullText,
      html: fullHtml,
    })
      .compile()
      .build((err: any, msg: Buffer) => (err ? reject(err) : resolve(msg)));
  });
  const { spawn } = await import('node:child_process');
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('/usr/sbin/sendmail', ['-t', '-i', '-f', mb.email]);
    let errOut = '';
    proc.stderr.on('data', (d: any) => (errOut += String(d)));
    proc.on('error', reject);
    proc.on('close', (code: number) => (code === 0 ? resolve() : reject(new Error(errOut || 'sendmail fallo'))));
    proc.stdin.write(raw);
    proc.stdin.end();
  });
  saveToSent(Number(mb.id), raw).catch(() => {});
}

app.get('/admin/templates', { preHandler: SUPER_PRE }, async () => {
  const r = await pool.query('SELECT id, key, name, subject, body, active, updated_at FROM mail_templates ORDER BY name');
  return { templates: r.rows };
});

app.post('/admin/templates', { preHandler: SUPER_PRE }, async (request: any) => {
  const b = (request.body || {}) as any;
  const key = String(b.key || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{2,60}$/.test(key)) throw httpError(400, 'El identificador solo puede llevar letras, numeros y guion bajo');
  if (!String(b.name || '').trim() || !String(b.subject || '').trim() || !String(b.body || '').trim())
    throw httpError(400, 'Faltan nombre, asunto o texto');
  try {
    const r = await pool.query(
      'INSERT INTO mail_templates (key, name, subject, body) VALUES ($1, $2, $3, $4) RETURNING id',
      [key, String(b.name).trim(), String(b.subject).trim(), String(b.body)]
    );
    return { id: r.rows[0].id };
  } catch (e: any) {
    if (e && e.code === '23505') throw httpError(409, 'Ya existe una plantilla con ese identificador');
    throw e;
  }
});

app.patch('/admin/templates/:id', { preHandler: SUPER_PRE }, async (request: any) => {
  const b = (request.body || {}) as any;
  const r = await pool.query(
    `UPDATE mail_templates SET name = $2, subject = $3, body = $4, active = $5, updated_at = now() WHERE id = $1 RETURNING id`,
    [Number(request.params.id), String(b.name || '').trim(), String(b.subject || '').trim(), String(b.body || ''), b.active !== false]
  );
  if (r.rows.length === 0) throw httpError(404, 'Plantilla no encontrada');
  return { success: true };
});

app.delete('/admin/templates/:id', { preHandler: SUPER_PRE }, async (request: any) => {
  await pool.query('DELETE FROM mail_templates WHERE id = $1', [Number(request.params.id)]);
  return { success: true };
});

app.post('/admin/templates/:id/test', { preHandler: SUPER_PRE }, async (request: any) => {
  const to = String(((request.body || {}) as any).to || '').trim();
  if (!to) throw httpError(400, 'Falta el destinatario de la prueba');
  const r = await pool.query('SELECT subject, body FROM mail_templates WHERE id = $1', [Number(request.params.id)]);
  if (r.rows.length === 0) throw httpError(404, 'Plantilla no encontrada');
  await sendNoReply(to, renderTpl(r.rows[0].subject, {}, true), renderTpl(r.rows[0].body, {}, true));
  return { success: true };
});

// Envio desde las apps: POST /system/send-template con la cabecera x-api-key
app.post('/system/send-template', async (request: any, reply: any) => {
  const expected = process.env.SYSTEM_MAIL_KEY;
  if (!expected) return reply.status(503).send({ error: 'Envio automatico no configurado' });
  const got = String(request.headers['x-api-key'] || '');
  const crypto = await import('node:crypto');
  const a = Buffer.from(got);
  const e = Buffer.from(expected);
  if (a.length !== e.length || !crypto.timingSafeEqual(a, e)) return reply.status(401).send({ error: 'Clave no valida' });
  const b = (request.body || {}) as any;
  const to = String(b.to || '').trim();
  if (!to || to.includes('\n') || to.includes('\r')) return reply.status(400).send({ error: 'Destinatario no valido' });
  const r = await pool.query('SELECT subject, body, active FROM mail_templates WHERE key = $1', [String(b.template || '')]);
  if (r.rows.length === 0 || !r.rows[0].active) return reply.status(404).send({ error: 'Plantilla no encontrada o desactivada' });
  const vars = b.vars && typeof b.vars === 'object' ? b.vars : {};
  const subject = renderTpl(r.rows[0].subject, vars, false).replace(/[\r\n]+/g, ' ');
  await sendNoReply(to, subject, renderTpl(r.rows[0].body, vars, false));
  return { sent: true };
});

"""
s = s.replace('const start = async', CODE + 'const start = async', 1)
shutil.copy(p, p + '.bak26-' + time.strftime('%Y%m%d-%H%M%S'))
open(p, 'w', encoding='utf-8').write(s)
print('OK: plantillas aplicadas')
