import sys, shutil, time

p = sys.argv[1] if len(sys.argv) > 1 else '/home/ubuntu/inout-mail-api/src/index.ts'
s = open(p, encoding='utf-8').read()

if 'DESTINATARIO EN LA LISTA (patch24)' in s:
    sys.exit('Ya estaba aplicado, no hago nada')
if 'CARPETAS (patch23)' not in s:
    sys.exit('Falta aplicar antes el parche 23. No se ha cambiado nada.')

old = "        from: from,\n        date: msg.envelope ? msg.envelope.date : null,\n"
new = ("        from: from,\n"
       "        // DESTINATARIO EN LA LISTA (patch24)\n"
       "        to: ((msg.envelope && msg.envelope.to) || []).map((a: any) => a.address || '').filter(Boolean).join(', '),\n"
       "        date: msg.envelope ? msg.envelope.date : null,\n")
if s.count(old) != 1:
    sys.exit('NO SE ENCONTRO la lista de mensajes. No se ha cambiado nada.')
s = s.replace(old, new, 1)
shutil.copy(p, p + '.bak24-' + time.strftime('%Y%m%d-%H%M%S'))
open(p, 'w', encoding='utf-8').write(s)
print('OK: destinatario en la lista aplicado')
