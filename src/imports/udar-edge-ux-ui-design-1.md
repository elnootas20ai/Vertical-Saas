Actúa como diseñador/a UX/UI senior. Necesito diseñar el CAMINO DE ACCESO completo para UDAR EDGE (compraventa de coches en España). Mantén el mismo estilo visual de mi web y del SaaS (minimalista, premium, cards con borde suave, botones principales oscuros o azules, mucho aire, tipografía grande). Crea pantallas desktop + mobile y prototipo navegable.

OBJETIVO
Crear: Login, Registro, Recuperar contraseña, Onboarding (wizard) y Recomendación de plan.
Aunque el producto final sea solo “Compraventa”, el onboarding debe preguntar lo mínimo para recomendar plan y preparar el SaaS.

PANTALLAS A CREAR (NOMBRADAS Y ORDENADAS)

00 Entry / Gate
- 2 opciones en cards:
  A) “Iniciar sesión”
  B) “Empezar prueba gratis”
- Texto corto: “14 días gratis. Sin tarjeta. Cancela cuando quieras.”

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
- Checkbox legales (RGPD + términos)
- Botón “Crear cuenta”
- Tras crear: ir a Onboarding Paso 1

04 Onboarding - Paso 1: Tipo de negocio
- Título: “¿Qué tipo de negocio tienes?”
- Cards seleccionables (pero por defecto sugiere y destaca):
  1) “Compraventa de coches” (seleccionado)
  2) “Taller” (deshabilitado o “próximamente”)
  3) “Otro” (deshabilitado o “próximamente”)
- Texto: “De momento UDAR EDGE está optimizado para compraventas.”
- Botón: “Continuar”

05 Onboarding - Paso 2: Empresa
- Título: “Datos de tu empresa”
Campos:
- Nombre comercial
- Razón social (opcional)
- CIF/NIF
- Provincia
- Dirección (opcional)
- Email empresa (opcional)
- Teléfono empresa (opcional)
- Checkbox: “Soy socio ANCOVE” (si marca, aparece campo “Nº socio ANCOVE”)
Botón: “Continuar”

06 Onboarding - Paso 3: Estructura
- Título: “¿Cómo es tu equipo?”
Campos:
- Nº de ubicaciones / exposiciones (selector 1-5) (por defecto 1)
- Nº de trabajadores (selector 1-20) (por defecto 2-5)
- Roles a crear (multi-select): Gerente, Comercial, Administración
- Opción: “Añadir usuarios ahora” (toggle)
Si “sí”:
- mini tabla para añadir: nombre, email, rol (con botón “+ Añadir”)
Botón: “Continuar”

07 Onboarding - Paso 4: Necesidades (muy corto)
- Título: “¿Qué necesitas desde el primer día?”
Checklist (preseleccionadas):
- Control de stock de vehículos
- Ubicaciones / aparcamiento
- Documentos (recepción, contratos, facturas)
- Firma digital (marcar firmado en MVP)
- Envío a gestoría
Opcionales (no obligatorias):
- Llamadas con asistente (AI) (placeholder)
- ANCOVE (validación/sync)
Botón: “Ver recomendación”

08 Recomendación de plan (Pricing personalizado)
- Título: “Plan recomendado para tu compraventa”
- Card destacada con el plan sugerido (Normal o el que decidas):
  - Resumen: 1 ubicación, X usuarios, módulos incluidos
  - Precio mensual y anual (toggle)
  - CTA: “Empezar prueba gratis”
- Debajo: “Comparar planes” (abre modal con tabla simple de 3 planes)
- Opción: “Quiero hablar con ventas” (secundario)
IMPORTANTE:
- Explica en 2-3 líneas por qué lo recomienda: “por nº de usuarios + documentos + gestoría”
- Muestra badge “Más vendido” en el plan recomendado.

09 Confirmación y creación
- Pantalla de progreso: “Creando tu espacio…”
- Checklist animado:
  ✓ Empresa creada
  ✓ Ubicación creada
  ✓ Roles configurados
  ✓ Plantillas preparadas
- Botón final: “Ir al panel”

10 Primera entrada al SaaS (Gate interno)
- Si 1 empresa: botón “Entrar a [Nombre empresa]”
- Si varias (placeholder): selector de empresa
- Enlace “Invitar a un trabajador” (abre modal)

CONEXIONES (PROTOTIPO)
Landing:
- Botón “Empezar gratis / Probar 14 días” → 00 Entry → Registro → Onboarding
- Botón “Iniciar sesión” → Login
- “Ver planes” → Pricing (web) y botón “Empezar prueba gratis” → Registro
SaaS:
- Login exitoso → 10 Gate interno → Dashboard

REGLAS DE DISEÑO
- Usa el mismo sistema de botones y cards de mis capturas
- Mucho aire, texto claro, sin lorem ipsum
- En mobile, wizard en una columna con stepper arriba
- Añade validaciones de UI (errores bajo inputs) pero sin lógica real

ENTREGABLE
Crea frames:
“00 Entry”, “01 Login”, “02 Recover”, “03 Registro”, “04 Onboarding Tipo”, “05 Onboarding Empresa”, “06 Onboarding Estructura”, “07 Onboarding Necesidades”, “08 Recomendación”, “09 Creación”, “10 Gate SaaS”.
Desktop 1440 y Mobile 390 para todos los pasos.
Crea componentes: Stepper, Input, Checkbox, Card selector, Plan card, Modal comparar planes.