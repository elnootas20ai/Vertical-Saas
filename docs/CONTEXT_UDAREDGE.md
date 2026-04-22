# Contexto de infraestructura Udar / udaredge.com

Este documento existe para **desarrolladores humanos** y para **agentes de IA** que trabajen en el repo: resume la fuente de verdad del dominio, del servidor y del entorno local, y lista **qué revisar antes de cambiar código** si algo podría seguir apuntando a otro sitio.

---

## 1. Marca y URL canónicas

| Concepto | Valor esperado |
|----------|----------------|
| Dominio principal | **https://udaredge.com** |
| Variante con www | **https://www.udaredge.com** |
| Correos de producto | `*@udaredge.com` (soporte, hola, facturas, etc. según pantalla) |

Cualquier copy, enlace público o `APP_URL` de producción debe alinearse con **udaredge.com**, no con dominios antiguos del fork o de otra infraestructura.

---

## 2. Servidor público actual (VPS)

| Dato | Valor | Notas |
|------|--------|--------|
| IP del host | **51.158.120.151** | Confirmado como servidor actual del proyecto. |
| Uso típico | Acceso por IP para pruebas o servicios detrás del mismo nginx; el producto se presenta como **udaredge.com**. |

Si en configuración aparece **otra IP**, tratarla como **heredada** hasta comprobar en despliegue real (DNS, panel del proveedor, `ssh`).

---

## 3. Desarrollo en esta máquina (local)

| Servicio | Puerto | Cómo se arranca |
|----------|--------|------------------|
| Frontend (Vite) | **3015** | `npm run dev` — fuente de verdad: `vite.config.ts` (`server.port`) |
| Backend (Express) | **3001** | `npm run backend:dev` — `PORT` en `.env` / `.env.development` |
| Proxy API en Vite | — | Las peticiones a `/api` van a `http://localhost:3001` |

**CORS en desarrollo:** el backend solo acepta orígenes listados en `ALLOWED_ORIGINS`. Para probar desde la red LAN suele hacer falta incluir `http://<IP-LAN>:3015` (ej. `192.168.x.x`), además de `http://localhost:3015`.

---

## 4. Qué revisar **antes** de tocar el proyecto (conexiones “fuera” de udaredge / esta IP / local)

Orden sugerido; no implica borrar código al azar, solo **validar** que cada variable apunta al entorno correcto.

### Variables de entorno (`.env`, `.env.development`, `.env.production`)

- **`ALLOWED_ORIGINS`** — Debe incluir los orígenes desde los que se sirve el front (https://udaredge.com, https://www.udaredge.com, y en dev localhost / IP LAN si aplica). Orígenes de otro dominio u otra IP son candidatos a corrección.
- **`APP_URL`** — URL pública del backend para enlaces en emails, facturas, etc.; en producción debe ser **https://udaredge.com** (o la URL definitiva que uséis).
- **`VITE_HOST`** — Host donde se espera el front en build/deploy; debe coherencia con nginx/Capacitor, no con una máquina ajena.
- **`COUCHDB_URL` / credenciales** — Deben ser la instancia CouchDB que usáis **ahora** (local en dev, servidor en prod). No son “dominio udaredge”, pero sí conexión crítica.
- **Claves de terceros** (MONEI, Resend, OpenAI, Google Maps, etc.) — Deben ser las del **proyecto actual**; si el repo se copió de otro servidor, conviene rotar lo sensible.

### Código y configuración versionada

- **`vite.config.ts` → `server.allowedHosts`** — Quién puede usar el header `Host` contra el dev server de Vite. En este repo están `localhost`, la IP del VPS (**51.158.120.151**), **`udaredge.com`** y **`www.udaredge.com`**. Si añadís otro hostname (staging, tunnel), actualizad la lista aquí.
- **Webhooks** (Stripe/MONEI/cualquier integración) — URLs de callback configuradas en paneles externos deben apuntar a **este** backend/dominio.
- **OAuth / redirect URIs** (Google, etc.) — En consola de Google Cloud deben coincidir con los hosts reales (udaredge.com y localhost para dev).
- **`capacitor.config.ts`** — Si usáis app nativa, la URL del servidor debe ser la definitiva, no una IP huérfana de otro entorno.

### Servicios externos (no son “malos”; no hay que sustituirlos por udaredge)

Estos dominios son **normales**: APIs de OpenAI, Google (`accounts.google.com`, Maps), Resend, generadores de QR públicos, fuentes, etc. Solo revisad que las **claves** sean vuestras.

---

## 5. Archivos útiles para buscar URLs antiguas

| Ubicación | Qué suele contener |
|-----------|---------------------|
| `.env*` | Orígenes, URLs, IPs (no commitear secretos reales). |
| `vite.config.ts` | `allowedHosts`, proxy `/api`. |
| `index.js` | Comentarios y lógica de `ALLOWED_ORIGINS`. |
| `package.json` | Scripts; nombre del paquete puede seguir siendo plantilla (`@figma/...`) sin afectar al deploy. |
| `ecosystem.config.cjs` | PM2 (nombres `udaredge-*`). |
| `readme/copy/*`, `docs/tickets/*` | Documentación histórica; puede mencionar URLs de ejemplo. |

---

## 6. Cambios ya hechos en una sesión reciente de “aterrizaje” del repo

Hechos que **no dependen de la memoria del chat** y están en el código o en conversación guardada:

- Arranque local documentado: backend **3001**, frontend **3015**.
- Eliminación del **sync heredado Cursor IDE → CouchDB** (rutas fijas de otro servidor Linux): ya no existe `/api/cursor` ni servicio en segundo plano asociado.
- Eliminación de **`urdu.com`** de `allowedHosts` en Vite (dominio ajeno al producto actual).

Si algo más cambió solo en el servidor (nginx, DNS, certificados), conviene **añadirlo aquí en una línea** cuando lo fijéis por escrito.

---

## 7. Duplicados y trampas habituales

- Mantener **un solo** `.env` local por entorno (`.env`, `.env.development`, etc.) para no duplicar variables entre ficheros con nombres raros.
- **`VITE_PORT` en `.env.example`** puede diferir del puerto real de Vite en `vite.config.ts` (3015): la fuente de verdad del **dev server** es **`vite.config.ts`**.

---

## Cómo usar este doc en el día a día

Antes de un refactor grande o de un deploy: **abrir esta checklist**, grep de `ALLOWED_ORIGINS` / IP antigua / dominios que no sean `udaredge.com`, y solo entonces entrar en cambios de producto.
