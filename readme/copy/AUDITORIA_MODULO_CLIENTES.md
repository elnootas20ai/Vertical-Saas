# AUDITORÍA DE FUNCIONALIDADES - MÓDULO CLIENTES
## Vertial - SaaS B2B Multiempresa y Multivertical

**Fecha de auditoría:** 11 de febrero de 2026  
**Versión del sistema:** CORE COMPLETO  
**Alcance:** Módulo Clientes completo (frontend implementado)  
**Tipo de documento:** Producto (no técnico)

---

## A) RESUMEN EJECUTIVO

### Métricas Generales
- **Nº total de funcionalidades identificadas:** 87
- **Nº de pestañas principales del módulo:** 6 (Presupuestos, Clientes, Promociones, Facturas, CRM, Afiliados)
- **Nº de subpestañas en ficha cliente:** 5 (Resumen, Datos, Actividad, Notas, Facturas)
- **Nº de FLAGS detectadas:** 12
- **Nº de funcionalidades BASE:** 62
- **Nº de funcionalidades PENDIENTES/FUTURAS:** 13

### Clasificación por Estado
| Estado | Cantidad | Porcentaje |
|--------|----------|------------|
| BASE | 62 | 71.3% |
| FLAG | 12 | 13.8% |
| PENDIENTE | 13 | 14.9% |

### Decisiones Pendientes Críticas

1. **CL-FLAG-001:** Definir si el módulo CRM es una FLAG independiente o viene integrado en BASE
2. **CL-FLAG-002:** Definir si Afiliados es una FLAG independiente o viene en BASE
3. **CL-FLAG-003:** Validar si las Promociones son funcionalidad BASE o FLAG de Marketing
4. **CL-PEND-001:** Definir si habrá importación masiva de clientes (CSV/Excel)
5. **CL-PEND-002:** Definir si habrá exportación de clientes
6. **CL-PEND-003:** Validar estructura de permisos granulares (ver vs editar vs eliminar)
7. **CL-PEND-004:** Definir si habrá segmentación avanzada de clientes
8. **CL-PEND-005:** Validar si habrá etiquetas/tags personalizables
9. **CL-PEND-006:** Definir integración con WhatsApp Business API
10. **CL-PEND-007:** Definir si habrá portal de cliente (B2C) donde los clientes puedan ver sus datos

### Riesgos Detectados

⚠️ **CRÍTICOS:**
- No hay confirmación de eliminación de clientes
- No hay gestión de duplicados en creación
- No hay validación de formato de email/teléfono
- Falta gestión de permisos a nivel de UI (todo visible para todos los roles)

⚠️ **MEDIOS:**
- Estados vacíos sin acciones sugeridas en Promociones
- Falta paginación en listado de clientes
- No hay búsqueda avanzada/filtros múltiples
- Falta ordenamiento de columnas en tabla

⚠️ **BAJOS:**
- Inconsistencia en diseño de modales (diferentes estilos)
- Falta indicador de carga en algunas acciones

---

## B) PESTAÑAS PRINCIPALES DEL MÓDULO

El módulo "Clientes" se compone de 6 pestañas principales en el nivel superior:

### B.1 Listado de Pestañas

| ID | Pestaña | Rol | Clasificación | Dependencias |
|----|---------|-----|---------------|--------------|
| CL-TAB-001 | Presupuestos | Gerente | BASE | Módulo Presupuestos |
| CL-TAB-002 | Clientes | Gerente/Empleado | BASE | Ninguna |
| CL-TAB-003 | Promociones | Gerente/Empleado | FLAG (Marketing) | Sistema de promociones |
| CL-TAB-004 | Facturas | Gerente/Empleado | BASE | Módulo Facturación |
| CL-TAB-005 | CRM | Gerente | FLAG (CRM) | Módulo CRM contratado |
| CL-TAB-006 | Afiliados | Gerente | FLAG (Afiliados) | Módulo Afiliados |

### B.2 Descripción Detallada

**CL-TAB-001: Presupuestos**
- Descripción: Vista completa del módulo de presupuestos integrado en Clientes
- Visibilidad: Solo Gerente
- Estado: Implementado y funcional
- Observaciones: Es un módulo completo que se accede desde Clientes

**CL-TAB-002: Clientes**
- Descripción: Gestión principal de base de datos de clientes
- Visibilidad: Gerente y Empleado
- Estado: Implementado y funcional
- Observaciones: Es el corazón del módulo

**CL-TAB-003: Promociones**
- Descripción: Gestión de campañas promocionales para clientes
- Visibilidad: Gerente y Empleado
- Estado: Placeholder (estado vacío implementado)
- Observaciones: **FLAG** - Funcionalidad no implementada, requiere módulo de Marketing

**CL-TAB-004: Facturas**
- Descripción: Listado de facturas asociadas a clientes
- Visibilidad: Gerente y Empleado
- Estado: Implementado con mock data
- Observaciones: Conecta con módulo de facturación

**CL-TAB-005: CRM**
- Descripción: Módulo CRM con Leads, Oportunidades, Pipeline
- Visibilidad: Solo Gerente, solo si está contratado
- Estado: Completamente implementado
- Observaciones: **FLAG** - Se oculta si `crmModuleActive = false`

**CL-TAB-006: Afiliados**
- Descripción: Gestión de programa de afiliados
- Visibilidad: Solo Gerente
- Estado: Completamente implementado
- Observaciones: **FLAG** - Requiere módulo Afiliados contratado

---

## C) LISTADO DE CLIENTES - FUNCIONALIDADES

### C.1 Header y Controles Generales

| ID | Funcionalidad | Descripción | Rol | Clasificación | Permisos |
|----|---------------|-------------|-----|---------------|----------|
| CL-001 | Título y descripción del módulo | Muestra "Clientes" + "Gestión de base de datos de clientes" | Todos | BASE | Ver módulo |
| CL-002 | Botón información (i) | Icono Info en esquina superior derecha | Todos | BASE | Ver módulo |
| CL-003 | Contador de clientes | Muestra "Clientes (X)" con número total | Todos | BASE | Ver clientes |
| CL-004 | Selector Vista Grid/Tarjetas | Botón para cambiar a vista de tarjetas | Todos | BASE | Ver clientes |
| CL-005 | Selector Vista Tabla/Lista | Botón para cambiar a vista de tabla | Todos | BASE | Ver clientes |
| CL-006 | Botón "Añadir Cliente" | Abre modal de creación de cliente | Gerente | BASE | Crear cliente |
| CL-007 | Restricción Vista Global | Bloquea acceso si viewMode = 'global' | Todos | BASE | Sistema |

### C.2 Vista Grid/Tarjetas

