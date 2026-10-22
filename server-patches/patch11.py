import sys, shutil, time

p = sys.argv[1] if len(sys.argv) > 1 else '/home/ubuntu/inout-mail-api/src/index.ts'
s = open(p, encoding='utf-8').read()

if 'GRUPOS DE REENVIO (patch11)' in s:
    sys.exit('Ya estaba aplicado, no hago nada')
if 'SESION LARGA (patch10)' not in s:
    sys.exit('Falta aplicar antes el parche 10. No se ha cambiado nada.')
if s.count('const start = async') != 1:
    sys.exit('NO SE ENCONTRO const start. No se ha cambiado nada.')

ROUTES = r"""// ===== GRUPOS DE REENVIO (patch11) =====
// Un grupo es una direccion sin buzon propio: cada correo que llega se copia al buzon personal de cada miembro.
async function groupMembers(address: string): Promise<any[]> {
  const r = await pool.query(
    `SELECT va.id AS alias_id, va.destination, au.id AS user_id, au.full_name,
            (vu.id IS NOT NULL) AS mailbox_exists
     FROM virtual_aliases va
     LEFT JOIN virtual_users vu ON vu.email = va.destination
     LEFT JOIN mailboxes mb ON mb.virtual_user_id = vu.id AND mb.kind = 'personal'
     LEFT JOIN app_users au ON au.id = mb.owner_user_id
     WHERE va.source = $1
     ORDER BY va.destination`,
    [address]
  );
  return r.rows;
}

app.get('/admin/groups', { preHandler: SUPER_PRE }, async () => {
  const g = await pool.query('SELECT id, address, name, created_at FROM mail_groups ORDER BY name');
  const groups: any[] = [];
  for (const row of g.rows) {
    groups.push({ ...row, members: await groupMembers(row.address) });
  }
  return { groups };
});

app.post('/admin/groups', { preHandler: SUPER_PRE }, async (request: any) => {
  const body = (request.body || {}) as any;
  const name = String(body.name || '').trim();
  const address = fullEmail(body.address);
  if (!name || !address) throw httpError(400, 'Nombre y direccion son requeridos');
  const [localPart, domain] = address.split('@');
  if (!localPart || !domain || !/^[a-z0-9._+-]+$/i.test(localPart)) {
    throw httpError(400, 'La direccion solo puede tener letras, numeros, punto, guion y guion bajo');
  }
  const d = await pool.query('SELECT id FROM virtual_domains WHERE name = $1', [domain]);
  if (d.rows.length === 0) throw httpError(400, 'El dominio ' + domain + ' no esta dado de alta');
  const taken = await pool.query('SELECT 1 FROM virtual_users WHERE email = $1', [address]);
  if (taken.rows.length > 0) throw httpError(409, 'Ya existe una direccion con ese nombre');
  const other = await pool.query('SELECT 1 FROM virtual_aliases WHERE source = $1', [address]);
  if (other.rows.length > 0) throw httpError(409, 'Esa direccion ya se usa como redireccion');
  try {
    const r = await pool.query(
      'INSERT INTO mail_groups (address, name) VALUES ($1, $2) RETURNING id, address, name, created_at',
      [address, name]
    );
    return { group: { ...r.rows[0], members: [] } };
  } catch (err: any) {
    if (err.code === '23505') throw httpError(409, 'Ya existe un grupo con esa direccion');
    throw err;
  }
});

app.delete('/admin/groups/:id', { preHandler: SUPER_PRE }, async (request: any) => {
  const id = Number(request.params.id);
  const g = await pool.query('SELECT address FROM mail_groups WHERE id = $1', [id]);
  if (g.rows.length === 0) throw httpError(404, 'Grupo no encontrado');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM virtual_aliases WHERE source = $1', [g.rows[0].address]);
    await client.query('DELETE FROM mail_groups WHERE id = $1', [id]);
    await client.query('COMMIT');
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { success: true };
});

app.post('/admin/groups/:id/members', { preHandler: SUPER_PRE }, async (request: any) => {
  const id = Number(request.params.id);
  const userId = Number((request.body || {}).user_id);
  if (!Number.isInteger(userId) || userId < 1) throw httpError(400, 'Falta el usuario');
  const g = await pool.query('SELECT address FROM mail_groups WHERE id = $1', [id]);
  if (g.rows.length === 0) throw httpError(404, 'Grupo no encontrado');
  const box = await pool.query(
    `SELECT vu.email FROM mailboxes mb
     JOIN virtual_users vu ON vu.id = mb.virtual_user_id
     WHERE mb.owner_user_id = $1 AND mb.kind = 'personal'
       AND COALESCE(mb.status, 'active') <> 'disabled' AND vu.active = true`,
    [userId]
  );
  if (box.rows.length === 0) throw httpError(400, 'Este usuario no tiene buzon personal activo');
  const destination = box.rows[0].email;
  const domain = String(g.rows[0].address).split('@')[1];
  const d = await pool.query('SELECT id FROM virtual_domains WHERE name = $1', [domain]);
  if (d.rows.length === 0) throw httpError(400, 'El dominio ' + domain + ' no esta dado de alta');
  await pool.query(
    `INSERT INTO virtual_aliases (domain_id, source, destination)
     SELECT $1::int, $2::text, $3::text
     WHERE NOT EXISTS (SELECT 1 FROM virtual_aliases WHERE source = $2::text AND destination = $3::text)`,
    [d.rows[0].id, g.rows[0].address, destination]
  );
  return { members: await groupMembers(g.rows[0].address) };
});

app.delete('/admin/groups/:id/members/:aliasId', { preHandler: SUPER_PRE }, async (request: any) => {
  const id = Number(request.params.id);
  const aliasId = Number(request.params.aliasId);
  const g = await pool.query('SELECT address FROM mail_groups WHERE id = $1', [id]);
  if (g.rows.length === 0) throw httpError(404, 'Grupo no encontrado');
  await pool.query('DELETE FROM virtual_aliases WHERE id = $1 AND source = $2', [aliasId, g.rows[0].address]);
  return { members: await groupMembers(g.rows[0].address) };
});

"""

s = s.replace('const start = async', ROUTES + 'const start = async', 1)
shutil.copy(p, p + '.bak11-' + time.strftime('%Y%m%d-%H%M%S'))
open(p, 'w', encoding='utf-8').write(s)
print('OK: grupos de reenvio aplicados')
