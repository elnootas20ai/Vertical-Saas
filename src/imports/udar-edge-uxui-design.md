Actúa como diseñador/a UX/UI senior. Necesito diseñar el CAMINO DE ACCESO completo para UDAR EDGE (compraventa de coches en España), manteniendo el mismo estilo visual de mi web y del SaaS (minimalista premium, cards con borde suave, botones principales oscuros/azules, mucho aire, tipografía grande). Crea pantallas desktop + mobile y prototipo navegable.

OBJETIVO
Construir: Login, Registro, Recuperar contraseña, Onboarding (wizard) y Recomendación de plan.
El onboarding debe preguntar lo mínimo para preparar el SaaS y recomendar plan sin complicar backend.

LÓGICA SIMPLE DE RECOMENDACIÓN (MVP)
- Si Ubicaciones = 1 y Usuarios <= 2 y NO marca “Gestoría” → recomendar BÁSICO
- Si Ubicaciones = 1 y Usuarios entre 3 y 5 → recomendar NORMAL (Más vendido)
- Si Ubicaciones > 1 o Usuarios > 5 → recomendar PRO
Regla adicional: si marca “Envío a gestoría” o “Documentos + Firma” y Usuarios >= 3 → recomendar NORMAL aunque Usuarios=2 (explicar en el copy).
La recomendación solo afecta al copy y a la tarjeta destacada (no lógica real).

PANTALLAS A CREAR (NOMBRADAS Y ORDENADAS)

00 Entry / Gate
- 2 cards:
  A) “Iniciar sesión”
  B) “Empezar prueba gratis”
- Texto: “14 días gratis. Sin tarjeta. Sin permanencia.”

01 Login
- Email
- Contraseña
- Checkbox “Recordarme”
- Botón primario “Acceder”
- Link “He olvidado mi contraseña”
- Link “Crear cuenta”
- Separador “o”
- Botón opcional “Continuar con Google” (solo UI)

02 Recuperar contraseña
- Campo email
- Botón “Enviar enlace”
- Estado “Email enviado” con instrucciones

03 Registro (Cuenta)
- Nombre y apellidos
- Email
- Teléfono
- Contraseña + repetir
- Checkbox RGPD + Términos
- Botón “Crear cuenta”
- Al terminar: ir a Onboarding Paso 1

04 Onboarding - Paso 1: Tipo de negocio
- Título: “¿Qué tipo de negocio tienes?”
- Cards (solo una activa):
  1) “Compraventa de coches” (seleccionada)
  2) “Taller (próximamente)” (deshabilitada)
  3) “Otro (próximamente)” (deshabilitada)
- Texto: “UDAR EDGE está optimizado para compraventas.”
- Botón: “Continuar”

05 Onboarding - Paso 2: Empresa
- Título: “Datos de tu empresa”
Campos:
- Nombre comercial
- CIF/NIF
- Provincia
- Dirección (opcional)
- Email empresa (opcional)
- Teléfono empresa (opcional)
- Checkbox: “Soy socio ANCOVE”
Si marca:
- Campo “Nº socio ANCOVE”
- Texto: “Activaremos configuración y ventajas ANCOVE cuando esté validado.”
Botón: “Continuar”

06 Onboarding - Paso 3: Estructura
- Título: “¿Cómo es tu equipo?”
Campos:
- Nº de ubicaciones / exposiciones (1-5) (por defecto 1)
- Nº de trabajadores (1-20) (por defecto 3)
- Roles a crear (multi-select): Gerente, Comercial, Administración
Toggle: “Añadir usuarios ahora”
Si “sí”:
- Mini tabla: Nombre | Email | Rol | (+ Añadir)
Botón: “Continuar”

07 Onboarding - Paso 4: Necesidades (muy corto)
- Título: “¿Qué necesitas desde el primer día?”
Checklist (preseleccionado):
- Control de stock de vehículos
- Ubicaciones / aparcamiento
- Documentos (recepción, contratos, hojas, facturas)
Opciones:
- Firma digital (eSignature: marcar firmado + sello “Firmado”)
- Envío a gestoría (export: generar paquete PDF + estado “Enviado”)
- Llamadas con asistente (AI) (placeholder)
- ANCOVE (validación/sync)
Botón: “Ver recomendación”

