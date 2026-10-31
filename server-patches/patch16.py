import sys, shutil, time

p = sys.argv[1] if len(sys.argv) > 1 else '/home/ubuntu/inout-mail-api/src/index.ts'
s = open(p, encoding='utf-8').read()

if 'FIRMAS DE GRUPO Y ENVIAR COMO GRUPO (patch16)' in s:
    sys.exit('Ya estaba aplicado, no hago nada')
if 'FIRMA VISIBLE Y POR BUZON (patch14)' not in s:
    sys.exit('Falta aplicar antes el parche 14. No se ha cambiado nada.')
if s.count('const start = async') != 1:
    sys.exit('NO SE ENCONTRO const start. No se ha cambiado nada.')

def rep(old, new):
    global s
    if s.count(old) != 1:
        sys.exit('NO SE ENCONTRO esta parte: ' + old[:70] + ' . No se ha cambiado nada.')
    s = s.replace(old, new, 1)

# firma: puede venir de un grupo
rep("async function signatureBlocks(userId: number, mailboxId: number | null): Promise<string[][]> {",
    "async function signatureBlocks(userId: number, mailboxId: number | null, groupId: number | null = null): Promise<string[][]> {")
rep("""  if (mailboxId) {
    const m = await pool.query('SELECT signature FROM mailboxes WHERE id = $1', [mailboxId]);""",
"""  if (groupId) {
    const g = await pool.query('SELECT signature FROM mail_groups WHERE id = $1', [groupId]);
    const gt = g.rows.length > 0 ? String(g.rows[0].signature || '').replace(/\\r\\n/g, '\\n').trim() : '';
    if (gt) dept = gt.split('\\n');
  } else if (mailboxId) {
    const m = await pool.query('SELECT signature FROM mailboxes WHERE id = $1', [mailboxId]);""")

# vista previa de la firma segun el remitente
rep("""  const mb = Number((request.query || {}).mailbox);
  return { signature: signatureText(await signatureBlocks(Number(request.user.sub), Number.isInteger(mb) && mb > 0 ? mb : null)) };""",
"""  const mb = Number((request.query || {}).mailbox);
  const gr = Number((request.query || {}).group);
  return {
    signature: signatureText(
      await signatureBlocks(
        Number(request.user.sub),
        Number.isInteger(mb) && mb > 0 ? mb : null,
        Number.isInteger(gr) && gr > 0 ? gr : null
      )
    ),
  };""")

# envio: remitente = grupo
rep("""  const senderEmail = permCheck.rows[0].email;
  const senderName = permCheck.rows[0].display_name;""",
"""  let senderEmail = permCheck.rows[0].email;
  let senderName = permCheck.rows[0].display_name;
  const sendGroupId = Number((body as any).from_group_id) > 0 ? Number((body as any).from_group_id) : null;
  if (sendGroupId) {
    const okGroup = await groupForSender(request, sendGroupId);
    if (!okGroup) return reply.status(403).send({ error: 'No puedes enviar desde ese grupo' });
    senderEmail = okGroup.address;
    senderName = okGroup.name;
  }""")
rep("const sigBlocks = body.include_signature === false ? [] : await signatureBlocks(Number(userId), mailboxId);",
    "const sigBlocks = body.include_signature === false ? [] : await signatureBlocks(Number(userId), mailboxId, sendGroupId);")
rep("JSON.stringify({ to: toAddress, subject: subject, text: textBody,",
    "JSON.stringify({ from: senderEmail, to: toAddress, subject: subject, text: textBody,")

# panel: todos los buzones sin titular + departamentales, y los grupos
rep("     WHERE mb.kind = 'department' ORDER BY mb.display_name`",
    "     WHERE mb.kind = 'department' OR mb.owner_user_id IS NULL ORDER BY mb.display_name`")
rep("  return { footer: f.rows.length > 0 ? f.rows[0].value : '', users: users.rows, mailboxes: mbs.rows };",
"""  const grs = await pool.query("SELECT id, name, address, COALESCE(signature, '') AS signature FROM mail_groups ORDER BY name");
  return { footer: f.rows.length > 0 ? f.rows[0].value : '', users: users.rows, mailboxes: mbs.rows, groups: grs.rows };""")

ROUTES = r"""// ===== FIRMAS DE GRUPO Y ENVIAR COMO GRUPO (patch16) =====
async function groupForSender(request: any, groupId: number): Promise<any | null> {
  const g = await pool.query('SELECT id, name, address FROM mail_groups WHERE id = $1', [groupId]);
  if (g.rows.length === 0) return null;
  if (isSuper(request)) return g.rows[0];
  const m = await pool.query(
    `SELECT 1 FROM virtual_aliases va
     JOIN virtual_users vu ON vu.email = va.destination
     JOIN mailboxes mb ON mb.virtual_user_id = vu.id AND mb.kind = 'personal' AND mb.owner_user_id = $2
     WHERE va.source = $1 LIMIT 1`,
    [g.rows[0].address, request.user.sub]
  );
  return m.rows.length > 0 ? g.rows[0] : null;
}

app.get('/me/senders', { preHandler: [(app as any).authenticate] }, async (request: any) => {
  if (isSuper(request)) {
    const all = await pool.query("SELECT id, name, address FROM mail_groups ORDER BY name");
    return { groups: all.rows };
  }
  const r = await pool.query(
    `SELECT DISTINCT g.id, g.name, g.address FROM mail_groups g
     JOIN virtual_aliases va ON va.source = g.address
     JOIN virtual_users vu ON vu.email = va.destination
     JOIN mailboxes mb ON mb.virtual_user_id = vu.id AND mb.kind = 'personal' AND mb.owner_user_id = $1
     ORDER BY g.name`,
    [request.user.sub]
  );
  return { groups: r.rows };
});

app.patch('/admin/groups/:id/signature', { preHandler: SUPER_PRE }, async (request: any) => {
  const id = Number(request.params.id);
  const text = String(((request.body || {}) as any).signature || '').trim();
  if (text.length > 1000) throw httpError(400, 'La firma es demasiado larga (maximo 1000 caracteres)');
  const r = await pool.query('UPDATE mail_groups SET signature = $1 WHERE id = $2 RETURNING id', [text === '' ? null : text, id]);
  if (r.rows.length === 0) throw httpError(404, 'Grupo no encontrado');
  return { success: true };
});

"""
s = s.replace('const start = async', ROUTES + 'const start = async', 1)
shutil.copy(p, p + '.bak16-' + time.strftime('%Y%m%d-%H%M%S'))
open(p, 'w', encoding='utf-8').write(s)
print('OK: firmas de grupo y enviar como grupo aplicado')