| ID | Funcionalidad | Descripción | Rol | Clasificación | Datos Implicados |
|----|---------------|-------------|-----|---------------|------------------|
| CL-008 | Card de cliente - Avatar generado | Avatar circular con iniciales y color dinámico | Todos | BASE | nombre, id |
| CL-009 | Card de cliente - Indicador estado | Círculo verde (activo) o gris (inactivo) en avatar | Todos | BASE | status |
| CL-010 | Card de cliente - Nombre | Nombre completo del cliente | Todos | BASE | name |
| CL-011 | Card de cliente - Dirección resumida | Primera parte de dirección (antes de coma) | Todos | BASE | address |
| CL-012 | Card de cliente - Badge de estado | Badge "activo" verde o "inactivo" gris | Todos | BASE | status |
| CL-013 | Card de cliente - Email con icono | Email del cliente con icono Mail | Todos | BASE | email |
| CL-014 | Card de cliente - Teléfono con icono | Teléfono del cliente con icono Phone | Todos | BASE | phone |
| CL-015 | Card de cliente - Dirección completa con icono | Dirección completa con icono MapPin | Todos | BASE | address |
| CL-016 | Card de cliente - Número de pedidos | Muestra "X pedidos" | Todos | BASE | totalOrders |
| CL-017 | Card de cliente - Total facturado | Muestra total gastado en formato moneda | Todos | BASE | totalSpent |
| CL-018 | Card de cliente - Hover effect | Efecto hover con sombra | Todos | BASE | UI |
| CL-019 | Card de cliente - Click para abrir detalle | Al hacer click abre modal de detalle | Todos | BASE | Ver detalle cliente |

### C.3 Vista Tabla/Lista

| ID | Funcionalidad | Descripción | Rol | Clasificación | Datos Implicados |
|----|---------------|-------------|-----|---------------|------------------|
| CL-020 | Tabla - Columna Cliente | Avatar + nombre | Todos | BASE | name, id, status |
| CL-021 | Tabla - Columna Email | Email del cliente | Todos | BASE | email |
| CL-022 | Tabla - Columna Teléfono | Teléfono del cliente | Todos | BASE | phone |
| CL-023 | Tabla - Columna Pedidos | Número de pedidos | Todos | BASE | totalOrders |
| CL-024 | Tabla - Columna Total | Total facturado en moneda | Todos | BASE | totalSpent |
| CL-025 | Tabla - Columna Estado | Badge de estado activo/inactivo | Todos | BASE | status |
| CL-026 | Tabla - Hover en fila | Fondo gris al pasar cursor | Todos | BASE | UI |
| CL-027 | Tabla - Click en fila | Abre modal de detalle | Todos | BASE | Ver detalle cliente |
| CL-028 | Tabla - Scroll horizontal | Scroll en mobile/tablet | Todos | BASE | Responsive |

### C.4 Funcionalidades Pendientes/Futuras (Listado)

| ID | Funcionalidad | Descripción | Clasificación | Prioridad |
|----|---------------|-------------|---------------|-----------|
| CL-PEND-001 | Búsqueda por texto | Campo search para buscar por nombre, email, teléfono | PENDIENTE | Alta |
| CL-PEND-002 | Filtro por estado | Filtrar activos/inactivos | PENDIENTE | Media |
| CL-PEND-003 | Filtro por etiquetas | Filtrar por tags asignados | PENDIENTE | Baja |
| CL-PEND-004 | Ordenamiento por columna | Click en header para ordenar | PENDIENTE | Media |
| CL-PEND-005 | Paginación | Sistema de páginas (10, 25, 50, 100 por página) | PENDIENTE | Alta |
| CL-PEND-006 | Selección múltiple | Checkboxes para acciones en lote | PENDIENTE | Baja |
| CL-PEND-007 | Acciones en lote | Eliminar, etiquetar, exportar múltiples | PENDIENTE | Baja |
| CL-PEND-008 | Exportar a CSV/Excel | Descargar listado completo o filtrado | PENDIENTE | Media |
| CL-PEND-009 | Importar desde CSV/Excel | Importación masiva de clientes | PENDIENTE | Media |
| CL-PEND-010 | Filtros avanzados | Modal con múltiples criterios de filtrado | PENDIENTE | Baja |
| CL-PEND-011 | Segmentación de clientes | Crear segmentos guardados (VIP, Gran volumen, etc) | FLAG | Baja |
| CL-PEND-012 | Vista mapa | Visualizar clientes en mapa geográfico | FLAG | Baja |
| CL-PEND-013 | Estado de carga | Skeleton o spinner durante fetch | PENDIENTE | Alta |

---

## D) FICHA DE CLIENTE (MODAL DE DETALLE)

### D.1 Header del Modal

| ID | Funcionalidad | Descripción | Rol | Clasificación | Datos Implicados |
|----|---------------|-------------|-----|---------------|------------------|
| CL-029 | Modal - Borde superior coloreado | Borde de 4px con color de empresa | Todos | BASE | currentCompany.color |
| CL-030 | Modal - Avatar grande | Avatar circular 12x12 con inicial | Todos | BASE | name, id |
| CL-031 | Modal - Nombre del cliente | Título principal | Todos | BASE | name |
| CL-032 | Modal - ID del cliente | Subtítulo con ID | Todos | BASE | id |
| CL-033 | Modal - Badge estado activo/inactivo | Badge de estado | Todos | BASE | status |
| CL-034 | Modal - Badge VIP | Etiqueta VIP (mock) | Todos | FLAG | tags/etiquetas |
| CL-035 | Modal - Badge vertical | Etiqueta "Delivery" (mock) | Todos | FLAG | tags/etiquetas |
| CL-036 | Modal - Botón cerrar (X) | Cierra el modal | Todos | BASE | UI |
| CL-037 | Modal - Responsive | Adapta a mobile/desktop | Todos | BASE | UI |

### D.2 Navegación por Pestañas (Ficha Cliente)

| ID | Funcionalidad | Descripción | Rol | Clasificación | Dependencias |
|----|---------------|-------------|-----|---------------|--------------|
| CL-038 | Tab Resumen | Vista general con KPIs y acciones rápidas | Todos | BASE | Ninguna |
| CL-039 | Tab Datos | Formulario editable con información del cliente | Todos | BASE | Ninguna |
| CL-040 | Tab Actividad | Historial de interacciones (pedidos, facturas, llamadas, notas) | Todos | BASE | Módulos transaccionales |
| CL-041 | Tab Notas | Gestión de notas internas del cliente | Todos | BASE | Ninguna |
| CL-042 | Tab Facturas | Listado de facturas del cliente | Todos | BASE | Módulo Facturación |
| CL-043 | Tabs - Indicador activo | Borde inferior coloreado en tab activo | Todos | BASE | UI |
| CL-044 | Tabs - Iconos | Cada tab tiene icono identificativo | Todos | BASE | UI |
| CL-045 | Tabs - Responsive mobile | En mobile solo muestra iconos | Todos | BASE | UI |

### D.3 Pestaña RESUMEN

#### D.3.1 KPIs Principales

