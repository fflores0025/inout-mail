import sys, shutil, time

p = sys.argv[1] if len(sys.argv) > 1 else '/home/ubuntu/inout-mail-api/src/index.ts'
s = open(p, encoding='utf-8').read()

if 'SESION LARGA (patch10)' in s:
    sys.exit('Ya estaba aplicado, no hago nada')
if 'NOTIFICACIONES PUSH (patch9)' not in s:
    sys.exit('Falta aplicar antes el parche 9. No se ha cambiado nada.')
if s.count('app.setErrorHandler(') != 1:
    sys.exit('NO SE ENCONTRO setErrorHandler. No se ha cambiado nada.')

HOOK = r"""// ===== SESION LARGA (patch10) =====
// El inicio de sesion dura 90 dias y se renueva cada vez que se abre la app.
app.addHook('onSend', async (request: any, reply: any, payload: any) => {
  const path = String(request.url).split('?')[0];
  if (request.method === 'POST' && path === '/auth/login' && reply.statusCode === 200 && typeof payload === 'string') {
    try {
      const data = JSON.parse(payload);
      if (data && typeof data.token === 'string') {
        const decoded: any = (app as any).jwt.decode(data.token);
        if (decoded) {
          const { iat, exp, ...rest } = decoded;
          data.token = (app as any).jwt.sign(rest, { expiresIn: '90d' });
          return JSON.stringify(data);
        }
      }
    } catch (e) {
      /* si algo falla, se devuelve el token tal cual */
    }
  }
  return payload;
});

app.post('/auth/refresh', { preHandler: [(app as any).authenticate] }, async (request: any) => {
  const { iat, exp, role, ...rest } = request.user;
  return { token: (app as any).jwt.sign(rest, { expiresIn: '90d' }) };
});

"""

s = s.replace('app.setErrorHandler(', HOOK + 'app.setErrorHandler(', 1)

# Registros para ver por que llegan (o no) los avisos de correo
def rep(old, new):
    global s
    if s.count(old) == 1:
        s = s.replace(old, new, 1)
    else:
        print('AVISO: no se pudo anadir un registro (no pasa nada)')

rep("        client.on('exists', () => {\n          checkNew();\n        });",
    "        app.log.info({ mailbox: mb.email, lastUid: lastUid }, 'push: vigilando buzon');\n        client.on('exists', () => {\n          app.log.info({ mailbox: mb.email }, 'push: evento exists');\n          checkNew();\n        });")
rep("        lastUid = maxUid;\n        await notifyNewMail(mb, found);",
    "        lastUid = maxUid;\n        app.log.info({ mailbox: mb.email, nuevos: found.length }, 'push: correos nuevos');\n        await notifyNewMail(mb, found);")
rep("  if (ids.length === 0 || items.length === 0) return;",
    "  app.log.info({ mailbox: mb.email, destinatarios: ids.length }, 'push: enviando aviso');\n  if (ids.length === 0 || items.length === 0) return;")

shutil.copy(p, p + '.bak10-' + time.strftime('%Y%m%d-%H%M%S'))
open(p, 'w', encoding='utf-8').write(s)
print('OK: sesion larga y registros de avisos aplicados')
