import sys, shutil, time

p = sys.argv[1] if len(sys.argv) > 1 else '/home/ubuntu/inout-mail-api/src/index.ts'
s = open(p, encoding='utf-8').read()

if 'RESPUESTAS RAPIDAS (patch27)' in s:
    sys.exit('Ya estaba aplicado, no hago nada')
if 'PLANTILLAS DE CORREO (patch26)' not in s:
    sys.exit('Falta aplicar antes el parche 26. No se ha cambiado nada.')


def rep(old, new):
    global s
    if s.count(old) != 1:
        sys.exit('NO SE ENCONTRO: ' + old[:70] + ' . No se ha cambiado nada.')
    s = s.replace(old, new, 1)


rep("'SELECT id, key, name, subject, body, active, updated_at FROM mail_templates ORDER BY name'",
    "'SELECT id, key, name, subject, body, active, quick, updated_at FROM mail_templates ORDER BY name'")
rep("'INSERT INTO mail_templates (key, name, subject, body) VALUES ($1, $2, $3, $4) RETURNING id',\n      [key, String(b.name).trim(), String(b.subject).trim(), String(b.body)]",
    "'INSERT INTO mail_templates (key, name, subject, body, quick) VALUES ($1, $2, $3, $4, $5) RETURNING id',\n      [key, String(b.name).trim(), String(b.subject).trim(), String(b.body), b.quick === true]")
rep("`UPDATE mail_templates SET name = $2, subject = $3, body = $4, active = $5, updated_at = now() WHERE id = $1 RETURNING id`,\n    [Number(request.params.id), String(b.name || '').trim(), String(b.subject || '').trim(), String(b.body || ''), b.active !== false]",
    "`UPDATE mail_templates SET name = $2, subject = $3, body = $4, active = $5, quick = $6, updated_at = now() WHERE id = $1 RETURNING id`,\n    [Number(request.params.id), String(b.name || '').trim(), String(b.subject || '').trim(), String(b.body || ''), b.active !== false, b.quick === true]")

CODE = r"""// ===== RESPUESTAS RAPIDAS (patch27) =====
app.get('/templates/quick', { preHandler: [(app as any).authenticate] }, async () => {
  const r = await pool.query(
    'SELECT id, name, subject, body FROM mail_templates WHERE quick = true AND active = true ORDER BY name'
  );
  return { templates: r.rows };
});

"""
if s.count('const start = async') != 1:
    sys.exit('NO SE ENCONTRO const start. No se ha cambiado nada.')
s = s.replace('const start = async', CODE + 'const start = async', 1)
shutil.copy(p, p + '.bak27-' + time.strftime('%Y%m%d-%H%M%S'))
open(p, 'w', encoding='utf-8').write(s)
print('OK: respuestas rapidas aplicadas')