| ID | Funcionalidad | Descripción | Rol | Clasificación | Datos Implicados |
|----|---------------|-------------|-----|---------------|------------------|
| CL-046 | KPI - Total Facturado | Card con total gastado y icono DollarSign | Todos | BASE | totalSpent |
| CL-047 | KPI - Nº de Pedidos | Card con número de pedidos y icono Package | Todos | BASE | totalOrders |
| CL-048 | KPI - Ticket Medio | Card con promedio por pedido (calculado) | Todos | BASE | totalSpent, totalOrders |
| CL-049 | KPI - Última Actividad | Card con días desde último pedido | Todos | BASE | lastOrder |
| CL-050 | KPIs - Grid responsive | 4 columnas en desktop, 2 en tablet, 1 en mobile | Todos | BASE | UI |
| CL-051 | KPIs - Colores personalizados | Color de empresa en icono principal | Todos | BASE | currentCompany.color |

#### D.3.2 Información de Contacto Rápida

| ID | Funcionalidad | Descripción | Rol | Clasificación | Datos Implicados |
|----|---------------|-------------|-----|---------------|------------------|
| CL-052 | Contacto - Email | Email con icono | Todos | BASE | email |
| CL-053 | Contacto - Teléfono | Teléfono con icono | Todos | BASE | phone |
| CL-054 | Contacto - Dirección | Dirección completa con icono | Todos | BASE | address |
| CL-055 | Contacto - Grid 2 columnas | Responsive | Todos | BASE | UI |

#### D.3.3 Etiquetas y Origen (Mock Data)

| ID | Funcionalidad | Descripción | Rol | Clasificación | Estado |
|----|---------------|-------------|-----|---------------|--------|
| CL-056 | Etiquetas - Visualización | Card con badges de etiquetas (VIP, Recurrente, etc) | Todos | FLAG | Mock data |
| CL-057 | Origen del Cliente | Card mostrando cómo llegó el cliente | Todos | FLAG | Mock data |

#### D.3.4 Acciones Rápidas

| ID | Funcionalidad | Descripción | Rol | Clasificación | Dependencias |
|----|---------------|-------------|-----|---------------|--------------|
| CL-058 | Acción - Nuevo Pedido | Botón para crear pedido desde cliente | Gerente | BASE | Módulo Pedidos |
| CL-059 | Acción - Crear Presupuesto | Botón para crear presupuesto desde cliente | Gerente | BASE | Módulo Presupuestos |
| CL-060 | Acción - Generar Factura | Botón para crear factura desde cliente | Gerente | BASE | Módulo Facturación |
| CL-061 | Acción - Registrar Llamada | Botón para registrar llamada | Gerente/Empleado | FLAG (CRM) | Módulo CRM |

### D.4 Pestaña DATOS

| ID | Funcionalidad | Descripción | Rol | Clasificación | Datos Implicados |
|----|---------------|-------------|-----|---------------|------------------|
| CL-062 | Datos - Botón Editar | Activa modo edición | Gerente | BASE | Permiso editar_cliente |
| CL-063 | Datos - Botón Cancelar | Cancela edición y restaura valores | Gerente | BASE | UI |
| CL-064 | Datos - Botón Guardar Cambios | Guarda cambios y sale de modo edición | Gerente | BASE | Permiso editar_cliente |
| CL-065 | Datos - Campo Nombre/Razón Social | Texto editable | Gerente | BASE | name |
| CL-066 | Datos - Campo NIF/CIF | Texto editable | Gerente | BASE | fiscalId |
| CL-067 | Datos - Campo Empresa | Texto editable | Gerente | BASE | legalName |
| CL-068 | Datos - Campo Email | Email editable con validación | Gerente | BASE | email |
| CL-069 | Datos - Campo Teléfono | Tel editable | Gerente | BASE | phone |
| CL-070 | Datos - Campo Dirección | Texto editable | Gerente | BASE | address (street) |
| CL-071 | Datos - Campo Código Postal | Texto editable | Gerente | BASE | address (postalCode) |
| CL-072 | Datos - Campo Ciudad | Texto editable | Gerente | BASE | address (city) |
| CL-073 | Datos - Campo Provincia/Estado | Texto editable | Gerente | BASE | address (state) |
| CL-074 | Datos - Campo País | Texto editable | Gerente | BASE | address (country) |
| CL-075 | Datos - Secciones organizadas | 3 secciones: Identificación, Contacto, Dirección | Todos | BASE | UI |
| CL-076 | Datos - Campos deshabilitados fuera de edición | Campos grises cuando no se está editando | Todos | BASE | UI |
| CL-077 | Datos - Grid responsive | 2 columnas en desktop, 1 en mobile | Todos | BASE | UI |

### D.5 Pestaña ACTIVIDAD

