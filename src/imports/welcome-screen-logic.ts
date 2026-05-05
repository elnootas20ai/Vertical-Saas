Actúa como lead developer + product engineer. Quiero que “todo coja vida” en Vertial (compraventa) y que el producto funcione end-to-end con datos reales (NO mock, NO JSON hardcodeado, NO arrays en el front). Mantén el diseño/UX actual tal cual (no rediseñar), pero implementa lógica, backend, base de datos, autenticación, permisos, y flujos completos.

REGLA #1 (OBLIGATORIA)
- Prohibido usar datos mock. Todo lo que se ve en pantalla debe venir de la base de datos y/o servicios reales.
- Si falta un dato, el sistema debe: (a) pedirlo al usuario con un formulario, o (b) mostrar estado vacío/placeholder de UI (“Aún no hay…”) pero siempre conectado a BD.

OBJETIVO
Implementar el MVP funcional:
1) Web → Registro/Login → Onboarding → Creación de empresa → Pantalla “Bienvenido a tu espacio” (selector de empresa) → Entrada al SaaS
2) SaaS con módulos: Dashboard, Operaciones, Vehículos, Ubicaciones, Clientes, Documentos, Ventas, Llamadas (placeholder con BD), ANCOVE (placeholder con BD), Equipo, Finanzas, Sistema
3) Todos los botones deben funcionar (navegar, guardar, crear, editar, borrar, subir documento, cambiar estado, etc.)

PANTALLA ACTUAL A IMPLEMENTAR (la de la captura)
“Bienvenido a tu espacio”
- Mostrar lista REAL de empresas a las que el usuario pertenece (nombre + CIF)
- Botón “Entrar a [Empresa]”: setea empresa activa (tenant) y navega al Dashboard del SaaS
- Botón “Invitar a un trabajador”: abre modal real, envía invitación por email, crea usuario pendiente y relación a empresa
- Link “Cerrar sesión”: cierra sesión real
- Texto “Tu prueba gratuita de 14 días ha comenzado”: debe calcularse con fechas reales (trial_start, trial_end) en BD

ARQUITECTURA MULTIEMPRESA (TENANCY)
- Un usuario puede pertenecer a 1 o varias empresas.
- Toda consulta debe filtrar por empresa activa (company_id).
- Implementar selector de empresa y persistir “empresa activa” (en sesión o en perfil).

MODELOS DE DATOS (mínimos)
- users (id, name, email, phone, created_at)
- companies (id, name, cif, province, address, ancove_member, ancove_number, trial_start, trial_end, plan, created_at)
- memberships (id, user_id, company_id, role, status[active/invited], invited_email, invited_at, accepted_at)
- vehicles (id, company_id, plate, vin, brand, model, year, km, buy_price, sell_price, status, days_in_stock, location_id, created_at)
- locations (id, company_id, zone, row, spot, label)
- customers (id, company_id, type[lead/customer], name, dni, phone, email, address, consent, created_at)
- operations (id, company_id, type[buy/sell], vehicle_id, customer_id, stage, status, owner_user_id, location_snapshot, created_at)
- documents (id, company_id, vehicle_id, customer_id, operation_id, type[recepcion/contrato/hoja/factura/gestoria], file_url, status[pending/signed/sent], signed_at, sent_to_gestoria_at, created_at)
- sales (id, company_id, vehicle_id, customer_id, pipeline_status, deposit_amount, total_amount, created_at)
- calls (id, company_id, customer_id, phone, direction[in/out], notes, transcript, summary, created_at)
- ancove_sync (id, company_id, status, last_sync_at, payload_ref, created_at)
- audit_events (id, company_id, user_id, entity, entity_id, action, meta_json, created_at)

ROLES (MVP)
- Gerente (admin), Comercial, Administración
Permisos básicos:
- Gerente: todo
- Comercial: vehículos, clientes, operaciones, ventas, llamadas, documentos (crear/ver)
- Administración: documentos, gestoría, finanzas simple, clientes (ver/editar)

ENDPOINTS / ACCIONES (mínimos)
Auth:
- POST /auth/register
- POST /auth/login
- POST /auth/logout
- POST /auth/forgot
- POST /auth/reset
Onboarding/Companies:
- POST /companies (crear empresa + trial + plan recomendado)
- GET /companies (lista empresas del usuario)
- POST /companies/:id/select (set empresa activa)
Membership/Invites:
- POST /companies/:id/invite (email + role)
- POST /invites/:token/accept
Core CRUD por empresa:
- /vehicles, /customers, /operations, /documents, /locations, /sales, /calls, /finances (simple)
Documentos:
- upload real (storage), link real en BD
- acciones: “Marcar firmado”, “Enviar a gestoría” actualizan status y registran audit_event

REGLA UX
- Mantener diseño existente.
- Empty states reales: si no hay empresas/vehículos/etc, mostrar vacío y CTA para crear/importar.
- Formularios con validación real y mensajes de error.

PROTOTIPO → APP REAL
- Reemplaza cualquier dato de ejemplo (Coches García, CIF B12345678) por datos reales de BD.
- En desarrollo, si no hay datos, crea flujo para que el usuario cree su primera empresa y se auto-asigne como Gerente.

PLAN DE EJECUCIÓN (en partes, pidiéndome OK)
Bloque 1: Auth + Companies + Memberships + pantalla “Bienvenido a tu espacio” funcionando (sin mocks). Pregunta “¿OK?”.
Bloque 2: Selector empresa activa + Dashboard con KPIs reales (0 si vacío). Pregunta “¿OK?”.
Bloque 3: Vehículos + Ubicaciones + Operaciones (CRUD + estados + filtros). Pregunta “¿OK?”.
Bloque 4: Clientes + Documentos (upload real + firmado/enviado). Pregunta “¿OK?”.
Bloque 5: Ventas + Finanzas simple + Llamadas placeholder con BD + ANCOVE placeholder con BD. Pregunta “¿OK?”.
Bloque 6: Equipo (usuarios/roles) + auditoría básica + hardening. Pregunta “¿OK?”.

ENTREGABLE FINAL
- App funcional sin mocks.
- README técnico con: setup, migraciones, variables de entorno, modelos, endpoints, permisos, storage, y flujo multiempresa.