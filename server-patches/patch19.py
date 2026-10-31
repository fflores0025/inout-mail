import sys, shutil, time

p = sys.argv[1] if len(sys.argv) > 1 else '/home/ubuntu/inout-mail-api/src/index.ts'
s = open(p, encoding='utf-8').read()

if 'SUGERENCIAS DE DESTINATARIOS (patch19)' in s:
    sys.exit('Ya estaba aplicado, no hago nada')
if 'FIRMAS DE GRUPO Y ENVIAR COMO GRUPO (patch16)' not in s:
    sys.exit('Falta aplicar antes el parche 16. No se ha cambiado nada.')
if s.count('const start = async') != 1:
    sys.exit('NO SE ENCONTRO const start. No se ha cambiado nada.')

ROUTES = r"""// ===== SUGERENCIAS DE DESTINATARIOS (patch19) =====
app.get('/me/contacts', { preHandler: [(app as any).authenticate] }, async (request: any) => {
  const userId = Number(request.user.sub);
  // Ultimos destinatarios a los que ha escrito este usuario
  const rows = await pool.query(
    "SELECT details FROM mailbox_audit_log WHERE app_user_id = $1 AND action = 'sent' ORDER BY created_at DESC LIMIT 300",
    [userId]
  );
  const seen = new Set<string>();
  const recent: string[] = [];
  for (const r of rows.rows) {
    let d: any = r.details;
    if (typeof d === 'string') {
      try { d = JSON.parse(d); } catch { d = null; }
    }
    const to = d && d.to ? String(d.to) : '';
    for (const part of to.split(/[,;]/)) {
      const m = part.match(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      if (!m) continue;
      const email = m[0].toLowerCase();
      if (seen.has(email)) continue;
      seen.add(email);
      recent.push(email);
      if (recent.length >= 30) break;
    }
    if (recent.length >= 30) break;
  }
  // Directorio interno: personas, buzones y grupos
  const dir = await pool.query(
    `SELECT name, email FROM (
       SELECT full_name AS name, login_email AS email FROM app_users WHERE status IS DISTINCT FROM 'disabled'
       UNION
       SELECT mb.display_name, vu.email FROM mailboxes mb JOIN virtual_users vu ON vu.id = mb.virtual_user_id
         WHERE COALESCE(mb.status, 'active') <> 'disabled' AND vu.active = true
       UNION
       SELECT name, address FROM mail_groups
     ) x ORDER BY lower(name)`
  );
  const byEmail = new Map<string, { name: string; email: string }>();
  for (const r of dir.rows) {
    const e = String(r.email).toLowerCase();
    if (!byEmail.has(e)) byEmail.set(e, { name: r.name, email: e });
  }
  return { recent, directory: Array.from(byEmail.values()) };
});

"""
s = s.replace('const start = async', ROUTES + 'const start = async', 1)
shutil.copy(p, p + '.bak19-' + time.strftime('%Y%m%d-%H%M%S'))
open(p, 'w', encoding='utf-8').write(s)
print('OK: sugerencias de destinatarios aplicadas')