08 Recomendación de plan (personalizada)
- Título: “Plan recomendado para tu compraventa”
- Card destacada con badge “Más vendido” cuando sea NORMAL
- Mostrar resumen detectado: “1 ubicación · 3 usuarios · Documentos + Gestoría”
- Copy explicativo (2-3 líneas): “Te recomendamos este plan por tu número de usuarios y por la gestión documental y envío a gestoría.”
- Toggle Mensual/Anual
- CTA principal: “Empezar prueba gratis”
- CTA secundario: “Comparar planes”
- Link: “Hablar con ventas”

Modal “Comparar planes”
- Tabla simple sin scroll horizontal:
  Filas: Usuarios, Ubicaciones, Vehículos, Documentos, Firma, Gestoría, Llamadas (AI), ANCOVE, Soporte
  Columnas: Básico / Normal / Pro
- Botón “Elegir este plan” en cada columna

09 Confirmación y creación
- Pantalla de progreso: “Creando tu espacio…”
Checklist animado:
✓ Empresa creada
✓ Ubicación creada
✓ Roles configurados
✓ Plantillas preparadas
Botón final: “Ir al panel”

10 Gate interno (primera entrada al SaaS)
- Si 1 empresa: card “Entrar a [Nombre empresa]”
- Si varias (placeholder): selector de empresa
- CTA secundario: “Invitar a un trabajador” (abre modal)

Modal “Invitar a trabajador”
- Email
- Rol (Comercial/Administración)
- Botón “Enviar invitación”
- Texto: “Recibirá un email para activar su cuenta.”

CONEXIONES (PROTOTIPO)
- Web: “Empezar gratis / Probar 14 días” → 00 Entry → Registro → Onboarding → 09 → 10 → Dashboard
- Web: “Iniciar sesión” → 01 Login → 10 → Dashboard
- “Comparar planes” abre modal
- En 10 Gate interno: “Entrar” → Dashboard (SaaS)

REGLAS DE DISEÑO
- Mantén el mismo sistema visual de mis capturas (cards, badges, botones, espaciado)
- Nada de lorem ipsum: copy real en español
- En mobile: wizard 1 columna, stepper arriba, botones sticky abajo (Continuar/Atrás)
- Añade estados de error bajo inputs (UI) sin lógica real

ENTREGABLE
Crea frames:
“00 Entry”, “01 Login”, “02 Recover”, “03 Registro”, “04 Tipo negocio”, “05 Empresa”, “06 Estructura”, “07 Necesidades”, “08 Recomendación”, “08b Comparar planes (Modal)”, “09 Creación”, “10 Gate SaaS”, “10b Invitar (Modal)”.
Desktop 1440 y Mobile 390 para todos.
Crea componentes reutilizables: Stepper, Input, Checkbox, Card selector, Plan card, Modal, Toast/Alert.
pero me has dicho 2 lineas? no entiendo

Tienes razón: lo de “2 líneas” era solo para la lógica, no para todo el prompt.

Aquí van las 2 líneas exactas para pegar dentro del prompt (en la sección de recomendación), y ya está:

RECOMENDACIÓN (MVP): Básico si (1 ubicación y ≤2 usuarios y sin “Gestoría”); Normal si (1 ubicación y 3–5 usuarios) o si marca “Gestoría/Firma” y ≥3 usuarios; Pro si (>1 ubicación o >5 usuarios).
En la pantalla “Plan recomendado”, destaca automáticamente el plan resultante y explica en 1–2 frases el motivo (usuarios/ubicaciones/documentos+gestoría).

Si quieres, te digo dónde pegarlo: dentro de tu prompt, justo debajo de “08 Recomendación de plan (personalizada)”.

