import sys, shutil, time

p = sys.argv[1] if len(sys.argv) > 1 else '/home/ubuntu/inout-mail-api/src/index.ts'
s = open(p, encoding='utf-8').read()

if 'CARGO EN VARIAS LINEAS (patch15)' in s:
    sys.exit('Ya estaba aplicado, no hago nada')
if 'FIRMA VISIBLE Y POR BUZON (patch14)' not in s:
    sys.exit('Falta aplicar antes el parche 14. No se ha cambiado nada.')

def rep(old, new):
    global s
    if s.count(old) != 1:
        sys.exit('NO SE ENCONTRO esta parte: ' + old[:70] + ' . No se ha cambiado nada.')
    s = s.replace(old, new, 1)

rep("      if (title) personal.push(title);",
    "      if (title) personal.push(...title.replace(/\\r\\n/g, '\\n').split('\\n')); // CARGO EN VARIAS LINEAS (patch15)")
rep("  const title = String(((request.body || {}) as any).job_title || '').trim();\n  if (title.length > 120) throw httpError(400, 'El cargo es demasiado largo (maximo 120 caracteres)');",
    "  const title = String(((request.body || {}) as any).job_title || '').replace(/\\r\\n/g, '\\n').trim();\n  if (title.length > 600) throw httpError(400, 'El texto es demasiado largo (maximo 600 caracteres)');")

shutil.copy(p, p + '.bak15-' + time.strftime('%Y%m%d-%H%M%S'))
open(p, 'w', encoding='utf-8').write(s)
print('OK: cargo en varias lineas aplicado')
