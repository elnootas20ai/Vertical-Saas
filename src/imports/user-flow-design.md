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