pon eso en el prompt, ponlo todo , no voy a enviarle 2 mensajes
Actúa como diseñador/a UX/UI senior. Necesito diseñar el CAMINO DE ACCESO completo para UDAR EDGE (compraventa de coches en España), manteniendo el mismo estilo visual de mi web y del SaaS (minimalista premium, cards con borde suave, botones principales oscuros/azules, mucho aire, tipografía grande). Crea pantallas desktop + mobile y prototipo navegable.

OBJETIVO
Construir: Login, Registro, Recuperar contraseña, Onboarding (wizard) y Recomendación de plan.
El onboarding debe preguntar lo mínimo para preparar el SaaS y recomendar plan sin complicar backend.

RECOMENDACIÓN (MVP) — LÓGICA EN 2 LÍNEAS (PARA COPY Y UI, SIN BACKEND)
- Básico si (1 ubicación y ≤2 usuarios y sin “Gestoría”); Normal si (1 ubicación y 3–5 usuarios) o si marca “Gestoría/Firma” y ≥3 usuarios; Pro si (>1 ubicación o >5 usuarios).
- En “Plan recomendado”, destaca automáticamente el plan resultante y explica en 1–2 frases el motivo (usuarios/ubicaciones/documentos+gestoría).

PANTALLAS A CREAR (NOMBRADAS Y ORDENADAS)

00 Entry / Gate
- 2 cards:
  A) “Iniciar sesión”
  B) “Empezar prueba gratis”
- Texto: “14 días gratis. Sin tarjeta. Sin permanencia.”

01 Login
- Email
- Contraseña
- Checkbox “Recordarme”
- Botón primario “Acceder”
- Link “He olvidado mi contraseña”
- Link “Crear cuenta”
- Separador “o”
- Botón opcional “Continuar con Google” (solo UI)

02 Recuperar contraseña
- Campo email
- Botón “Enviar enlace”
- Estado “Email enviado” con instrucciones

03 Registro (Cuenta)
- Nombre y apellidos
- Email
- Teléfono
- Contraseña + repetir
- Checkbox RGPD + Términos
- Botón “Crear cuenta”
- Al terminar: ir a Onboarding Paso 1

04 Onboarding - Paso 1: Tipo de negocio
- Título: “¿Qué tipo de negocio tienes?”
- Cards (solo una activa):
  1) “Compraventa de coches” (seleccionada)
  2) “Taller (próximamente)” (deshabilitada)
  3) “Otro (próximamente)” (deshabilitada)
- Texto: “UDAR EDGE está optimizado para compraventas.”
- Botón: “Continuar”

05 Onboarding - Paso 2: Empresa
- Título: “Datos de tu empresa”
Campos:
- Nombre comercial
- CIF/NIF
- Provincia
- Dirección (opcional)
- Email empresa (opcional)
- Teléfono empresa (opcional)
- Checkbox: “Soy socio ANCOVE”
Si marca:
- Campo “Nº socio ANCOVE”
- Texto: “Activaremos configuración y ventajas ANCOVE cuando esté validado.”
Botón: “Continuar”

06 Onboarding - Paso 3: Estructura
- Título: “¿Cómo es tu equipo?”
Campos:
- Nº de ubicaciones / exposiciones (1-5) (por defecto 1)
- Nº de trabajadores (1-20) (por defecto 3)
- Roles a crear (multi-select): Gerente, Comercial, Administración
Toggle: “Añadir usuarios ahora”
Si “sí”:
- Mini tabla: Nombre | Email | Rol | (+ Añadir)
Botón: “Continuar”

07 Onboarding - Paso 4: Necesidades (muy corto)
- Título: “¿Qué necesitas desde el primer día?”
Checklist (preseleccionado):
- Control de stock de vehículos
- Ubicaciones / aparcamiento
- Documentos (recepción, contratos, hojas, facturas)
Opciones:
- Firma digital (eSignature: marcar firmado + sello “Firmado”)
- Envío a gestoría (export: generar paquete PDF + estado “Enviado”)
- Llamadas con asistente (AI) (placeholder)
- ANCOVE (validación/sync)
Botón: “Ver recomendación”

