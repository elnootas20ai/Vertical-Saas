Actúa como UX/UI lead + QA de prototipos en Figma. OBJETIVO: dejar el bloque SAAS__ con navegación 100% funcional y sin ningún botón roto. Mantén el diseño actual EXACTO (no rediseñar). Solo añade interacciones, pantallas faltantes para navegación y estados.

REGLAS OBLIGATORIAS
- Cero elementos clicables sin acción: botones, links, tabs, pills, iconos, cards, filas de tabla, CTAs, menú hamburguesa, notificaciones, perfil, ayuda “?”.
- Si una acción aún no tiene pantalla, crea un modal estándar: “Próximamente” + botón “Entendido”.
- Todas las pantallas deben tener Sidebar + Topbar consistentes.
- Nombres obligatorios: SAAS__<Modulo>__<Pantalla> y componentes COMP__<Nombre>.

SIDEBAR (navegación real a frames)
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
Billing

TOPBAR (acciones reales)
- Icono menú: colapsar/expandir sidebar (2 estados/frames)
- Notificaciones: abre panel (drawer) con lista
- Perfil: abre menú (modal) con “Mi perfil”, “Empresa”, “Cerrar sesión”
- Ayuda “?”: abre modal con enlaces (FAQ, Soporte)

TABS / PILLS / SWITCHES (siempre cambian de frame)
- Cada tab superior debe llevar a un frame alternativo real (aunque sea “vista vacía”).
- Cada pill de filtros debe alternar seleccionado/no seleccionado con frames.
- Switch Tarjetas/Tabla debe cambiar a frames distintos reales.

BOTONES GLOBALES (acciones)
- Botón “+” en cada módulo: abre modal “Crear …” (contenido mínimo + Guardar/Cancelar).
- Botón “Filtros”: abre drawer de filtros (Aplicar/Reset).
- Botón “Exportar” (si aparece): abre modal “Exportar” (placeholder).

CLICKABLES DE LISTADOS
- Cada card clicable → abre un “Detalle” del elemento (frame SAAS__X__Detalle).
- Cada fila de tabla → abre “Detalle”.
- En detalle, siempre hay botones: Editar, Guardar, Cancelar (aunque sea UI).

ENTREGABLES DEL BLOQUE 4
1) Crea un frame “SAAS__FlowMap” con mini-diagrama de navegación (Web/Acceso ya fuera; aquí solo SaaS).
2) Crea un frame “SAAS__QA_Buttons” con checklist:
   - Sidebar links OK
   - Topbar (notifs/perfil/ayuda) OK
   - Tabs OK
   - Pills OK
   - Tarjetas/Tabla OK
   - Botones + OK
   - Modales estándar OK
3) Al terminar, muestra un modal: “Bloque 4 listo. ¿OK para continuar?” con botones “OK” y “Revisar”.

IMPORTANTE
- No inventes datos ni mock. Usa empty states cuando toque: “Aún no hay …” + CTA “Crear …”.
- No implementes módulos nuevos; solo asegurar navegación/acciones en lo ya diseñado.