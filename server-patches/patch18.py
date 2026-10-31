import sys, shutil, time

p = sys.argv[1] if len(sys.argv) > 1 else '/home/ubuntu/inout-mail-api/src/index.ts'
s = open(p, encoding='utf-8').read()

if 'FIRMAS OBLIGATORIAS Y PERSONAL A ELEGIR (patch18)' in s:
    sys.exit('Ya estaba aplicado, no hago nada')
if 'SOLO FIRMA DEL BUZON (patch17)' not in s:
    sys.exit('Falta aplicar antes el parche 17. No se ha cambiado nada.')

def rep(old, new):
    global s
    if s.count(old) != 1:
        sys.exit('NO SE ENCONTRO esta parte: ' + old[:70] + ' . No se ha cambiado nada.')
    s = s.replace(old, new, 1)

a = s.index('async function signatureBlocks(userId: number')
b = s.index("app.get('/admin/signatures'", a)
NEW = r"""// ===== FIRMAS OBLIGATORIAS Y PERSONAL A ELEGIR (patch18) =====
// Siempre salen: la firma del buzon/grupo y el pie comun. La firma personal es opcional
// (el usuario elige al enviar), salvo en su propio buzon personal, donde sale siempre.
async function signatureParts(userId: number, mailboxId: number | null, groupId: number | null) {
  let dept: string[] = [];
  let own = false;
  let only = false;
  if (groupId) {
    const g = await pool.query('SELECT signature FROM mail_groups WHERE id = $1', [groupId]);
    const gt = g.rows.length > 0 ? String(g.rows[0].signature || '').replace(/\r\n/g, '\n').trim() : '';
    if (gt) dept = gt.split('\n');
  } else if (mailboxId) {
    const m = await pool.query('SELECT signature, signature_only, kind, owner_user_id FROM mailboxes WHERE id = $1', [mailboxId]);
    if (m.rows.length > 0) {
      const t = String(m.rows[0].signature || '').replace(/\r\n/g, '\n').trim();
      if (t) dept = t.split('\n');
      only = !!m.rows[0].signature_only;
      own = m.rows[0].kind === 'personal' && Number(m.rows[0].owner_user_id) === Number(userId);
    }
  }
  const u = await pool.query('SELECT full_name, job_title FROM app_users WHERE id = $1', [userId]);
  let personal: string[] = [];
  let hasTitle = false;
  if (u.rows.length > 0) {
    const title = String(u.rows[0].job_title || '').replace(/\r\n/g, '\n').trim();
    hasTitle = title !== '';
    personal = [String(u.rows[0].full_name || '').trim()];
    if (title) personal.push(...title.split('\n'));
  }
  const f = await pool.query("SELECT value FROM app_settings WHERE key = 'signature_footer'");
  const footerText = f.rows.length > 0 ? String(f.rows[0].value || '').replace(/\r\n/g, '\n').trim() : '';
  const footer = footerText ? footerText.split('\n') : [];
  return { dept, personal, hasTitle, footer, own, only };
}

async function signatureBlocks(
  userId: number,
  mailboxId: number | null,
  groupId: number | null = null,
  includePersonal: boolean = false
): Promise<string[][]> {
  const p = await signatureParts(userId, mailboxId, groupId);
  const blocks: string[][] = [];
  if (p.dept.length > 0) blocks.push(p.dept);
  const personalGoes = p.own ? p.hasTitle : includePersonal && !p.only;
  if (personalGoes && p.personal.length > 0) blocks.push(p.personal);
  if (p.footer.length > 0) blocks.push(p.footer);
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
    .map(
      (b, i) =>
        '<div style="margin-top:' + (i === 0 ? '18' : '12') + 'px;' +
        (i === 0 ? '' : 'padding-top:10px;border-top:1px solid #d0d0d0;') +
        'font-size:14px;line-height:1.4">' + b.map(escHtml).join('<br>') + '</div>'
    )
    .join('');
}

app.get('/me/signature', { preHandler: [(app as any).authenticate] }, async (request: any) => {
  const mb = Number((request.query || {}).mailbox);
  const gr = Number((request.query || {}).group);
  const mailboxId = Number.isInteger(mb) && mb > 0 ? mb : null;
  const groupId = Number.isInteger(gr) && gr > 0 ? gr : null;
  const userId = Number(request.user.sub);
  const parts = await signatureParts(userId, mailboxId, groupId);
  const choice = !parts.own && !parts.only && parts.personal.length > 0;
  return {
    signature: signatureText(await signatureBlocks(userId, mailboxId, groupId, false)),
    personal: choice ? parts.personal.join('\n') : '',
    choice,
  };
});

"""
s = s[:a] + NEW + s[b:]

rep("const sigBlocks = body.include_signature === false ? [] : await signatureBlocks(Number(userId), mailboxId, sendGroupId);",
    "const bAny = body as any;\n  const includePersonal = bAny.personal_signature === 'include' || (bAny.personal_signature === undefined && bAny.include_signature === true);\n  const sigBlocks = await signatureBlocks(Number(userId), mailboxId, sendGroupId, includePersonal);")

shutil.copy(p, p + '.bak18-' + time.strftime('%Y%m%d-%H%M%S'))
open(p, 'w', encoding='utf-8').write(s)
print('OK: firmas obligatorias y personal a elegir aplicado')
