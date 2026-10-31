import sys, shutil, time

p = sys.argv[1] if len(sys.argv) > 1 else '/home/ubuntu/inout-mail-api/src/index.ts'
s = open(p, encoding='utf-8').read()

if 'EDITAR NOMBRES Y GRUPOS (patch13)' in s:
    sys.exit('Ya estaba aplicado, no hago nada')
if 'ADJUNTOS Y FIRMAS (patch12)' not in s:
    sys.exit('Falta aplicar antes el parche 12. No se ha cambiado nada.')
if s.count('const start = async') != 1:
    sys.exit('NO SE ENCONTRO const start. No se ha cambiado nada.')

ROUTES = r"""// ===== EDITAR NOMBRES Y GRUPOS (patch13) =====
app.patch('/admin/users/:id/name', { preHandler: SUPER_PRE }, async (request: any) => {
  const userId = Number(request.params.id);
  const name = String(((request.body || {}) as any).full_name || '').trim();
  if (!name) throw httpError(400, 'El nombre no puede estar vacio');
  if (name.length > 120) throw httpError(400, 'El nombre es demasiado largo');
  const old = await pool.query('SELECT full_name FROM app_users WHERE id = $1', [userId]);
  if (old.rows.length === 0) throw httpError(404, 'Usuario no encontrado');
  const r = await pool.query('UPDATE app_users SET full_name = $1 WHERE id = $2 RETURNING id, full_name', [name, userId]);
  await pool.query(
    "UPDATE mailboxes SET display_name = $1 WHERE owner_user_id = $2 AND kind = 'personal' AND display_name = $3",
    [name, userId, old.rows[0].full_name]
  );
  return { user: r.rows[0] };
});

app.patch('/admin/mailboxes/:id/name', { preHandler: SUPER_PRE }, async (request: any) => {
  const id = Number(request.params.id);
  const name = String(((request.body || {}) as any).display_name || '').trim();
  if (!name) throw httpError(400, 'El nombre no puede estar vacio');
  if (name.length > 120) throw httpError(400, 'El nombre es demasiado largo');
  const r = await pool.query('UPDATE mailboxes SET display_name = $1 WHERE id = $2 RETURNING id, display_name', [name, id]);
  if (r.rows.length === 0) throw httpError(404, 'Buzon no encontrado');
  return { mailbox: r.rows[0] };
});

app.patch('/admin/groups/:id', { preHandler: SUPER_PRE }, async (request: any) => {
  const id = Number(request.params.id);
  const body = (request.body || {}) as any;
  const g = await pool.query('SELECT id, address, name FROM mail_groups WHERE id = $1', [id]);
  if (g.rows.length === 0) throw httpError(404, 'Grupo no encontrado');
  const oldAddress = g.rows[0].address;
  const name = body.name !== undefined ? String(body.name).trim() : g.rows[0].name;
  if (!name) throw httpError(400, 'El nombre no puede estar vacio');
  const address = body.address !== undefined && String(body.address).trim() !== '' ? fullEmail(body.address) : oldAddress;
  const [localPart, domain] = String(address).split('@');
  if (!localPart || !domain || !/^[a-z0-9._+-]+$/i.test(localPart)) {
    throw httpError(400, 'La direccion solo puede tener letras, numeros, punto, guion y guion bajo');
  }
  let domainId: number | null = null;
  if (address !== oldAddress) {
    const d = await pool.query('SELECT id FROM virtual_domains WHERE name = $1', [domain]);
    if (d.rows.length === 0) throw httpError(400, 'El dominio ' + domain + ' no esta dado de alta');
    domainId = d.rows[0].id;
    const taken = await pool.query('SELECT 1 FROM virtual_users WHERE email = $1', [address]);
    if (taken.rows.length > 0) throw httpError(409, 'Ya existe una direccion con ese nombre');
    const other = await pool.query('SELECT 1 FROM virtual_aliases WHERE source = $1', [address]);
    if (other.rows.length > 0) throw httpError(409, 'Esa direccion ya se usa como redireccion');
    const grp = await pool.query('SELECT 1 FROM mail_groups WHERE address = $1 AND id <> $2', [address, id]);
    if (grp.rows.length > 0) throw httpError(409, 'Ya existe un grupo con esa direccion');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE mail_groups SET name = $1, address = $2 WHERE id = $3', [name, address, id]);
    if (address !== oldAddress) {
      await client.query('UPDATE virtual_aliases SET source = $1, domain_id = $2 WHERE source = $3', [address, domainId, oldAddress]);
    }
    await client.query('COMMIT');
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (err.code === '23505') throw httpError(409, 'Ya existe un grupo con esa direccion');
    throw err;
  } finally {
    client.release();
  }
  return { group: { id, name, address, members: await groupMembers(address) } };
});

"""

s = s.replace('const start = async', ROUTES + 'const start = async', 1)
shutil.copy(p, p + '.bak13-' + time.strftime('%Y%m%d-%H%M%S'))
open(p, 'w', encoding='utf-8').write(s)
print('OK: edicion de nombres y grupos aplicada')
