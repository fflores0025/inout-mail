import sys, shutil, time

p = sys.argv[1] if len(sys.argv) > 1 else '/home/ubuntu/inout-mail-api/src/index.ts'
s = open(p, encoding='utf-8').read()

if 'LIBRETA DE CONTACTOS (patch20)' in s:
    sys.exit('Ya estaba aplicado, no hago nada')
if 'SUGERENCIAS DE DESTINATARIOS (patch19)' not in s:
    sys.exit('Falta aplicar antes el parche 19. No se ha cambiado nada.')
if s.count('const start = async') != 1:
    sys.exit('NO SE ENCONTRO const start. No se ha cambiado nada.')

def rep(old, new):
    global s
    if s.count(old) != 1:
        sys.exit('NO SE ENCONTRO esta parte: ' + old[:70] + ' . No se ha cambiado nada.')
    s = s.replace(old, new, 1)

# autoguardar destinatarios nuevos al enviar
rep("  return { success: true, from: senderEmail, to: toAddress };",
"""  // Libreta: guarda en los contactos de quien envia las direcciones externas nuevas (patch20)
  try {
    for (const part of String(toAddress).split(/[,;]/)) {
      const m = part.match(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/);
      if (!m) continue;
      const email = m[0].toLowerCase();
      if (email.endsWith('@inout-media.es')) continue;
      const ex = await pool.query('SELECT 1 FROM contacts WHERE owner_user_id = $1 AND $2 = ANY(emails) LIMIT 1', [userId, email]);
      if (ex.rows.length === 0) {
        await pool.query(
          'INSERT INTO contacts (owner_user_id, name, emails, auto_added) VALUES ($1, $2, ARRAY[$3]::text[], true)',
          [userId, email.split('@')[0], email]
        );
      }
    }
  } catch (err: any) {
    request.log.error({ err: String(err && err.message) }, 'contactos: no se pudo autoguardar');
  }

  return { success: true, from: senderEmail, to: toAddress };""")

# autocompletar: contactos propios con nombre/empresa
rep("  return { recent, directory: Array.from(byEmail.values()) };",
"""  const mineRows = await pool.query(
    'SELECT name, company, job_title, emails FROM contacts WHERE owner_user_id = $1 ORDER BY lower(name)',
    [userId]
  );
  const mine: any[] = [];
  for (const c of mineRows.rows) {
    for (const e of c.emails || []) {
      mine.push({ name: c.name, company: c.company || '', job_title: c.job_title || '', email: String(e).toLowerCase() });
    }
  }
  return { recent, directory: Array.from(byEmail.values()), mine };""")

ROUTES = r"""// ===== LIBRETA DE CONTACTOS (patch20) =====
// super_admin ve todo; admin (manager) ve lo suyo y lo de los empleados; employee solo lo suyo.
function contactVisibility(request: any): { where: string; params: any[] } {
  const uid = Number(request.user.sub);
  if (request.user.role === 'super_admin') return { where: 'TRUE', params: [] };
  if (request.user.role === 'admin') return { where: "(c.owner_user_id = $1 OR ou.role = 'employee')", params: [uid] };
  return { where: 'c.owner_user_id = $1', params: [uid] };
}

function cleanEmails(input: any): string[] {
  const list = Array.isArray(input) ? input : String(input || '').split(/[,;\s]+/);
  const out: string[] = [];
  for (const raw of list) {
    const e = String(raw || '').trim().toLowerCase();
    if (!e) continue;
    if (!/^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) throw httpError(400, 'Correo no valido: ' + e);
    if (!out.includes(e)) out.push(e);
  }
  return out.slice(0, 10);
}

function contactFields(body: any) {
  const name = String(body.name || '').trim().slice(0, 150);
  const emails = cleanEmails(body.emails);
  if (!name && emails.length === 0) throw httpError(400, 'Pon al menos un nombre o un correo');
  return {
    name: name || emails[0].split('@')[0],
    company: String(body.company || '').trim().slice(0, 150) || null,
    job_title: String(body.job_title || '').trim().slice(0, 150) || null,
    emails,
    phone: String(body.phone || '').trim().slice(0, 60) || null,
    notes: String(body.notes || '').trim().slice(0, 1000) || null,
  };
}

app.get('/contacts', { preHandler: [(app as any).authenticate] }, async (request: any) => {
  const vis = contactVisibility(request);
  const r = await pool.query(
    `SELECT c.id, c.name, c.company, c.job_title, c.emails, c.phone, c.notes, c.auto_added, c.owner_user_id,
            ou.full_name AS owner_name
     FROM contacts c LEFT JOIN app_users ou ON ou.id = c.owner_user_id
     WHERE ${vis.where} ORDER BY lower(c.name) LIMIT 2000`,
    vis.params
  );
  const uid = Number(request.user.sub);
  const sup = request.user.role === 'super_admin';
  return {
    contacts: r.rows.map((c: any) => ({ ...c, mine: Number(c.owner_user_id) === uid, can_edit: sup || Number(c.owner_user_id) === uid })),
  };
});

app.post('/contacts', { preHandler: [(app as any).authenticate] }, async (request: any) => {
  const f = contactFields((request.body || {}) as any);
  const r = await pool.query(
    `INSERT INTO contacts (owner_user_id, name, company, job_title, emails, phone, notes)
     VALUES ($1, $2, $3, $4, $5::text[], $6, $7) RETURNING id`,
    [request.user.sub, f.name, f.company, f.job_title, f.emails, f.phone, f.notes]
  );
  return { id: r.rows[0].id };
});

async function contactEditable(request: any, id: number): Promise<void> {
  const c = await pool.query('SELECT owner_user_id FROM contacts WHERE id = $1', [id]);
  if (c.rows.length === 0) throw httpError(404, 'Contacto no encontrado');
  if (request.user.role !== 'super_admin' && Number(c.rows[0].owner_user_id) !== Number(request.user.sub)) {
    throw httpError(403, 'Solo puedes modificar tus propios contactos');
  }
}

app.patch('/contacts/:id', { preHandler: [(app as any).authenticate] }, async (request: any) => {
  const id = Number(request.params.id);
  await contactEditable(request, id);
  const f = contactFields((request.body || {}) as any);
  await pool.query(
    `UPDATE contacts SET name = $1, company = $2, job_title = $3, emails = $4::text[], phone = $5, notes = $6,
            auto_added = false, updated_at = now() WHERE id = $7`,
    [f.name, f.company, f.job_title, f.emails, f.phone, f.notes, id]
  );
  return { success: true };
});

app.delete('/contacts/:id', { preHandler: [(app as any).authenticate] }, async (request: any) => {
  const id = Number(request.params.id);
  await contactEditable(request, id);
  await pool.query('DELETE FROM contacts WHERE id = $1', [id]);
  return { success: true };
});

"""
s = s.replace('const start = async', ROUTES + 'const start = async', 1)
shutil.copy(p, p + '.bak20-' + time.strftime('%Y%m%d-%H%M%S'))
open(p, 'w', encoding='utf-8').write(s)
print('OK: libreta de contactos aplicada')
