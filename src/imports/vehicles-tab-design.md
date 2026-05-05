Quiero que diseñes la pestaña “Vehículos” del SaaS para concesionarios dentro de Vertial / ANCOVE.

IMPORTANTE
- Diseña esta pantalla pensando en un sistema único, conectado y sin duplicidades.
- La pestaña Vehículos no debe funcionar como módulo aislado.
- Todo lo que se vea aquí debe estar conectado con:
  - Compras
  - Ventas
  - Clientes
  - Documentos
  - Finanzas
  - Expediente / historial
- No quiero datos mock irreales.
- Usa estados vacíos realistas, labels claros, microcopy profesional y estructura UX limpia.
- Mantén el estilo visual actual del SaaS.
- No rediseñes el menú lateral ni la cabecera global.
- Céntrate solo en el contenido interno de la pestaña Vehículos.

OBJETIVO DEL MÓDULO VEHÍCULOS
La pantalla debe ser el centro del stock y del expediente maestro del vehículo.
Debe permitir:
- ver el stock real
- controlar disponibilidad y estado
- acceder al expediente completo del coche
- consultar documentación, gastos, ubicación e historial
- preparar el vehículo para venta sin duplicar información

LÓGICA DE SISTEMA
Ten en cuenta estas reglas:
- Un vehículo debe existir como entidad maestra, identificado principalmente por bastidor y asociado a matrícula si existe.
- Vehículos no debe crear una copia distinta de Compras o Ventas.
- Debe mostrar el mismo coche y el mismo expediente conectados al resto del sistema.
- Los documentos visibles aquí deben ser los mismos que luego aparecen en Documentos y en el expediente.
- Los gastos visibles aquí deben alimentar Finanzas.
- El historial debe ser trazable y coherente con Compras, Ventas y cambios de estado.

ESTRUCTURA DE LA PANTALLA VEHÍCULOS
Diseña la pantalla principal con este contenido:

1. CABECERA
- Título: Vehículos
- Subtítulo: Stock, disponibilidad y expediente maestro
- Botón principal destacado: “Nuevo vehículo”

2. BLOQUE DE TABS SUPERIORES
Crear tabs internas claras para V1:
- Todos
- Disponibles
- En preparación
- Reservados
- Vendidos
- Archivados

Estas tabs deben ser visibles, simples y rápidas de usar.

3. FILTROS Y BÚSQUEDA
Añadir una franja superior de filtros operativos:
- buscador
- estado
- marca
- modelo
- ubicación
- responsable
- combustible
- fecha de entrada
- precio

En V1 pueden ser filtros simples y visuales.

4. TABLA PRINCIPAL
Diseñar una tabla limpia, profesional y operativa con estas columnas:
- ID
- Vehículo
- Bastidor
- Matrícula
- Estado
- Ubicación
- Precio venta
- Coste acumulado
- Responsable
- Fecha entrada
- Acciones

La tabla debe estar preparada para:
- vista vacía elegante
- vista con resultados
- acciones rápidas por fila

5. ACCIONES RÁPIDAS POR FILA
Añadir acciones tipo:
- Ver expediente
- Editar
- Cambiar estado
- Mover ubicación
- Subir foto o documento

No sobrecargar la tabla.

6. ESTADOS V1
Los estados base visibles en el módulo Vehículos deben ser:
- Disponible
- En preparación
- Reservado
- Vendido
- Archivado

Usar badges o etiquetas visuales claras.

DETALLE INTERNO DE CADA VEHÍCULO
Cuando el usuario entra a un vehículo, quiero un detalle lateral o pantalla interna con pestañas.

Pestañas V1:
- Resumen
- Datos del vehículo
- Documentos
- Gastos
- Historial
- Ubicación

CONTENIDO DE CADA PESTAÑA V1

A. RESUMEN
- foto principal
- estado actual
- disponibilidad
- responsable
- ubicación actual
- precio compra
- precio venta
- margen estimado
- alertas si falta información

B. DATOS DEL VEHÍCULO
- bastidor
- matrícula
- marca
- modelo
- versión
- año
- km
- combustible
- cambio
- color
- observaciones

