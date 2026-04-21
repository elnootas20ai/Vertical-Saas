Quiero que modifiques el modal actual de “Nueva oportunidad de compra” y lo conviertas en un flujo de 3 pasos, manteniendo el mismo diseño, componentes, estilos, espaciados, lenguaje visual y sistema de interfaz que ya existe actualmente en el SaaS.

IMPORTANTE
- No cambies la estética general.
- No rediseñes el producto.
- No cambies colores, estilo de inputs, botones, tipografía ni estructura visual base.
- Usa el diseño actual del SaaS como referencia directa.
- Solo reorganiza la experiencia del modal para mejorar la UX.

OBJETIVO
Quiero que el alta de una nueva oportunidad de compra deje de ser un formulario largo y pase a ser un flujo más claro, rápido e intuitivo en 3 pasos.

REGLA UX
- Debe sentirse más ligero y ordenado.
- Debe reducir la sensación de formulario pesado.
- Debe funcionar bien en desktop y móvil.
- Debe permitir entender el alta rápidamente.
- Mantén una experiencia profesional, clara y operativa.

NUEVA ESTRUCTURA DEL MODAL
Convierte el modal en un wizard / flujo de 3 pasos con indicador visual de progreso.

Título general:
Nueva oportunidad de compra

Subtítulo:
Registro inicial de vehículo, contacto y valoración económica

Mostrar arriba un stepper o indicador de pasos, manteniendo el diseño actual del SaaS.

PASOS DEL FLUJO

PASO 1 — Origen y contacto
Objetivo: identificar de dónde viene la oportunidad y quién vende el vehículo.

Campos:
- Origen
  Opciones sugeridas:
  - Particular
  - Permuta
  - Concesionario
  - Proveedor
  - Subasta
  - Otro
- Nombre / empresa
- Teléfono
- Email
- Responsable

Notas:
- Este paso debe ir primero.
- El usuario debe entender rápidamente de dónde viene la oportunidad.
- Mantener estructura simple y limpia.

PASO 2 — Vehículo
Objetivo: registrar los datos principales del coche.

Campos:
- Marca
- Modelo
- Versión
- Bastidor (VIN)
- Matrícula
- Año
- Kilómetros
- Combustible
- Cambio

Notas:
- Bastidor debe seguir siendo importante dentro del sistema.
- Matrícula puede ser opcional si no existe todavía.
- Mantener una distribución clara y escaneable.

PASO 3 — Precio y operativa
Objetivo: valorar la oportunidad y dejarla lista en el sistema.

Campos:
- Precio solicitado
- Precio objetivo compra
- Precio venta estimado
- Margen estimado automático
- Ubicación inicial
- Estado inicial

Opciones sugeridas:
Ubicación inicial:
- Exposición
- Campa
- Taller
- Externo

Estado inicial:
- Nueva oportunidad

Campo adicional:
- Notas internas

Notas:
- El margen estimado debe calcularse automáticamente a partir de los precios introducidos.
- Mostrar este dato de forma visible pero integrada con el diseño actual.

RESUMEN FINAL
Al final del paso 3, antes de guardar, mostrar un pequeño resumen visual con:
- Vehículo
- Vendedor / empresa
- Origen
- Precio solicitado
- Precio objetivo compra
- Precio venta estimado
- Margen estimado

No quiero una pantalla nueva separada; puede estar integrado al final del paso 3.

BOTONES DE NAVEGACIÓN
Usar botones consistentes con el diseño actual:

Paso 1:
- Cancelar
- Siguiente

Paso 2:
- Atrás
- Siguiente

Paso 3:
- Atrás
- Crear oportunidad

REGLAS IMPORTANTES DE NEGOCIO
- Este modal pertenece a V1.
- No añadas todavía funcionalidades avanzadas de Normal o Pro.
- No metas OCR, scoring, comparativas automáticas ni tareas avanzadas.
- No dupliques información.
- La oportunidad debe quedar preparada para conectar con vehículo, cliente/contacto, expediente, documentos y finanzas.

MICROCOPY
Usa textos claros y profesionales en castellano.

Ejemplos:
- Paso 1: Datos del origen y de la persona o empresa vendedora
- Paso 2: Información principal del vehículo
- Paso 3: Valoración económica y configuración inicial

RESULTADO ESPERADO
Quiero un modal más claro, moderno y usable, pero construido sobre el diseño actual del SaaS, sin rediseñar la interfaz.
Solo quiero mejorar la experiencia pasando del formulario largo a un flujo de 3 pasos.