08 Recomendación de plan (personalizada)
- Título: “Plan recomendado para tu compraventa”
- Card destacada con badge “Más vendido” cuando sea NORMAL
- Mostrar resumen detectado: “1 ubicación · 3 usuarios · Documentos + Gestoría”
- Copy explicativo (2-3 líneas) según la lógica: “Te recomendamos este plan por tu número de usuarios/ubicaciones y por la gestión documental y envío a gestoría.”
- Toggle Mensual/Anual
- CTA principal: “Empezar prueba gratis”
- CTA secundario: “Comparar planes”
- Link: “Hablar con ventas”

Modal “Comparar planes”
- Tabla simple sin scroll horizontal:
  Filas: Usuarios, Ubicaciones, Vehículos, Documentos, Firma, Gestoría, Llamadas (AI), ANCOVE, Soporte
  Columnas: Básico / Normal / Pro
- Botón “Elegir este plan” en cada columna

09 Confirmación y creación
- Pantalla de progreso: “Creando tu espacio…”
Checklist animado:
✓ Empresa creada
✓ Ubicación creada
✓ Roles configurados
✓ Plantillas preparadas
Botón final: “Ir al panel”

10 Gate interno (primera entrada al SaaS)
- Si 1 empresa: card “Entrar a [Nombre empresa]”
- Si varias (placeholder): selector de empresa
- CTA secundario: “Invitar a un trabajador” (abre modal)

Modal “Invitar a trabajador”
- Email
- Rol (Comercial/Administración)
- Botón “Enviar invitación”
- Texto: “Recibirá un email para activar su cuenta.”

CONEXIONES (PROTOTIPO)
- Web: “Empezar gratis / Probar 14 días” → 00 Entry → Registro → Onboarding → 09 → 10 → Dashboard
- Web: “Iniciar sesión” → 01 Login → 10 → Dashboard
- “Comparar planes” abre modal
- En 10 Gate interno: “Entrar” → Dashboard (SaaS)

REGLAS DE DISEÑO
- Mantén el mismo sistema visual de mis capturas (cards, badges, botones, espaciado)
- Nada de lorem ipsum: copy real en español
- En mobile: wizard 1 columna, stepper arriba, botones sticky abajo (Continuar/Atrás)
- Añade estados de error bajo inputs (UI) sin lógica real

ENTREGABLE
Crea frames:
“00 Entry”, “01 Login”, “02 Recover”, “03 Registro”, “04 Tipo negocio”, “05 Empresa”, “06 Estructura”, “07 Necesidades”, “08 Recomendación”, “08b Comparar planes (Modal)”, “09 Creación”, “10 Gate SaaS”, “10b Invitar (Modal)”.
Desktop 1440 y Mobile 390 para todos.
Crea componentes reutilizables: Stepper, Input, Checkbox, Card selector, Plan card, Modal, Toast/Alert.
de todo te estoy diciendo, de lo que me has enviado mas que me has dicho abajo, me explico?

Sí, te entiendo: quieres UN solo prompt que incluya todo lo que hemos trabajado:

Web (landing + pricing),

Camino de acceso (login + onboarding + recomendación de plan),

SaaS MVP de compraventa adaptado a tus pantallas,
y además que deje indicado que cuando digamos OK me pides el README backend.

Aquí lo tienes todo junto (copia/pega tal cual en Figma Make):

Actúa como diseñador/a UX
te hablo de esto , quiero esto , en 1 prompt, el promt y lo que me has dicho debajo del prompt , ahora si?
Actúa como diseñador/a UX/UI senior. Necesito diseñar en Figma (con prototipo navegable) TODO el flujo completo de UDAR EDGE para “Compraventa de coches en España” (con ANCOVE), manteniendo el estilo visual de mis capturas (web minimalista premium + SaaS con sidebar/topbar, cards limpias, tabs tipo píldora, tabla/tarjetas, badges).

OBJETIVO (MVP vendible rápido, backend simple)
Crear 3 bloques:
A) WEB (Landing + Pricing)
B) ACCESO (Login + Registro + Recuperar + Onboarding + Recomendación de plan)
C) SAAS MVP (Dashboard + Operaciones + Vehículos/Stock + Ubicaciones + Clientes + Documentos + Ventas simple + Llamadas (IA placeholder) + ANCOVE placeholder + Equipo/Sistema + Finanzas simple)

