Actúa como diseñador/a UX/UI senior para un SaaS B2B. Quiero diseñar el SaaS “UDAR EDGE” orientado a COMPRAVENTAS de coches en España, con integración y enfoque para ANCOVE (asociación).

REFERENCIA VISUAL
- Copia el estilo del pantallazo que te he pasado: sidebar izquierda con iconos, topbar superior, cards limpias con bordes suaves, tipografía clara, tabs/píldoras, y dashboard con KPIs + gráficas.
- Estilo: moderno, minimalista, corporativo, premium.
- Usa espacios en blanco, cards redondeadas, sombras muy sutiles, iconos lineales.

OBJETIVO DEL PRODUCTO
Resolver los problemas típicos del compraventa:
- Control de stock de vehículos (entradas/salidas/estado)
- Ubicación real: dónde está aparcado cada vehículo (zona, fila, plaza, almacén, exposición)
- Gestión de leads y clientes
- Gestión documental completa: recepción, contratos, hojas, facturas, fotos, adjuntos, versiones
- Firma digital ( *eSignature* ) explicada como “firma digital legal”
- Envío a gestoría ( *export* / *handoff* ) explicado como “envío y exportación a gestoría”
- IA para llamadas ( *AI* / *call assistant* ) explicada como “asistente de llamadas y transcripción”
- Conexión ANCOVE (validación socio, ventajas, integraciones)
- Flujo de desguace (baja, piezas, coste/ingreso, destino)

INFORMACIÓN DE ROLES
- Rol principal: Gerente (admin)
- Otros: Comercial, Administración, Operativa
Diseña UI preparada para permisos (sin construir detalle técnico, solo pantalla de roles simple).

ARQUITECTURA DEL SAAS (MENÚ LATERAL)
Crea el sidebar con estas secciones:
1) Dashboard
2) Operativa
   - Entradas (recepción vehículo)
   - Salidas (venta / entrega / desguace)
   - Aparcamiento / Ubicaciones
   - Llamadas (IA)
3) Stock (Vehículos)
4) Clientes (CRM)
5) Documentos
6) Ventas
7) Finanzas (básico)
8) ANCOVE
9) Sistema (usuarios, roles, integraciones, plantillas)

PANTALLAS A CREAR (DESKTOP + MOBILE)
Genera frames nombrados y ordenados:

A) 01 Dashboard
- Selector periodo (Mes actual) y filtro “Centro/Ubicación”
- Tabs tipo píldora: “Ingresos vs Gastos”, “Alertas”, “KPIs”, “Margen”, “Top5”
- Cards KPIs principales (formato como tu captura):
  1) Stock activo (nº vehículos)
  2) Rotación media (días en stock)
  3) Margen estimado del mes (€)
  4) Leads nuevos (hoy/semana)
- Gráfica principal: “Ventas vs Costes” o “Margen por semana”
- Sección “Alertas” (cards pequeñas):
  - Vehículos con más de X días en stock
  - Documentos pendientes de firma
  - Leads sin respuesta > 24h
  - Vehículos sin ubicación asignada

B) 02 Stock > Listado de vehículos (vista tabla + cards)
- Barra superior: buscador + filtros (estado, ubicación, etiqueta, origen, fecha entrada, precio)
- Tabla con columnas:
  Matrícula, Modelo, Año, Km, Precio venta, Coste, Margen, Estado, Ubicación, Días en stock
- Botón “+ Añadir vehículo”
- Acciones rápidas por fila: “Ver ficha”, “Cambiar estado”, “Mover ubicación”, “Documentos”

C) 03 Stock > Ficha de vehículo (detalle)
Layout en 2 columnas:
- Izquierda: Fotos + datos clave (matrícula, VIN, marca/modelo, versión, km, combustible, etiqueta, estado)
- Derecha: cards de:
  - Ubicación actual (mapa simple tipo grid: Zona / Fila / Plaza + historial movimientos)
  - Costes (compra, reacondicionamiento, transporte, otros)
  - Precio y margen (estimado/real)
