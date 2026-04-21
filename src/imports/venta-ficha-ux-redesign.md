Quiero que rehagas la UX de la ficha de detalle de una venta dentro del SaaS, manteniendo el mismo estilo visual general que ya tiene el producto, pero simplificando mucho la jerarquía y mejorando la claridad operativa.

IMPORTANTE
- No cambies la estética base del SaaS.
- No rediseñes colores, tipografía, iconografía ni estilo general.
- Mantén la línea visual actual.
- El problema no es el diseño gráfico, es la jerarquía UX.
- Quiero una versión más clara, más limpia y más operativa.

PROBLEMA ACTUAL
La ficha de venta actual está demasiado fragmentada:
- demasiadas cards pequeñas compiten entre sí
- se mezclan cobro, margen, historial, notas, fiscalidad y fases con el mismo peso visual
- cuesta entender rápidamente:
  1. en qué fase está la venta
  2. cuánto está cobrado y cuánto falta
  3. qué acción toca hacer ahora

OBJETIVO
Quiero que la ficha de venta responda en menos de 3 segundos a estas preguntas:
1. ¿En qué fase está la venta?
2. ¿Cuánto está cobrado y cuánto queda pendiente?
3. ¿Cuál es la siguiente acción recomendada?

NUEVA ESTRUCTURA UX

1. CABECERA SIMPLE
Mantener:
- título: Venta · [Vehículo]
- botón volver
- acciones generales si ya existen

2. BLOQUE SUPERIOR DE RESUMEN ÚNICO
Sustituir la fragmentación actual por un único bloque resumen claro y compacto.

Debe mostrar:
- Vehículo
- Cliente
- Estado de la venta
- Precio total acordado
- Cobrado
- Pendiente

Ejemplo de lógica:
- Toyota Corolla
- Pedro Gómez
- Estado: Interesado
- Total: 16.000 €
- Cobrado: 0 €
- Pendiente: 16.000 €

Este bloque debe ser la primera pieza visual importante.

3. WORKFLOW / BARRA DE FASES DE LA VENTA
Añadir una barra de fases simple y clara debajo del resumen superior.

Fases recomendadas:
- Interesado
- Reserva
- Documentación
- Vendido
- Entregado

Comportamiento visual:
- fase actual
- fases completadas
- fases pendientes

Debe entenderse muy rápido y encajar con el estilo actual del SaaS.

4. BLOQUE DE ACCIONES RÁPIDAS
Justo debajo del workflow, añadir acciones rápidas claras y prioritarias:

- Cambiar fase
- Registrar pago
- Editar venta
- Gestionar documentos

No quiero demasiados botones ni acciones duplicadas.
Debe ser un bloque limpio y práctico.

5. REORDENAR LAS TABS
Reorganizar la ficha en solo estas tabs principales:

- Resumen
- Cobros
- Documentos
- Historial

Eliminar la separación actual entre “Ficha” y “Economía” si genera redundancia.
No necesito más tabs si la información puede ordenarse mejor.

6. CONTENIDO DE CADA TAB

TAB RESUMEN
Debe contener solo lo esencial:
- resumen principal de la operación
- datos del vehículo
- datos del cliente
- fase actual
- siguiente acción recomendada
- margen resumido
- fecha estimada de entrega si existe

TAB COBROS
Debe contener:
- total acordado
- señal / entrada inicial
- cobrado
- pendiente
- botón principal “Registrar pago”
- margen estimado
- detalle fiscal en un bloque secundario o plegable

IMPORTANTE:
La parte fiscal no debe competir visualmente con el cobro principal.

TAB DOCUMENTOS
Debe contener:
- contrato de reserva
- contrato de venta
- factura
- justificantes de pago
- otros documentos asociados

TAB HISTORIAL
Debe contener:
- timeline de eventos
- cambios de fase
- pagos registrados
- notas internas
- actividad del equipo

7. MARGEN Y ECONOMÍA
El margen estimado sigue siendo importante, pero no debe ocupar tanto protagonismo como ahora.
Debe verse de forma más limpia dentro de:
- Resumen
o
- Cobros

No quiero varias tarjetas grandes compitiendo.
Debe ser un bloque secundario claro.

8. ACCIÓN RECOMENDADA
Añadir una sección simple de “Acción recomendada” según estado.

Ejemplos:
- si está en Interesado → “Pasar a reserva”
- si tiene reserva sin cobro → “Registrar señal”
- si está vendido sin pago completo → “Registrar pago pendiente”
- si está cobrado y vendido → “Preparar entrega”

Esto debe ayudar a que la ficha no solo informe, sino que guíe la operativa.

9. HISTORIAL Y NOTAS
Mover notas e historial al tab Historial.
No quiero notas sueltas compitiendo con cobros o estado.

10. REGLAS DE NEGOCIO
- Esta ficha pertenece a la operación de venta del vehículo.
- Debe estar conectada al vehículo y al cliente.
- No duplicar información del vehículo que ya existe en la ficha del coche.
- No crear una pantalla financiera compleja innecesaria.
- Debe ser operativa para un concesionario real.

MICROCOPY
Usa textos claros y profesionales en castellano.
Lenguaje simple, comercial y operativo.

RESULTADO ESPERADO
Quiero una ficha de venta mucho más clara, con mejor jerarquía y mejor UX:
- resumen principal arriba
- workflow visible
- acciones rápidas claras
- tabs simplificadas
- cobro y fase como prioridades
- historial y documentos ordenados
- sin exceso de cards pequeñas compitiendo entre sí