REGLAS DE DISEÑO (COPIAR ESTILO)
- Mucho aire, tipografía grande, cards con borde suave, sombras mínimas.
- Botón primario oscuro/azul con texto blanco; secundario blanco con borde.
- Sidebar izquierda con iconos y estado activo destacado.
- Tabs superiores y pills de filtros como en tus pantallas.
- Vistas “Tarjetas/Tabla”.
- Copy real en español (nada de lorem ipsum).

========================================================
A) WEB — LANDING (SCROLL) + PRICING (MISMA PÁGINA O SECCIÓN)
========================================================
HEADER fijo:
Logo “Udar Edge”
Menú: Módulos | Planes | SVAs | Cómo funciona | FAQ | Contacto
Derecha: “Iniciar sesión” + botón “Ver planes” + botón primario “Empezar gratis”

HERO:
Eyebrow: “Para compraventas que quieren control real”
H1: “Haz crecer tu compraventa sin perder el control”
Sub: “Stock, leads, ventas, documentación y márgenes. Todo conectado y claro.”
CTAs: “Probar gratis 14 días” (primario) y “Ver una demo” (secundario)
Checks: “Sin tarjeta” “Sin permanencia” “Soporte en castellano”

SECCIÓN MÓDULOS (grid cards):
Stock de Vehículos, Ubicaciones/Aparcamiento, Operaciones (compra/venta), Clientes/CRM, Documentos, Ventas, Reportes/Alertas, Plataforma

PRICING:
Título: “Planes que crecen contigo”
Sub: “Desde €49/mes. Sin permanencia. Cancela cuando quieras.”
3 planes: Básico €49 / Normal €149 (destacado, “Más vendido”) / Pro €349
Bloque “Información importante sobre licencias”:
- “Una ubicación = Una licencia”
- “Cambia de plan cuando quieras”
- “Sin permanencia”
- “14 días de prueba real”
CTA oscuro grande: “¿No sabes qué plan elegir?” + botón “Hablar con nosotros”
CTA final: “¿Listo para tomar el control de tu compraventa?” + botones “Empezar gratis” y “Ver demo”
FOOTER 4 columnas como tus capturas.

VINCULACIONES WEB:
- “Iniciar sesión” → Login
- “Empezar gratis / Probar 14 días” → Registro
- “Ver planes” → scroll a Pricing
- “Hablar con nosotros” → Contacto (modal simple)

========================================================
B) ACCESO — LOGIN + ONBOARDING + RECOMENDACIÓN (TODO CONNECTADO)
========================================================

RECOMENDACIÓN (MVP) — LÓGICA EN 2 LÍNEAS (PARA COPY Y UI, SIN BACKEND)
- Básico si (1 ubicación y ≤2 usuarios y sin “Gestoría”); Normal si (1 ubicación y 3–5 usuarios) o si marca “Gestoría/Firma” y ≥3 usuarios; Pro si (>1 ubicación o >5 usuarios).
- En “Plan recomendado”, destaca automáticamente el plan resultante y explica en 1–2 frases el motivo (usuarios/ubicaciones/documentos+gestoría).

PANTALLAS ACCESO (Desktop 1440 + Mobile 390)
00 Entry / Gate
- Cards: “Iniciar sesión” / “Empezar prueba gratis”
- Texto: “14 días gratis. Sin tarjeta. Sin permanencia.”

01 Login
- Email, Contraseña, “Recordarme”
- Botón “Acceder”
- Links: “He olvidado mi contraseña”, “Crear cuenta”
- Botón opcional: “Continuar con Google” (solo UI)

02 Recuperar contraseña
- Email + botón “Enviar enlace”
- Estado “Email enviado”

03 Registro
- Nombre y apellidos, Email, Teléfono, Contraseña x2
- Check RGPD + Términos
- Botón “Crear cuenta”
- Ir a Onboarding