Tabs dentro de la ficha:
1) Resumen
2) Documentos
3) Historial (movimientos y cambios)
4) Venta/Entrega
5) Desguace (si aplica)

D) 04 Operativa > Entrada (Recepción de vehículo)
Wizard en pasos con barra de progreso:
Paso 1: Datos del vehículo (matrícula, VIN, marca, modelo, km, estado)
Paso 2: Origen (particular, subasta, proveedor) + coste compra
Paso 3: Ubicación inicial (zona/fila/plaza)
Paso 4: Documentos de recepción (subir fotos/pdf) + check “pendiente”
Paso 5: Guardar y crear ficha
Incluye un botón “Escanear documentos” ( *OCR* _reconocimiento de texto_ ) como opción.

E) 05 Operativa > Aparcamiento / Ubicaciones
- Vista tipo “mapa de plazas” (grid)
- Filtros por zona
- Cada plaza muestra: matrícula + modelo + color/estado
- Acción: arrastrar y soltar para mover (si no, botón “Mover”)
- Historial de movimientos por vehículo

F) 06 Clientes (CRM) > Listado + Ficha cliente
Listado: nombre, DNI/NIE, teléfono, email, estado (lead/cliente), última interacción, comercial asignado.
Ficha:
- Datos personales y consentimientos
- Historial de interacciones
- Vehículos de interés / comprados
- Documentos asociados
IMPORTANTE: Añade botón “Crear contrato” que abre selección de plantilla y auto-rellena campos.

G) 07 Documentos (Repositorio)
- Buscador + filtros (tipo doc, vehículo, cliente, estado firma)
- Carpetas: “Recepción”, “Contratos”, “Hojas”, “Facturas”, “Gestoría”
- Estado por doc: Pendiente / Firmado / Enviado a gestoría
- Acción “Firmar” ( *eSignature* _firma digital_ ) y “Enviar a gestoría” (exportación)

H) 08 Ventas
- Pipeline simple (reservado → señal → financiación → entrega)
- Crear operación vinculada a vehículo + cliente
- Generar factura/contrato desde plantillas

I) 09 ANCOVE
Pantalla con:
- Estado de socio (validación)
- Beneficios/condiciones (placeholders)
- Integraciones disponibles (placeholders)
- Botón “Sincronizar” + log de sincronizaciones

J) 10 Sistema
- Usuarios y roles (tabla)
- Permisos por módulo
- Integraciones (API) (*API* _conexión con sistemas_) placeholders
- Plantillas de documentos (contrato compraventa, recepción, hoja entrega, factura)
- Configuración de ubicaciones (zonas/filas/plazas)

FUNCIONALIDADES CLAVE A REFLEJAR EN UI (SIN BACKEND)
1) Auto-rellenado de contratos:
- Desde ficha cliente + ficha vehículo, al crear contrato se rellenan campos automáticamente
- Si faltan datos, se marca “pendiente” y se solicita completar
2) Asistente de llamadas:
- Pantalla “Llamadas” con: lista de llamadas, botón “Registrar llamada”, transcripción, resumen, tareas sugeridas
( *AI* _asistente inteligente_ ) como copy explicativo.
3) Gestoría:
- Estado “Enviado a gestoría” + botón “Exportar paquete” (zip/pdf)
4) Desguace:
- En ficha vehículo: motivo, fecha, destino, ingresos por piezas, coste de baja, estado final

PROTOTIPO (CONEXIONES)
- Sidebar navega entre pantallas
- Stock listado → ficha vehículo
- Clientes → ficha cliente → crear contrato
- Documentos → ver documento → firmar → enviar a gestoría
- Operativa entrada → crea vehículo → abre ficha

ENTREGABLE
- Crea componentes reutilizables: Sidebar, Topbar, Card KPI, Tabla, Tabs/píldoras, Modal, Wizard stepper, Badge estados.
- Frames: Desktop 1440px y Mobile 390px para las pantallas clave (Dashboard, Stock listado, Ficha vehículo, Clientes, Documentos).
- No uses lorem ipsum. Escribe copy real en español, orientado a compraventas.