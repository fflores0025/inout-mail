import sys, shutil, time

p = sys.argv[1] if len(sys.argv) > 1 else '/home/ubuntu/inout-mail-api/src/index.ts'
s = open(p, encoding='utf-8').read()

if 'SOLO FIRMA DEL BUZON (patch17)' in s:
    sys.exit('Ya estaba aplicado, no hago nada')
if 'FIRMAS DE GRUPO Y ENVIAR COMO GRUPO (patch16)' not in s:
    sys.exit('Falta aplicar antes el parche 16. No se ha cambiado nada.')

def rep(old, new):
    global s
    if s.count(old) != 1:
        sys.exit('NO SE ENCONTRO esta parte: ' + old[:70] + ' . No se ha cambiado nada.')
    s = s.replace(old, new, 1)

rep("const m = await pool.query('SELECT signature FROM mailboxes WHERE id = $1', [mailboxId]);",
    "const m = await pool.query('SELECT signature, signature_only FROM mailboxes WHERE id = $1', [mailboxId]);")
rep("    if (t) dept = t.split('\\n');",
    "    if (t) {\n      dept = t.split('\\n');\n      if (m.rows[0].signature_only) return [dept]; // SOLO FIRMA DEL BUZON (patch17)\n    }")
rep("COALESCE(mb.signature, '') AS signature\n",
    "COALESCE(mb.signature, '') AS signature, COALESCE(mb.signature_only, false) AS signature_only\n")
rep("""  const r = await pool.query('UPDATE mailboxes SET signature = $1 WHERE id = $2 RETURNING id', [text === '' ? null : text, id]);""",
"""  const only = ((request.body || {}) as any).signature_only === true;
  const r = await pool.query('UPDATE mailboxes SET signature = $1, signature_only = $2 WHERE id = $3 RETURNING id', [text === '' ? null : text, only, id]);""")

shutil.copy(p, p + '.bak17-' + time.strftime('%Y%m%d-%H%M%S'))
open(p, 'w', encoding='utf-8').write(s)
print('OK: opcion solo firma del buzon aplicada')
