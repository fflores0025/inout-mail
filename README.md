# InOut Mail

Webmail de InOut Media (Next.js). Consume la API en `mail-api.inout-media.es` (login, buzones personales/departamentales, lectura y envío de correo).

## Desarrollo

```bash
npm install
npm run dev
```

Copia `.env.example` a `.env.local` y ajusta `NEXT_PUBLIC_MAIL_API_URL` si hace falta.

## Estructura

- `app/login` — pantalla de acceso
- `app/(webmail)` — layout con listado de buzones + bandeja de entrada
- `lib/api.ts` — cliente de la API de correo
- `lib/session.ts` — gestión del token de sesión (cookie)