04 Onboarding Paso 1: Tipo de negocio
- Cards: “Compraventa de coches” (seleccionada), otras “próximamente”
- Botón “Continuar”

05 Onboarding Paso 2: Empresa
- Nombre comercial, CIF/NIF, Provincia
- Dirección/email/teléfono (opcionales)
- Checkbox “Soy socio ANCOVE” → aparece “Nº socio ANCOVE”
- Botón “Continuar”

06 Onboarding Paso 3: Estructura
- Nº ubicaciones (1-5) por defecto 1
- Nº trabajadores (1-20) por defecto 3
- Roles: Gerente, Comercial, Administración
- Toggle “Añadir usuarios ahora” → mini tabla Nombre/Email/Rol
- Botón “Continuar”

07 Onboarding Paso 4: Necesidades
Checklist:
- Control de stock
- Ubicaciones
- Documentos (recepción/contratos/hojas/facturas)
Opcionales:
- Firma digital (marcar firmado + sello)
- Envío a gestoría (paquete PDF + estado)
- Llamadas asistidas (IA placeholder)
- ANCOVE sync (placeholder)
Botón “Ver recomendación”

08 Recomendación de plan
- Título: “Plan recomendado para tu compraventa”
- Card destacada (si NORMAL, badge “Más vendido”)
- Muestra resumen detectado: “1 ubicación · 3 usuarios · Documentos + Gestoría”
- Copy: 2-3 líneas explicando motivo según la lógica
- Toggle mensual/anual
- CTA “Empezar prueba gratis”
- CTA “Comparar planes” (abre modal)
- Link “Hablar con ventas”

08b Modal Comparar planes
- Tabla simple sin scroll horizontal
- Botones “Elegir este plan”

09 Creación espacio
- Pantalla de progreso con checklist animado:
✓ Empresa creada ✓ Ubicación creada ✓ Roles ✓ Plantillas
- Botón “Ir al panel”

10 Gate interno SaaS
- Si 1 empresa: “Entrar a [Empresa]”
- (Placeholder varias empresas) selector
- Botón “Invitar a un trabajador” (modal)

10b Modal Invitar
- Email + Rol + “Enviar invitación”

CONEXIONES ACCESO
Web “Empezar gratis” → 00 → 03 → 04→05→06→07→08→09→10→ Dashboard
Web “Iniciar sesión” → 01 → 10 → Dashboard

========================================================
C) SAAS MVP — ADAPTADO A COMPRAVENTA (USANDO TU DISEÑO)
========================================================

SIDEBAR (RENOMBRAR)
Dashboard
Operaciones
Vehículos
Ubicaciones
Clientes
Documentos
Ventas
Llamadas (IA)
ANCOVE
Equipo
Finanzas
Sistema

C1) Dashboard (estilo tu captura)
- Filtros: Mes actual + Ubicación/Exposición
- Tabs/píldoras: Stock | Alertas | KPIs | Margen | Top5
- KPIs: Vehículos activos, Leads nuevos, Operaciones en curso, Documentos pendientes
- Gráfica: Entradas vs Ventas (semana) o Margen por semana
- Alertas: sin ubicación / docs pendientes / leads sin respuesta / +X días stock

C2) Operaciones (basado en tu “Operativa / Expedientes”)
Tabs: Operaciones | Tareas | Gastos | Incidencias | Historial (Planificación/Partes opcional ocultable)
Tabla Operaciones:
ID (OP-001)
OPERACIÓN (“Venta — Seat Ibiza 2019” / “Compra — VW Golf 2017”)
CLIENTE/ORIGEN (comprador o proveedor)
ETAPA (Captación, Revisión/Peritaje, Puesta a punto, Publicación, Negociación, Reserva, Financiación, Documentación, Entrega, Postventa, Desguace)
ESTADO (En progreso / Retrasado / Completado / Pendiente)
RESPONSABLE
UBICACIÓN (Exposición/Zona)
Acciones: Ver / Documentos / Cambiar etapa

