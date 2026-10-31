import sys, shutil, time

p = sys.argv[1] if len(sys.argv) > 1 else '/home/ubuntu/inout-mail-api/src/index.ts'
s = open(p, encoding='utf-8').read()

if 'FIRMA VISIBLE Y POR BUZON (patch14)' in s:
    sys.exit('Ya estaba aplicado, no hago nada')
if 'EDITAR NOMBRES Y GRUPOS (patch13)' not in s:
    sys.exit('Falta aplicar antes el parche 13. No se ha cambiado nada.')
if s.count('const start = async') != 1:
    sys.exit('NO SE ENCONTRO const start. No se ha cambiado nada.')

def rep(old, new):
    global s
    if s.count(old) != 1:
        sys.exit('NO SE ENCONTRO esta parte: ' + old[:70] + ' . No se ha cambiado nada.')
    s = s.replace(old, new, 1)

# 1) Funcion de firma: ahora devuelve bloques (firma del buzon + firma personal), sin el "-- " que Gmail oculta
a = s.index('async function buildSignature(userId: number): Promise<string> {')
b = s.index("app.get('/admin/signatures'", a)
NEWSIG = r"""// ===== FIRMA VISIBLE Y POR BUZON (patch14) =====
async function signatureBlocks(userId: number, mailboxId: number | null): Promise<string[][]> {
  const blocks: string[][] = [];
  let dept: string[] = [];
  if (mailboxId) {
    const m = await pool.query('SELECT signature FROM mailboxes WHERE id = $1', [mailboxId]);
    const t = m.rows.length > 0 ? String(m.rows[0].signature || '').replace(/\r\n/g, '\n').trim() : '';
    if (t) dept = t.split('\n');
  }
  const u = await pool.query('SELECT full_name, job_title FROM app_users WHERE id = $1', [userId]);
  let personal: string[] = [];
  if (u.rows.length > 0) {
    const f = await pool.query("SELECT value FROM app_settings WHERE key = 'signature_footer'");
    const footer = f.rows.length > 0 ? String(f.rows[0].value || '').replace(/\r\n/g, '\n').trim() : '';
    const title = String(u.rows[0].job_title || '').trim();
    if (title || footer || dept.length > 0) {
      personal = [String(u.rows[0].full_name || '').trim()];
      if (title) personal.push(title);
      if (footer) personal.push(...footer.split('\n'));
    }
  }
  if (dept.length > 0) blocks.push(dept);
  if (personal.length > 0) blocks.push(personal);
  return blocks;
}

function signatureText(blocks: string[][]): string {
  return blocks.map((b) => b.join('\n')).join('\n\n');
}

function escHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function signatureHtml(blocks: string[][]): string {
  return blocks
    .map((b) => '<div style="margin-top:16px;font-size:14px;line-height:1.4">' + b.map(escHtml).join('<br>') + '</div>')
    .join('');
}

app.get('/me/signature', { preHandler: [(app as any).authenticate] }, async (request: any) => {
  const mb = Number((request.query || {}).mailbox);
  return { signature: signatureText(await signatureBlocks(Number(request.user.sub), Number.isInteger(mb) && mb > 0 ? mb : null)) };
});

"""
s = s[:a] + NEWSIG + s[b:]

# 2) Envio: firma visible en texto y en HTML
rep("""  const signature = body.include_signature === false ? '' : await buildSignature(Number(userId));
  const fullText = (textBody || '') + (signature ? '\\n\\n' + signature : '');""",
"""  const sigBlocks = body.include_signature === false ? [] : await signatureBlocks(Number(userId), mailboxId);
  const signature = signatureText(sigBlocks);
  const fullText = (textBody || '') + (signature ? '\\n\\n' + signature : '');
  const fullHtml =
    '<div style="font-size:14px;line-height:1.5">' +
    escHtml(textBody || '').replace(/\\r?\\n/g, '<br>') +
    '</div>' +
    signatureHtml(sigBlocks);""")
rep("      text: fullText,\n", "      text: fullText,\n      html: fullHtml,\n")

# 3) Panel: lista de buzones con firma
rep("  return { footer: f.rows.length > 0 ? f.rows[0].value : '', users: users.rows };",
"""  const mbs = await pool.query(
    `SELECT mb.id, mb.display_name, vu.email, COALESCE(mb.signature, '') AS signature
     FROM mailboxes mb JOIN virtual_users vu ON vu.id = mb.virtual_user_id
     WHERE mb.kind = 'department' ORDER BY mb.display_name`
  );
  return { footer: f.rows.length > 0 ? f.rows[0].value : '', users: users.rows, mailboxes: mbs.rows };""")

ROUTE = r"""app.patch('/admin/mailboxes/:id/signature', { preHandler: SUPER_PRE }, async (request: any) => {
  const id = Number(request.params.id);
  const text = String(((request.body || {}) as any).signature || '').trim();
  if (text.length > 1000) throw httpError(400, 'La firma es demasiado larga (maximo 1000 caracteres)');
  const r = await pool.query('UPDATE mailboxes SET signature = $1 WHERE id = $2 RETURNING id', [text === '' ? null : text, id]);
  if (r.rows.length === 0) throw httpError(404, 'Buzon no encontrado');
  return { success: true };
});

"""
s = s.replace('const start = async', ROUTE + 'const start = async', 1)
shutil.copy(p, p + '.bak14-' + time.strftime('%Y%m%d-%H%M%S'))
open(p, 'w', encoding='utf-8').write(s)
print('OK: firma visible y por buzon aplicada')
