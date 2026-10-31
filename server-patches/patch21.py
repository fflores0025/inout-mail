import sys, shutil, time

p = sys.argv[1] if len(sys.argv) > 1 else '/home/ubuntu/inout-mail-api/src/index.ts'
s = open(p, encoding='utf-8').read()

if 'CONTACTOS COMUNES Y PRIVADOS (patch21)' in s:
    sys.exit('Ya estaba aplicado, no hago nada')
if 'LIBRETA DE CONTACTOS (patch20)' not in s:
    sys.exit('Falta aplicar antes el parche 20. No se ha cambiado nada.')

def rep(old, new):
    global s
    if s.count(old) != 1:
        sys.exit('NO SE ENCONTRO esta parte: ' + old[:70] + ' . No se ha cambiado nada.')
    s = s.replace(old, new, 1)

# visibilidad: comunes para todos, privados solo del dueño
a = s.index('function contactVisibility(request: any)')
b = s.index('function cleanEmails(', a)
s = s[:a] + """// CONTACTOS COMUNES Y PRIVADOS (patch21): los comunes los ve todo el mundo, los privados solo su dueño.
function contactVisibility(request: any): { where: string; params: any[] } {
  return { where: '(c.shared = true OR c.owner_user_id = $1)', params: [Number(request.user.sub)] };
}

function canManageContact(request: any, c: any): boolean {
  if (Number(c.owner_user_id) === Number(request.user.sub)) return true;
  return !!c.shared && (request.user.role === 'admin' || request.user.role === 'super_admin');
}

""" + s[b:]

rep("c.auto_added, c.owner_user_id,", "c.auto_added, c.owner_user_id, c.shared,")
rep("""  const sup = request.user.role === 'super_admin';
  return {
    contacts: r.rows.map((c: any) => ({ ...c, mine: Number(c.owner_user_id) === uid, can_edit: sup || Number(c.owner_user_id) === uid })),
  };""",
"""  return {
    contacts: r.rows.map((c: any) => ({ ...c, mine: Number(c.owner_user_id) === uid, can_edit: canManageContact(request, c) })),
  };""")

# alta con opcion de compartir
rep("""    `INSERT INTO contacts (owner_user_id, name, company, job_title, emails, phone, notes)
     VALUES ($1, $2, $3, $4, $5::text[], $6, $7) RETURNING id`,
    [request.user.sub, f.name, f.company, f.job_title, f.emails, f.phone, f.notes]""",
"""    `INSERT INTO contacts (owner_user_id, name, company, job_title, emails, phone, notes, shared)
     VALUES ($1, $2, $3, $4, $5::text[], $6, $7, $8) RETURNING id`,
    [request.user.sub, f.name, f.company, f.job_title, f.emails, f.phone, f.notes, ((request.body || {}) as any).shared === true]""")

# permisos de edicion
a = s.index('async function contactEditable(')
b = s.index("app.patch('/contacts/:id'", a)
s = s[:a] + """async function contactEditable(request: any, id: number): Promise<void> {
  const c = await pool.query('SELECT owner_user_id, shared FROM contacts WHERE id = $1', [id]);
  if (c.rows.length === 0) throw httpError(404, 'Contacto no encontrado');
  if (!canManageContact(request, c.rows[0])) throw httpError(403, 'No puedes modificar este contacto');
}

app.post('/contacts/:id/share', { preHandler: [(app as any).authenticate] }, async (request: any) => {
  const id = Number(request.params.id);
  await contactEditable(request, id);
  const shared = ((request.body || {}) as any).shared === true;
  await pool.query('UPDATE contacts SET shared = $1, auto_added = false, updated_at = now() WHERE id = $2', [shared, id]);
  return { success: true };
});

""" + s[b:]

# autocompletar y autoguardado tienen en cuenta los comunes
rep("'SELECT name, company, job_title, emails FROM contacts WHERE owner_user_id = $1 ORDER BY lower(name)'",
    "'SELECT name, company, job_title, emails FROM contacts WHERE owner_user_id = $1 OR shared = true ORDER BY lower(name)'")
rep("'SELECT 1 FROM contacts WHERE owner_user_id = $1 AND $2 = ANY(emails) LIMIT 1'",
    "'SELECT 1 FROM contacts WHERE (owner_user_id = $1 OR shared = true) AND $2 = ANY(emails) LIMIT 1'")

shutil.copy(p, p + '.bak21-' + time.strftime('%Y%m%d-%H%M%S'))
open(p, 'w', encoding='utf-8').write(s)
print('OK: contactos comunes y privados aplicado')