C. DOCUMENTOS
- zona para subir archivos
- lista de documentos subidos
- estados simples tipo “completo / pendiente”

D. GASTOS
- listado de gastos asociados
- tipo de gasto
- importe
- fecha
- notas

E. HISTORIAL
- cambios de estado
- cambios de ubicación
- actividad reciente
- usuario
- fecha y hora

F. UBICACIÓN
- sede
- campa
- zona
- plaza
- fecha del último movimiento

REGLA DE EXPERIENCIA
La experiencia debe ser:
- intuitiva
- rápida
- profesional
- limpia
- pensada para concesionarios reales
- sin duplicar información
- conectada con el expediente maestro del vehículo

MÓDULOS V2 Y V3
Quiero que prepares visualmente funcionalidades futuras, claramente etiquetadas según plan.

REGLA DE ETIQUETADO
- Todo lo que sea V2 debe llevar etiqueta visible: “Normal”
- Todo lo que sea V3 debe llevar etiqueta visible: “Pro”

Estas etiquetas deben verse como badges pequeñas, elegantes y claras en la interfaz.

FUNCIONALIDADES V2 = ETIQUETA “Normal”
Añadirlas en el diseño como bloques, tabs o cards futuras bien marcadas con badge “Normal”:
- Pestaña “Preparación” → badge “Normal”
- Pestaña “Publicación” → badge “Normal”
- Pestaña “Tareas” → badge “Normal”
- Pestaña “Incidencias” → badge “Normal”

CONTENIDO DE V2 / NORMAL

Preparación:
- checklist estética
- checklist mecánica
- limpieza
- fotos pendientes
- fecha prevista de disponibilidad

Publicación:
- publicado sí/no
- portales activos
- fecha de publicación
- descripción comercial
- fotos comerciales

Tareas:
- tareas pendientes
- responsable
- prioridad
- vencimiento
- estado

Incidencias:
- incidencia detectada
- tipo
- gravedad
- coste estimado
- resolución

FUNCIONALIDADES V3 = ETIQUETA “Pro”
Añadirlas como módulos o bloques futuros claramente marcados con badge “Pro”:
- “IA de precio” → badge “Pro”
- “Alertas inteligentes” → badge “Pro”
- “OCR documental” → badge “Pro”
- “Rotación y rentabilidad” → badge “Pro”

CONTENIDO DE V3 / PRO

IA de precio:
- sugerencia de precio de venta
- alerta de precio fuera de mercado
- margen estimado inteligente

Alertas inteligentes:
- vehículo parado demasiado tiempo
- margen bajo
- documentación incompleta
- reserva próxima a caducar

OCR documental:
- lectura automática de ficha técnica
- lectura automática de permiso
- propuesta de autocompletar campos

Rotación y rentabilidad:
- días en stock
- coste acumulado
- margen real vs estimado
- ranking de rotación

IMPORTANTE SOBRE LAS ETIQUETAS
- “Normal” y “Pro” deben verse claras pero elegantes.
- No deben ensuciar la interfaz.
- Deben ayudar a entender qué incluye cada plan.
- No ocultes estas funciones; muéstralas como ampliaciones de producto.

ESTADOS VACÍOS
Diseña estados vacíos bonitos y útiles para:
- sin vehículos creados
- sin documentos
- sin gastos
- sin historial
- sin resultados por filtros

MICROCOPY
Usa textos profesionales y claros en castellano.
Ejemplos:
- “Aún no has registrado ningún vehículo”
- “Crea o importa un vehículo para empezar a gestionar tu stock”
- “No hay documentos asociados a este vehículo”
- “Aún no se han registrado gastos vinculados”
- “No hay movimientos recientes en el historial”

RESULTADO ESPERADO
Quiero una pestaña Vehículos:
- muy clara
- orientada a uso real
- conectada con el resto del SaaS
- preparada para escalabilidad
- con V1 limpia
- y futuras capas V2 = Normal y V3 = Pro claramente visibles
