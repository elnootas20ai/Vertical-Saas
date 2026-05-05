Actúa como UX/UI senior. IMPORTANTE: NO crees una página nueva desde cero. Modifica la página existente “Bienvenido a tu espacio” (la que ahora está enfocada a ANCOVE) para que sea de Vertial multi-vertical. Mantén el estilo y estructura general, pero moderniza el look y el contenido. Objetivo: que parezca un SaaS premium y que convierta.

NUEVO ENFOQUE
- Marca principal: Vertial (no ANCOVE como eje).
- Vertial es multi-vertical, pero SOLO “Compraventa de coches” está disponible ahora.
- ANCOVE pasa a ser una integración/opción dentro de la vertical Compraventa, no el centro de la página.

CAMBIOS OBLIGATORIOS (reemplazar textos y bloques)
1) Título y subtítulo
- Título: “Bienvenido a Vertial”
- Subtítulo: “Plataforma SaaS multi-vertical para digitalizar negocios. Vertical disponible: Compraventa de coches.”
- Badge visible junto al título: “Compraventa (Disponible)”
- Añade badges secundarios deshabilitados: “Taller (Próximamente)”, “Retail (Próximamente)”, “Delivery (Próximamente)” (no clicables o abren modal “Próximamente”).

2) Sección “Elegir vertical” (card principal)
- Card grande con lista de verticales:
  ✅ Compraventa de coches (Disponible) → botón “Entrar”
  🔒 Taller → “Próximamente”
  🔒 Retail → “Próximamente”
  🔒 Delivery → “Próximamente”
- Si clic en “Próximamente”: abrir modal estándar “Próximamente” + botón “Entendido”.

3) Sección “Tu espacio / Empresa” (mantener funcionalidad)
- Mantén la lista/selector de empresas (workspaces).
- Botón primario grande: “Entrar al panel” (entra a la vertical disponible: Compraventa).
- Botón secundario: “Invitar a un trabajador” → modal (email + rol + enviar + confirmación).
- Link “Cerrar sesión” funcional (UI).

4) Estado de cuenta (trial/plan) visible y moderno (card)
- Mostrar estado:
  - Trial: “Te quedan X días de prueba” + CTA “Elegir plan”
  - Plan activo: “Plan X activo” + CTA “Gestionar plan”
  - (Opcional UI) impago: banner + CTA “Actualizar pago”
- No uses datos mock; si no hay información, usa empty state real: “Aún no hay información de facturación”.

5) Primeros pasos (checklist con progreso)
Añade una checklist “Empieza en 5 minutos” con 4 ítems clicables:
- Importar/crear primer vehículo
- Configurar ubicaciones (zonas/plazas)
- Crear primer lead/cliente
- Subir primer documento / plantilla
Cada ítem navega al módulo correspondiente o abre “Próximamente” si aún no existe.

6) Acciones rápidas (grid de cards)
Añade 4–6 cards con CTA:
- Añadir vehículo
- Importar stock (CSV)
- Crear lead
- Subir documento
- Ver Operaciones
- Ir a Documentos / Gestoría

REUBICAR ANCOVE
- El bloque ANCOVE NO debe ser protagonista.
- Como máximo: un bloque pequeño “Integraciones” con ANCOVE dentro:
  “ANCOVE (opcional)” + estado (No conectado/Conectado) + botón “Configurar” (puede abrir modal o llevar a SAAS__ANCOVE).
- Si no está conectado: texto “Configúralo cuando lo necesites”.

DISEÑO (MODERNIZACIÓN SIN ROMPER ESTÉTICA)
- Mantén el layout base, pero mejora jerarquía: títulos grandes, cards alineadas, spacing consistente.
- Añade iconos lineales y badges claros (Disponible/Próximamente).
- CTA primario muy visible y consistente con la web.
- Sin lorem ipsum; copy real en español, tono corporativo y claro.

INTERACCIONES OBLIGATORIAS
- “Entrar al panel” y “Entrar” en Compraventa → SAAS__Dashboard
- Selector empresa → cambia empresa activa (UI)
- “Invitar a un trabajador” → modal + confirmación
- “Elegir plan / Gestionar plan” → abre drawer/modal Billing (UI)
- Verticales “Próximamente” → modal “Próximamente”
- Checklist y Acciones rápidas → navegan a módulos (Vehículos, Ubicaciones, Clientes, Documentos, Operaciones)

ENTREGABLE
- Actualiza el frame EXISTENTE (no duplicar).
- Crea/usa componentes reutilizables: CardVertical, BadgeStatus, CardEstadoCuenta, QuickActionsGrid, ChecklistProgress, InviteModal, ModalProximamente.
- Al final, muestra un modal: “Página de recibimiento actualizada. ¿OK?”