C3) Vehículos (basado en tu “Catálogo”)
Tabs: Vehículos | Entradas (recepción) | Proveedores (placeholder) | Facturas (placeholder)
Vista Tarjetas + Tabla
Tarjeta vehículo:
Foto, Matrícula, Marca/Modelo/Año, Precio venta, Estado, Ubicación, Días en stock
Botón “+ Añadir vehículo”
Tabla con: Matrícula, Modelo, Año, Km, Precio venta, Coste, Margen, Estado, Ubicación, Días

C4) Ficha Vehículo (pantalla nueva en mismo estilo)
Header: Matrícula + Modelo + badges
Tabs: Resumen | Documentos | Historial | Venta | Desguace
Resumen:
- Ubicación actual (card + botón “Mover”)
- Costes (compra + reacondicionamiento)
- Precio y margen
- Estado (en stock/reservado/vendido)
Desguace (MVP):
motivo, fecha, coste/ingreso, estado final “Cerrado”

C5) Ubicaciones (Aparcamiento)
- Vista “Zonas” (Zona A/B/Exterior/Taller)
- Grid simple por zona (cards/plazas)
- Acciones: Asignar / Mover
- Historial movimientos

C6) Clientes (basado en tu “Clientes / Presupuestos”)
Tabs: Leads | Clientes | Facturas (opcional) o “Ventas”
Leads: pills (Todos/Nuevos/Contactados/Cita/Reserva/Perdidos)
Cada item muestra: nombre, teléfono, origen, vehículo interés, estado, responsable, fecha
Clientes: listado + ficha con DNI/NIE, contacto, consentimientos, notas, vehículos vinculados
Botón principal: “Crear contrato”
Auto-relleno: contrato se rellena con datos de cliente + vehículo; si falta algo, checklist “Pendiente”.

C7) Documentos (repositorio)
Tabs/carpetas: Recepción | Contratos | Hojas | Facturas | Gestoría
Tabla: Documento, Vehículo, Cliente, Estado (Pendiente/Firmado/Enviado), Fecha, Responsable
Acciones:
- Subir
- Generar plantilla
- Firmar (eSignature: marcar como firmado + sello)
- Enviar a gestoría (export: paquete PDF + estado “Enviado”)

C8) Ventas (simple)
Pipeline: Interesado → Reserva → Señal → Vendido → Entregado
Crear venta: Vehículo + Cliente + importes (señal/total)
Botón: “Generar documentos” (contrato + hoja entrega + factura)

C9) Llamadas (IA placeholder)
Listado llamadas + detalle con “transcripción/resumen/tareas” como placeholders
Texto: “Asistente inteligente (AI) para registrar y resumir llamadas (solo interfaz en MVP)”

C10) ANCOVE (placeholder)
Nº socio/CIF + botón Validar/Sincronizar + log

C11) Equipo (básico)
Lista de usuarios + roles (Gerente/Comercial/Administración)
Empty state como tu captura

C12) Finanzas (simple)
KPIs: Caja actual, Ingresos (ventas), Gastos (compras + reacondicionamiento), Margen
Sin contabilidad compleja

C13) Sistema
- Usuarios y roles
- Configurar ubicaciones (zonas/plazas)
- Plantillas de documentos (contrato compraventa, recepción, hoja entrega, factura)
- Integraciones (API placeholder)

PROTOTIPO SAAS
Sidebar navega entre módulos
Operaciones → ficha vehículo/operación
Clientes → crear contrato
Documentos → firmar → enviar gestoría
Vehículos → ficha → tabs

ENTREGABLE (OBLIGATORIO)
- Frames Web (Desktop/Mobile), Acceso (Desktop/Mobile), SaaS (Desktop/Mobile)
- Componentes reutilizables: Sidebar, Topbar, Tabs, Pills, Badges, KPI cards, Tabla, Cards, Modales, Stepper wizard, Empty state
- Todo con nombres ordenados: “WEB 01…”, “ACCESO 01…”, “SAAS 01…”

NOTA FINAL (FUERA DE FIGMA, SOLO COMO INDICACIÓN)
Cuando yo escriba “OK” en este chat, generaré un README para backend explicando entidades, relaciones, estados, endpoints mínimos y conexiones entre módulos del MVP.