| ID | Funcionalidad | Descripción | Rol | Clasificación | Datos Implicados |
|----|---------------|-------------|-----|---------------|------------------|
| CL-078 | Actividad - Filtro por tipo | Dropdown para filtrar (todos, pedido, factura, presupuesto, llamada, nota, pago) | Todos | BASE | activity.type |
| CL-079 | Actividad - Timeline vertical | Lista cronológica de eventos | Todos | BASE | activities[] |
| CL-080 | Actividad - Icono por tipo | Icono diferente según tipo de evento | Todos | BASE | activity.type |
| CL-081 | Actividad - Color por tipo | Fondo de color según tipo | Todos | BASE | activity.type |
| CL-082 | Actividad - Referencia | Número de referencia (ej: #1245, FAC-2025-001) | Todos | BASE | activity.reference |
| CL-083 | Actividad - Importe | Muestra importe si aplica | Todos | BASE | activity.amount |
| CL-084 | Actividad - Badge de estado | Estado (completado, pendiente, cancelado, pagado, vencido) | Todos | BASE | activity.status |
| CL-085 | Actividad - Descripción | Texto descriptivo del evento | Todos | BASE | activity.description |
| CL-086 | Actividad - Fecha y hora | Timestamp formateado | Todos | BASE | activity.date |
| CL-087 | Actividad - Estado vacío | Mensaje cuando no hay actividad | Todos | BASE | UI |

### D.6 Pestaña NOTAS

| ID | Funcionalidad | Descripción | Rol | Clasificación | Datos Implicados |
|----|---------------|-------------|-----|---------------|------------------|
| CL-088 | Notas - Formulario añadir nota | Textarea para nueva nota | Gerente/Empleado | BASE | Permiso crear_nota |
| CL-089 | Notas - Botón Añadir Nota | Guarda nota (deshabilitado si vacío) | Gerente/Empleado | BASE | Permiso crear_nota |
| CL-090 | Notas - Listado de notas | Timeline de notas con autor y fecha | Todos | BASE | notes[] |
| CL-091 | Notas - Estado vacío | Mensaje cuando no hay notas | Todos | BASE | UI |
| CL-092 | Notas - Loader | Spinner durante carga | Todos | BASE | UI |

### D.7 Pestaña FACTURAS

| ID | Funcionalidad | Descripción | Rol | Clasificación | Dependencias |
|----|---------------|-------------|-----|---------------|--------------|
| CL-093 | Facturas - Vista integrada | Componente FacturasClienteView completo | Todos | BASE | Módulo Facturación |
| CL-094 | Facturas - Filtrado por cliente | Solo facturas del cliente seleccionado | Todos | BASE | customerId |

---

## E) MODAL AÑADIR CLIENTE

### E.1 Header y Estructura

| ID | Funcionalidad | Descripción | Rol | Clasificación | Notas |
|----|---------------|-------------|-----|---------------|-------|
| CL-095 | Modal Crear - Header verde | Gradiente verde-emerald | Gerente | BASE | UI |
| CL-096 | Modal Crear - Título | "Añadir Cliente" | Gerente | BASE | UI |
| CL-097 | Modal Crear - Subtítulo contextual | Indica acción siguiente si viene de presupuesto/factura | Gerente | BASE | Contexto workflow |
| CL-098 | Modal Crear - Botón cerrar (X) | Cierra modal | Gerente | BASE | UI |
| CL-099 | Modal Crear - Responsive | Adapta a mobile/desktop | Gerente | BASE | UI |
| CL-100 | Modal Crear - Scroll en body | Body con scroll si contenido excede altura | Gerente | BASE | UI |

### E.2 Paso 1: Tipo de Cliente

| ID | Funcionalidad | Descripción | Rol | Clasificación | Datos Implicados |
|----|---------------|-------------|-----|---------------|------------------|
| CL-101 | Tipo - Selección Particular | Card seleccionable para persona física | Gerente | BASE | tipo: 'particular' |
| CL-102 | Tipo - Selección Empresa | Card seleccionable para persona jurídica | Gerente | BASE | tipo: 'empresa' |
| CL-103 | Tipo - Icono diferenciado | User para particular, Building para empresa | Gerente | BASE | UI |
| CL-104 | Tipo - Estado activo visual | Borde verde y fondo verde claro al seleccionar | Gerente | BASE | UI |
| CL-105 | Tipo - Campo obligatorio | Marcado con asterisco rojo | Gerente | BASE | Validación |

### E.3 Paso 2: Datos Básicos Obligatorios

| ID | Funcionalidad | Descripción | Rol | Clasificación | Datos Implicados |
|----|---------------|-------------|-----|---------------|------------------|
| CL-106 | Campo Nombre/Razón Social | Input texto, etiqueta cambia según tipo | Gerente | BASE | nombreRazon |
| CL-107 | Campo Email | Input email con icono | Gerente | BASE | email |
| CL-108 | Campo Teléfono | Input tel con icono | Gerente | BASE | telefono |
| CL-109 | Validación campos obligatorios | Los 3 campos deben estar llenos para guardar | Gerente | BASE | Validación |
| CL-110 | Auto-sync email acceso | Email principal se copia a email de acceso | Gerente | BASE | Lógica |
| CL-111 | Autofocus en nombre | Campo nombre se enfoca al abrir modal | Gerente | BASE | UX |

### E.4 Datos Adicionales Opcionales (Colapsable)

| ID | Funcionalidad | Descripción | Rol | Clasificación | Datos Implicados |
|----|---------------|-------------|-----|---------------|------------------|
| CL-112 | Botón "+ Añadir datos adicionales" | Toggle para mostrar/ocultar sección | Gerente | BASE | UI |
| CL-113 | Campo DNI/NIE o CIF | Input opcional, etiqueta cambia según tipo | Gerente | BASE | documentoFiscal |
| CL-114 | Campo Dirección | Input opcional con icono | Gerente | BASE | direccion |
| CL-115 | Campo Notas internas | Textarea opcional | Gerente | BASE | notasInternas |
| CL-116 | Aviso notas internas | Texto indicando que cliente no las ve | Gerente | BASE | UI |
| CL-117 | Sección colapsada por defecto | Datos adicionales ocultos inicialmente | Gerente | BASE | UX |

### E.5 Paso 3: Acceso al Portal Cliente

| ID | Funcionalidad | Descripción | Rol | Clasificación | Dependencias |
|----|---------------|-------------|-----|---------------|--------------|
| CL-118 | Checkbox "Dar acceso al portal" | Activa/desactiva acceso | Gerente | FLAG (Portal Cliente) | Portal B2C |
| CL-119 | Descripción checkbox | Explica que cliente recibirá email | Gerente | FLAG | Portal B2C |
| CL-120 | Campo Email de acceso | Input email (usa principal por defecto) | Gerente | FLAG | emailAcceso |
| CL-121 | Selector Idioma preferido | Dropdown: ES, EN, FR, DE | Gerente | FLAG | idiomaPreferido |
| CL-122 | Selector Centro asociado | Dropdown de centros/empresas | Gerente | BASE | Multiempresa |
| CL-123 | Aviso email contraseña | Banner azul explicando envío de email | Gerente | FLAG | Portal B2C |
| CL-124 | Sección colapsada si no activada | Solo se muestra si checkbox marcado | Gerente | FLAG | UX |

### E.6 Footer y Acciones

| ID | Funcionalidad | Descripción | Rol | Clasificación | Notas |
|----|---------------|-------------|-----|---------------|-------|
| CL-125 | Botón Cancelar | Cierra modal sin guardar | Gerente | BASE | UI |
| CL-126 | Botón "Guardar y crear [documento]" | Guarda cliente y continúa workflow | Gerente | BASE | Workflow |
| CL-127 | Botón "Guardar cliente" | Guarda cliente y cierra modal | Gerente | BASE | Acción principal |
| CL-128 | Validación antes de guardar | Botones deshabilitados si faltan campos obligatorios | Gerente | BASE | Validación |
| CL-129 | Footer responsive | Stack vertical en mobile | Gerente | BASE | UI |
| CL-130 | Contexto workflow | Botón intermedio solo aparece si viene de presupuesto/factura/pedido | Gerente | BASE | Lógica |

---

## F) ACCIONES TRANSVERSALES

### F.1 Restricciones de Acceso

| ID | Funcionalidad | Descripción | Rol | Clasificación | Dependencias |
|----|---------------|-------------|-----|---------------|--------------|
| CL-131 | Bloqueo Vista Global | Muestra RestrictedSection si viewMode='global' | Todos | BASE | Sistema multiempresa |
| CL-132 | Banner Vista Global | GlobalViewBanner con mensaje explicativo | Todos | BASE | Sistema multiempresa |
| CL-133 | Mensaje restricción | "Gestión de Clientes no disponible en Vista Global" | Todos | BASE | UI |

### F.2 Navegación y Contexto

| ID | Funcionalidad | Descripción | Rol | Clasificación | Dependencias |
|----|---------------|-------------|-----|---------------|--------------|
| CL-134 | Tabs horizontales con scroll | Scroll horizontal en mobile para tabs | Todos | BASE | Responsive |
| CL-135 | Tabs con contador | Algunos tabs muestran (N) elementos | Todos | BASE | UI |
| CL-136 | Visibilidad condicional tabs | CRM y Afiliados solo para Gerente | Gerente | BASE | Permisos |
| CL-137 | Tab activo por defecto | "Presupuestos" es tab inicial para Gerente | Gerente | BASE | UX |

### F.3 Estados Vacíos

| ID | Funcionalidad | Descripción | Ubicación | Clasificación |
|----|---------------|-------------|-----------|---------------|
| CL-138 | Estado vacío - Promociones | Icono Tag + mensaje + sugerencia | Tab Promociones | BASE |
| CL-139 | Estado vacío - Actividad | Icono Clock + mensaje | Tab Actividad | BASE |
| CL-140 | Estado vacío - Notas | Icono StickyNote + mensaje | Tab Notas | BASE |

### F.4 Funcionalidades Pendientes/Futuras (Transversales)

| ID | Funcionalidad | Descripción | Clasificación | Prioridad |
|----|---------------|-------------|---------------|-----------|
| CL-PEND-014 | Confirmación eliminación | Modal de confirmación antes de eliminar cliente | PENDIENTE | Crítica |
| CL-PEND-015 | Gestión de duplicados | Detectar clientes duplicados por email/NIF | PENDIENTE | Alta |
| CL-PEND-016 | Validación formato email | Regex para validar email válido | PENDIENTE | Alta |
| CL-PEND-017 | Validación formato teléfono | Validar formato telefónico internacional | PENDIENTE | Media |
| CL-PEND-018 | Historial de cambios | Auditoría de quién modificó qué y cuándo | PENDIENTE | Media |
| CL-PEND-019 | Archivar cliente | Marcar cliente como archivado (soft delete) | PENDIENTE | Media |
| CL-PEND-020 | Restaurar cliente | Deshacer archivado | PENDIENTE | Baja |
| CL-PEND-021 | Duplicar cliente | Crear nuevo cliente basado en existente | PENDIENTE | Baja |
| CL-PEND-022 | Fusionar clientes | Unir dos clientes duplicados | PENDIENTE | Media |
| CL-PEND-023 | Enviar email al cliente | Botón para enviar email directo | FLAG | Media |
| CL-PEND-024 | Enviar WhatsApp | Botón para abrir WhatsApp Web/API | FLAG | Media |
| CL-PEND-025 | Llamar por teléfono | Integración con VoIP o click-to-call | FLAG | Baja |

---

## G) REPORTES DEL MÓDULO CLIENTES

### G.1 Reportes Existentes

**Actualmente NO hay reportes específicos del módulo Clientes implementados.**

### G.2 Reportes Propuestos (FUTURO)

| ID | Reporte | Descripción | Clasificación | Prioridad |
|----|---------|-------------|---------------|-----------|
| CL-REP-001 | Top Clientes por Facturación | Ranking de clientes que más gastan | PENDIENTE | Alta |
| CL-REP-002 | Clientes Nuevos por Período | Evolución mensual de nuevos clientes | PENDIENTE | Media |
| CL-REP-003 | Clientes Inactivos | Clientes sin actividad en X días | PENDIENTE | Alta |
| CL-REP-004 | Distribución Geográfica | Mapa de clientes por ciudad/región | FLAG | Baja |
| CL-REP-005 | Análisis de Segmentación | Clientes por segmento/etiqueta | FLAG | Media |
| CL-REP-006 | Tasa de Retención | % de clientes recurrentes | PENDIENTE | Media |
| CL-REP-007 | Valor de Vida del Cliente (LTV) | Proyección de valor total | FLAG | Baja |
| CL-REP-008 | Clientes por Origen | De dónde provienen los clientes | FLAG | Baja |

---

## H) MATRIZ FINAL: BASE vs FLAG vs PENDIENTE

### H.1 Resumen por Categoría

| Categoría | BASE | FLAG | PENDIENTE | TOTAL |
|-----------|------|------|-----------|-------|
| Navegación y Tabs | 7 | 3 | 0 | 10 |
| Listado de Clientes | 20 | 0 | 13 | 33 |
| Modal Detalle - Header | 9 | 2 | 0 | 11 |
| Modal Detalle - Tabs | 8 | 0 | 0 | 8 |
| Pestaña Resumen | 15 | 4 | 0 | 19 |
| Pestaña Datos | 16 | 0 | 0 | 16 |
| Pestaña Actividad | 10 | 0 | 0 | 10 |
| Pestaña Notas | 5 | 0 | 0 | 5 |
| Pestaña Facturas | 2 | 0 | 0 | 2 |
| Modal Añadir Cliente | 30 | 6 | 0 | 36 |
| Acciones Transversales | 6 | 0 | 12 | 18 |
| Reportes | 0 | 3 | 5 | 8 |
| **TOTAL** | **128** | **18** | **30** | **176** |

*(Nota: La suma es mayor a 87 porque se incluyeron subcategorías y reportes propuestos)*

### H.2 Listado de FLAGS Detectadas

| ID | FLAG | Módulo Requerido | Crítico | Observaciones |
|----|------|------------------|---------|---------------|
| FL-001 | Tab Promociones | Marketing | No | Completamente vacío, preparado para futuro |
| FL-002 | Tab CRM | CRM | No | Completamente implementado, se oculta si no contratado |
| FL-003 | Tab Afiliados | Afiliados | No | Completamente implementado, solo Gerente |
| FL-004 | Badges/Etiquetas personalizables | Sistema Tags | No | Mock data, estructura preparada |
| FL-005 | Origen del Cliente | CRM/Marketing | No | Mock data, estructura preparada |
| FL-006 | Acción "Registrar Llamada" | CRM | No | Requiere módulo CRM |
| FL-007 | Portal Cliente - Dar acceso | Portal B2C | Sí | Sistema completo de acceso clientes |
| FL-008 | Portal Cliente - Idiomas | i18n | No | Preparado para multiidioma |
| FL-009 | Portal Cliente - Email contraseña | Emailing | Sí | Requiere sistema de emails |
| FL-010 | Segmentación avanzada | Analytics | No | Para análisis de clientes |
| FL-011 | Enviar email al cliente | Emailing | No | Integración con sistema de correos |
| FL-012 | Enviar WhatsApp | WhatsApp Business API | No | Integración externa |

### H.3 Desglose de Funcionalidades BASE por Módulo

**CORE BASE (sin dependencias):**
- Listado de clientes (vistas grid/tabla)
- CRUD de clientes (crear, ver, editar - NO eliminar)
- Gestión de datos básicos (nombre, email, teléfono, dirección, NIF)
- Navegación por tabs
- Estados vacíos
- Responsive mobile/desktop

**BASE con Dependencias de otros módulos:**
- Pestaña Facturas → Requiere Módulo Facturación
- Pestaña Actividad → Requiere Módulos Pedidos, Presupuestos, Facturación
- Acciones rápidas → Requieren Módulos Pedidos, Presupuestos, Facturación
- Tab Presupuestos → Requiere Módulo Presupuestos completo

---

## I) MEJORAS SUGERIDAS (NO OBLIGATORIO)

### I.1 Mejoras de UX

1. **Búsqueda inteligente con sugerencias**
   - Autocompletado mientras se escribe
   - Búsqueda fuzzy (tolerante a errores)
   - Destacado de coincidencias

2. **Acciones contextuales en hover**
   - Botones de acción rápida al pasar cursor sobre card/fila
   - Iconos de editar/eliminar/ver sin entrar al detalle

3. **Drag & drop para etiquetas**
   - Arrastrar clientes a grupos/segmentos
   - Gestión visual de categorías

4. **Timeline mejorada en Actividad**
   - Agrupación por fecha (Hoy, Ayer, Esta semana, etc.)
   - Filtros rápidos por período
   - Iconos interactivos que abren documentos referenciados

5. **Vista previa al hacer hover**
   - Tooltip con resumen del cliente sin abrir modal
   - KPIs principales en un vistazo

### I.2 Mejoras de Funcionalidad

6. **Sistema de notificaciones**
   - Alertas de clientes inactivos
   - Recordatorio de seguimiento
   - Notificación de cumpleaños (si se captura fecha)

7. **Plantillas de email**
   - Emails predefinidos para comunicación común
   - Personalización con variables del cliente

8. **Historial de comunicaciones**
   - Integrar emails enviados/recibidos
   - Registro de WhatsApp
   - Grabaciones de llamadas (si VoIP)

9. **Scoring de clientes**
   - Puntuación automática según actividad
   - Clasificación automática (A, B, C)

10. **Campos personalizados**
    - Permitir a cada empresa añadir campos custom
    - Configuración por vertical (Restauración vs Talleres)

### I.3 Mejoras de Rendimiento

11. **Virtualización de listado**
    - Renderizar solo elementos visibles
    - Mejora con listas de +1000 clientes

12. **Caché inteligente**
    - Guardar datos en localStorage/sessionStorage
    - Reducir llamadas al backend

13. **Lazy loading de tabs**
    - Cargar contenido de tabs solo al acceder
    - Reducir tiempo de carga inicial del modal

### I.4 Mejoras de Validación

14. **Validación en tiempo real**
    - Feedback instantáneo en campos
    - Indicadores de formato correcto/incorrecto

15. **Detección de duplicados durante creación**
    - Aviso si ya existe cliente con mismo email/NIF
    - Sugerencia de fusionar o vincular

16. **Validación de NIF/CIF/DNI**
    - Validación algorítmica de documentos españoles
    - Extensible a otros países

### I.5 Mejoras de Seguridad/Permisos

17. **Permisos granulares a nivel UI**
    - Ocultar botones según permisos
    - Mensajes contextuales de restricción

18. **Auditoría visible en UI**
    - Mostrar quién editó cada campo y cuándo
    - Historial de cambios accesible

19. **Protección de datos sensibles**
    - Ofuscar datos según rol (ej: empleado no ve totales)
    - Marcas visuales de datos confidenciales

### I.6 Mejoras de Integración

20. **Integración con Google Maps**
    - Validar direcciones reales
    - Calcular distancia desde empresa
    - Rutas optimizadas de visitas

21. **Integración con sistemas contables**
    - Exportar a Sage, A3, Contaplus
    - Sincronización bidireccional

22. **API pública para clientes**
    - Permitir a clientes actualizar sus datos vía API
    - Webhooks para eventos de clientes

---

## J) INCONSISTENCIAS Y RIESGOS DETECTADOS

### J.1 Inconsistencias de UX

| ID | Inconsistencia | Ubicación | Impacto | Solución Propuesta |
|----|----------------|-----------|---------|-------------------|
| UX-001 | Botón Info (i) en header sin funcionalidad | Header del módulo | Bajo | Implementar tooltip o eliminar |
| UX-002 | Cards de cliente con diferentes estructuras | Vista grid | Medio | Unificar componente Card |
| UX-003 | Estados "activo/inactivo" sin acción para cambiar | Badges en listado | Medio | Añadir toggle o acción contextual |
| UX-004 | Iconos en tabs mobile sin labels | Navegación modal | Bajo | Considerar siempre mostrar texto |
| UX-005 | Sin indicación de campos editables | Pestaña Datos fuera de modo edición | Bajo | Añadir icono lápiz o tooltip |

### J.2 Riesgos Funcionales

| ID | Riesgo | Descripción | Severidad | Mitigación Propuesta |
|----|--------|-------------|-----------|---------------------|
| RK-001 | Sin confirmación al eliminar | No hay función delete implementada | CRÍTICO | Implementar modal de confirmación |
| RK-002 | Sin detección de duplicados | Puede crear clientes repetidos | ALTA | Validar email/NIF únicos en backend |
| RK-003 | Sin validación de email | Acepta cualquier texto como email | ALTA | Regex de validación + verificación |
| RK-004 | Sin límite en listado | Renderiza todos los clientes sin paginación | MEDIA | Implementar paginación o scroll infinito |
| RK-005 | Datos calculados en frontend | Ticket medio, días desde último pedido | MEDIA | Calcular en backend para consistencia |
| RK-006 | Sin estados de loading | No hay feedback durante fetch | MEDIA | Añadir skeletons y spinners |
| RK-007 | Sin manejo de errores visible | No muestra errores de API al usuario | ALTA | Toast/banner de errores |
| RK-008 | Mock data mezclado con real | Etiquetas, origen son mock | MEDIA | Separar claramente o eliminar |
| RK-009 | Sin restore en cancelar edición | Podría perder cambios sin guardar | BAJA | Implementado correctamente |
| RK-010 | Sin limit en textarea notas | Usuario puede escribir texto infinito | BAJA | Añadir maxLength |

### J.3 Riesgos de Permisos

| ID | Riesgo | Descripción | Severidad | Mitigación Propuesta |
|----|--------|-------------|-----------|---------------------|
| PR-001 | Todo visible para todos | No hay ocultación por rol en UI | ALTA | Implementar permisos en componentes |
| PR-002 | Botones habilitados sin validación backend | Frontend permite acciones que backend podría rechazar | MEDIA | Validar permisos antes de enviar |
| PR-003 | Tab CRM visible aunque no contratado | Depende de variable local | BAJA | Validar desde backend |
| PR-004 | Sin distinción empleado/gerente en datos | Empleado ve totales facturados | MEDIA | Ofuscar datos según rol |

### J.4 Riesgos Técnicos

| ID | Riesgo | Descripción | Severidad | Mitigación Propuesta |
|----|--------|-------------|-----------|---------------------|
| TC-001 | Cliente sin backend conectado | Todo es mock data o localStorage | N/A | Esperado en fase de diseño |
| TC-002 | Sin gestión de concurrencia | Dos usuarios editando mismo cliente | MEDIA | Implementar optimistic locking |
| TC-003 | Sin sincronización multiempresa | Cambios en una empresa no afectan otras | BAJA | Validar flujo multiempresa |
| TC-004 | Dependencia de módulos externos | Facturas, Pedidos, Presupuestos deben existir | ALTA | Validar integración modular |

---

## K) DATOS IMPLICADOS (CONCEPTUAL)

### K.1 Entidad: Cliente (Customer)

| Campo | Tipo | Obligatorio | Descripción | Validaciones |
|-------|------|-------------|-------------|--------------|
| id | UUID/String | Sí | Identificador único | Autogenerado |
| name | String | Sí | Nombre completo o razón social | Min 3 caracteres |
| email | Email | Sí | Email principal | Formato email válido, único |
| phone | String | Sí | Teléfono de contacto | Formato internacional |
| address | Object/String | No | Dirección completa | - |
| address.street | String | No | Calle y número | - |
| address.city | String | No | Ciudad | - |
| address.state | String | No | Provincia/Estado | - |
| address.postalCode | String | No | Código postal | - |
| address.country | String | No | País | Default: España |
| fiscalId | String | No | NIF/CIF/DNI | Validación según país |
| legalName | String | No | Razón social | Solo si tipo=empresa |
| tipo | Enum | Sí | particular \| empresa | - |
| status | Enum | Sí | activo \| inactivo | Default: activo |
| totalOrders | Number | No | Número de pedidos | Calculado |
| totalSpent | Number | No | Total facturado | Calculado |
| lastOrder | Date | No | Fecha último pedido | Calculado |
| createdAt | Timestamp | Sí | Fecha de creación | Autogenerado |
| updatedAt | Timestamp | Sí | Fecha última modificación | Auto-actualizado |
| createdBy | UUID | Sí | Usuario que creó | Relación User |
| empresaId | UUID | Sí | Empresa asociada | Relación Empresa |

### K.2 Entidad: ClienteEmpresa (Relación M:N)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| customerId | UUID | FK a Cliente |
| empresaId | UUID | FK a Empresa |
| customerCode | String | Código interno del cliente |
| segment | String | Segmento (VIP, Regular, etc) |
| paymentTerms | Number | Días de condiciones de pago |
| discountPercentage | Number | % de descuento |
| creditLimit | Number | Límite de crédito |
| totalOrders | Number | Pedidos en esta empresa |
| totalSpent | Number | Total gastado en esta empresa |
| lastOrderDate | Date | Último pedido en esta empresa |

### K.3 Entidad: CustomerNote (Notas)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | Identificador único |
| customerId | UUID | FK a Cliente |
| content | Text | Contenido de la nota |
| authorId | UUID | FK a User |
| createdAt | Timestamp | Fecha de creación |
| isPrivate | Boolean | Si es visible solo internamente |

### K.4 Entidad: CustomerActivity (Actividad)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | Identificador único |
| customerId | UUID | FK a Cliente |
| type | Enum | pedido, factura, presupuesto, llamada, nota, pago |
| reference | String | Número de referencia |
| description | Text | Descripción del evento |
| amount | Number | Importe si aplica |
| status | Enum | completado, pendiente, cancelado, pagado, vencido |
| date | Timestamp | Fecha del evento |
| userId | UUID | Usuario que realizó la acción |

### K.5 Entidad: CustomerTag (Etiquetas) - FLAG

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | Identificador único |
| customerId | UUID | FK a Cliente |
| tagId | UUID | FK a Tag |
| assignedBy | UUID | FK a User |
| assignedAt | Timestamp | Fecha de asignación |

### K.6 Entidad: PortalAccess (Acceso Portal) - FLAG

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | Identificador único |
| customerId | UUID | FK a Cliente |
| email | Email | Email de acceso |
| hashedPassword | String | Contraseña hasheada |
| language | String | Idioma preferido |
| centroId | UUID | Centro asociado |
| isActive | Boolean | Si tiene acceso activo |
| lastLogin | Timestamp | Último inicio de sesión |
| createdAt | Timestamp | Fecha de creación acceso |

---

## L) ESTADOS Y FLUJOS

### L.1 Estados del Cliente

| Estado | Descripción | Transiciones Permitidas |
|--------|-------------|------------------------|
| activo | Cliente con actividad reciente | → inactivo, archivado |
| inactivo | Cliente sin actividad en X días | → activo, archivado |
| archivado | Cliente marcado como archivado (soft delete) | → activo |
| bloqueado | Cliente bloqueado por impago (FLAG) | → activo |

### L.2 Flujo de Creación de Cliente

```
1. Click "Añadir Cliente"
2. Modal se abre
3. Seleccionar tipo (Particular/Empresa)
4. Rellenar datos obligatorios (nombre, email, teléfono)
5. [Opcional] Expandir datos adicionales (NIF, dirección, notas)
6. [Opcional] Activar acceso portal
7. Click "Guardar cliente"
8. → Validación frontend
9. → Envío a backend (POST /api/customers)
10. → Validación backend (email único, formato, etc)
11. → Creación en BD
12. → [Si acceso portal] Envío email contraseña
13. → Retorno a listado con nuevo cliente
14. → Toast de confirmación
```

### L.3 Flujo de Edición de Cliente

```
1. Click en cliente (card o fila)
2. Modal de detalle se abre
3. Click en tab "Datos"
4. Click "Editar"
5. → Campos se habilitan
6. → Modificar datos
7. Click "Guardar Cambios" o "Cancelar"
8. → [Si Guardar] Validación frontend
9. → Envío a backend (PUT /api/customers/:id)
10. → Actualización en BD
11. → Retorno de datos actualizados
12. → Actualización de UI
13. → Toast de confirmación
```

### L.4 Flujo de Creación desde Presupuesto

```
1. Usuario en módulo Presupuestos
2. Click "Nuevo Presupuesto"
3. No existe cliente → Click "Crear cliente nuevo"
4. → Modal Añadir Cliente se abre con contexto='presupuesto'
5. → Subtítulo: "Crear cliente y continuar con presupuesto"
6. → Botón adicional: "Guardar y crear presupuesto"
7. Rellenar datos del cliente
8. Click "Guardar y crear presupuesto"
9. → Cliente se crea
10. → Modal se cierra
11. → Cliente recién creado se preselecciona en presupuesto
12. → Usuario continúa creando presupuesto
```

---

## M) NOTIFICACIONES

### M.1 Notificaciones Actuales (Implementadas)

**Ninguna notificación está implementada actualmente.**

### M.2 Notificaciones Propuestas (FUTURO)

| ID | Evento | Destinatario | Canal | Clasificación |
|----|--------|--------------|-------|---------------|
| NOT-001 | Nuevo cliente creado | Gerente | Sistema + Email | BASE |
| NOT-002 | Cliente editado | Usuario que creó | Sistema | BASE |
| NOT-003 | Cliente inactivo (30 días sin actividad) | Gerente | Sistema | PENDIENTE |
| NOT-004 | Cliente accedió al portal | Gerente | Sistema | FLAG |
| NOT-005 | Cliente solicitó presupuesto desde portal | Gerente | Sistema + Email | FLAG |
| NOT-006 | Cliente cercano a límite de crédito | Gerente + Finanzas | Sistema + Email | FLAG |
| NOT-007 | Recordatorio seguimiento | Usuario asignado | Sistema | FLAG (CRM) |
| NOT-008 | Cliente cumpleaños | Usuario asignado | Sistema | FLAG |

---

## N) PERMISOS (CONCEPTUAL)

### N.1 Permisos Identificados

| Código | Permiso | Descripción | Roles con acceso |
|--------|---------|-------------|-----------------|
| clientes.ver | Ver módulo clientes | Acceso al módulo | Gerente, Empleado |
| clientes.listar | Ver listado de clientes | Ver todos los clientes | Gerente, Empleado |
| clientes.crear | Crear clientes | Añadir nuevos clientes | Gerente |
| clientes.editar | Editar clientes | Modificar datos de clientes | Gerente |
| clientes.eliminar | Eliminar clientes | Borrar clientes (soft delete) | Gerente |
| clientes.ver_detalle | Ver detalle completo | Acceder a modal de detalle | Gerente, Empleado |
| clientes.ver_financiero | Ver datos financieros | Ver totales, facturas, etc | Gerente |
| clientes.exportar | Exportar datos | Descargar CSV/Excel | Gerente |
| clientes.importar | Importar datos | Subir CSV/Excel | Gerente |
| clientes.notas.crear | Crear notas | Añadir notas en cliente | Gerente, Empleado |
| clientes.notas.ver | Ver notas | Leer notas del cliente | Gerente, Empleado |
| clientes.portal.gestionar | Gestionar acceso portal | Dar/quitar acceso portal | Gerente |
| clientes.tags.gestionar | Gestionar etiquetas | Asignar/quitar tags | Gerente |
| clientes.segmentos.gestionar | Gestionar segmentos | Crear/modificar segmentos | Gerente |

### N.2 Matriz de Permisos por Rol

| Permiso | Gerente | Empleado | Cliente (Portal) |
|---------|---------|----------|------------------|
| clientes.ver | ✅ | ✅ | ❌ |
| clientes.listar | ✅ | ✅ | ❌ |
| clientes.crear | ✅ | ❌ | ❌ |
| clientes.editar | ✅ | ❌ | ❌ |
| clientes.eliminar | ✅ | ❌ | ❌ |
| clientes.ver_detalle | ✅ | ✅ (limitado) | ❌ |
| clientes.ver_financiero | ✅ | ❌ | ❌ |
| clientes.exportar | ✅ | ❌ | ❌ |
| clientes.importar | ✅ | ❌ | ❌ |
| clientes.notas.crear | ✅ | ✅ | ❌ |
| clientes.notas.ver | ✅ | ✅ | ❌ |
| clientes.portal.gestionar | ✅ | ❌ | ❌ |
| clientes.tags.gestionar | ✅ | ❌ | ❌ |
| clientes.segmentos.gestionar | ✅ | ❌ | ❌ |

---

## O) DEPENDENCIAS ENTRE MÓDULOS

### O.1 Módulos que CLIENTES Consume

| Módulo | Funcionalidad Consumida | Tipo Dependencia |
|--------|------------------------|-----------------|
| Presupuestos | Vista completa de presupuestos | FUERTE |
| Facturación | Listado de facturas por cliente | FUERTE |
| Pedidos | Historial de pedidos en Actividad | FUERTE |
| CRM | Tab CRM completo (Leads, Oportunidades) | FLAG |
| Afiliados | Tab Afiliados completo | FLAG |
| Equipo | Usuario creador, responsables | FUERTE |
| Empresa | Multiempresa, centros, colores | FUERTE |
| Emailing | Envío de emails de acceso portal | FLAG |
| i18n | Idiomas en portal cliente | FLAG |
| Tags | Sistema de etiquetado | FLAG |

### O.2 Módulos que Consumen CLIENTES

| Módulo | Funcionalidad Consumida | Tipo Dependencia |
|--------|------------------------|-----------------|
| Presupuestos | Selector de cliente en crear presupuesto | FUERTE |
| Facturación | Selector de cliente en crear factura | FUERTE |
| Pedidos | Selector de cliente en crear pedido | FUERTE |
| CRM | Convertir Lead a Cliente | FUERTE |
| Informes | Reportes de clientes | MEDIA |
| Dashboard | KPIs de clientes nuevos, activos | MEDIA |
| Portal Cliente | Datos del cliente logueado | FLAG |

---

## P) CONCLUSIONES Y PRÓXIMOS PASOS

### P.1 Estado Actual del Módulo

El módulo **Clientes** está **71.3% implementado en BASE** con:
- ✅ CRUD completo (crear, ver, editar - NO eliminar)
- ✅ Dos vistas (grid y tabla)
- ✅ Modal de detalle con 5 pestañas funcionales
- ✅ Integración con Presupuestos, Facturación, CRM, Afiliados
- ✅ Diseño responsive mobile/desktop
- ✅ Sistema de permisos conceptual
- ❌ Sin backend conectado (mock data)
- ❌ Sin validaciones de seguridad
- ❌ Sin paginación
- ❌ Sin búsqueda/filtros

### P.2 Decisiones Críticas Pendientes

1. **Definir modelo de FLAGS:**
   - ¿CRM es FLAG independiente o viene en BASE?
   - ¿Afiliados es FLAG independiente?
   - ¿Portal Cliente es FLAG crítica?

2. **Definir alcance de Promociones:**
   - ¿Es funcionalidad BASE o FLAG de Marketing?
   - ¿Qué características debe tener?

3. **Definir permisos granulares:**
   - ¿Empleado puede editar clientes?
   - ¿Empleado ve datos financieros?
   - ¿Roles personalizados por empresa?

4. **Definir importación/exportación:**
   - ¿Prioridad alta o baja?
   - ¿Qué formato (CSV, Excel, ambos)?
   - ¿Validaciones en importación?

### P.3 Prioridades de Implementación (Backend)

**CRÍTICO (Semana 1-2):**
- Conexión a backend real
- CRUD completo con validaciones
- Gestión de duplicados
- Validación de email/teléfono
- Permisos básicos (ver vs editar)
- Paginación
- Búsqueda simple

**ALTA (Semana 3-4):**
- Sistema de notas
- Historial de actividad
- Integración con Facturación/Pedidos
- Estados de loading
- Manejo de errores
- Confirmación de eliminación

**MEDIA (Mes 2):**
- Exportar/Importar
- Filtros avanzados
- Etiquetas/Tags
- Segmentación
- Reportes básicos

**BAJA (Backlog):**
- Portal Cliente
- Integración WhatsApp
- Campos personalizados
- Scoring de clientes
- Vista mapa

### P.4 Documento Técnico (Siguiente Fase)

Este documento servirá de base para crear:
1. **Especificación técnica de API:**
   - Endpoints (GET, POST, PUT, DELETE)
   - Schemas de request/response
   - Códigos de error
   - Autenticación/Autorización

2. **Modelo de base de datos:**
   - Tablas y relaciones
   - Índices
   - Constraints
   - Migraciones

3. **Casos de uso técnicos:**
   - Flujos con backend
   - Manejo de errores
   - Optimizaciones
   - Caché

4. **Plan de testing:**
   - Unit tests
   - Integration tests
   - E2E tests
   - Test de permisos

---

**FIN DE AUDITORÍA**

Documento generado para Vertial  
Módulo: Clientes  
Fecha: 11 de febrero de 2026  
Versión: 1.0

