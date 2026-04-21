# TPV RAPIDO DE PEDIDO - Tickets (continuacion)

> Este archivo es continuacion de `TPV-RAPIDO-PEDIDO.md`. Leer ambos juntos.

---

### TPV-06 -- Frontend: Pagina `TpvRapidoPage` -- Estructura y paso 1 (Telefono + Busqueda)

**Tipo:** Frontend (pagina nueva) | **Prioridad:** Critica | **Esfuerzo:** Alto (6-8h) | **Dep:** TPV-02, TPV-04, TPV-05

#### Contexto
Pieza central del TPV rapido. Pagina completa (no modal) para crear pedidos en segundos. Flujo lineal tipo conversacion/chat que se despliega de arriba a abajo conforme el operador avanza. Empieza siempre por telefono.

#### Estructura general

```
HEADER FIJO: <- Volver a Delivery | TPV Rapido de Pedido | [N pedido auto]
---
AREA DE FLUJO (scroll vertical):
  PASO 1: Cliente (telefono + busqueda + seleccion/creacion)
  PASO 2: Tipo entrega (recogida/domicilio + direccion) -> ver TPV-07
  PASO 3: Productos (catalogo + carrito) -> ver TPV-08
  PASO 4: Pago, observaciones, estado -> ver TPV-09
---
FOOTER FIJO: Resumen | Total | [Guardar] [Cobrar]
```

Cada paso aparece al completar el anterior. Los pasos completados se colapsan mostrando resumen + boton editar. El operador puede volver a cualquier paso para editarlo.

#### Paso 1 -- Busqueda de cliente

**Input de telefono:**
- Autofocus al cargar la pagina
- A la izquierda: `PhonePrefixSelector` con +34 por defecto en modo compact
- Placeholder: "Escribe el telefono del cliente..."
- Tamano grande (16px+) para escritura rapida
- Spinner sutil mientras busca

**Resultados en tiempo real:**
- Tarjetas de clientes coincidentes aparecen debajo con animacion slide-down + fade-in
- Cada tarjeta: avatar iniciales + nombre + telefono + direccion principal + forma de pago habitual + boton "Seleccionar"
- Sin resultados (6+ digitos): "No se encontro ningun cliente" + boton "Crear cliente nuevo con +34 666..."

**Al seleccionar cliente existente:**
- Autocarga: nombre, telefono con prefijo, todas sus direcciones, notas, forma de pago
- Seccion se colapsa: avatar + nombre + telefono + badge "Cliente habitual" + boton editar
- Se despliega automaticamente el Paso 2

**Al pulsar "Crear cliente nuevo":**
- Mini-formulario inline (NO modal):
  - Nombre completo * (autofocus)
  - Telefono * (pre-rellenado con numero escrito + prefijo)
  - Calle / Direccion * (campo libre)
  - Observaciones (opcional)
  - Forma de pago habitual (selector: Efectivo, Tarjeta, Bizum, Otros)
- Boton "Guardar cliente y continuar"
- Llama `createClientRequest`, valida nombre + telefono + calle
- Si duplicado: alerta inline con "Usar existente" o "Crear igualmente"
- Tras crear, se selecciona automaticamente y avanza al Paso 2

**Alertas:**
- Sin telefono al avanzar: shake + borde rojo + "El telefono es obligatorio"
- Duplicado al crear: banner ambar con datos existente
- < 6 digitos: "Introduce al menos 6 digitos"

#### Criterios de aceptacion
- [ ] Pagina carga en `/saas/vertical/delivery/tpv`
- [ ] Autofocus en input telefono al entrar
- [ ] PhonePrefixSelector funciona con +34 default
- [ ] Busqueda con debounce 300ms (minimo 3 digitos)
- [ ] Resultados en tarjetas con animacion suave
- [ ] Al seleccionar: autocarga nombre, telefono, direcciones, notas, forma de pago
- [ ] Formulario "Crear cliente" inline, no modal
- [ ] Validacion con feedback visual
- [ ] Alerta duplicados funcional
- [ ] Paso 1 se colapsa tras completar mostrando resumen
- [ ] Responsive (desktop, tablet, movil) + dark mode

---

### TPV-07 -- Frontend: Paso 2 (Tipo de entrega + Direccion)

**Tipo:** Frontend | **Prioridad:** Critica | **Esfuerzo:** Medio (3-4h) | **Dep:** TPV-06

#### Comportamiento

**Selector tipo (2 tarjetas grandes):**
- Recogida en local / Envio a domicilio
- Ninguno seleccionado por defecto (obliga a elegir)
- "Recogida" -> completa paso, despliega paso 3
- "Domicilio" -> muestra selector de direccion

**Direcciones del cliente:**
- Array `client.addresses` cargado en paso 1
- Cada tarjeta: etiqueta, calle, notas de entrega, ultima vez usada
- `isDefault: true` viene preseleccionada
- Una sola direccion -> seleccion automatica
- Sin direcciones -> formulario de anadir aparece automatico

**Anadir nueva direccion:**
- Formulario inline: etiqueta (Casa/Trabajo/Otro), calle *, ciudad, CP, notas entrega, checkbox "predeterminada"
- Al guardar: persiste en `addresses` del cliente via API + selecciona como direccion del pedido
- Actualiza `lastUsedAt` de la direccion seleccionada

**Alertas:**
- Domicilio sin direccion: banner ambar
- Sin direcciones guardadas: formulario aparece automaticamente

#### Criterios de aceptacion
- [ ] Dos tarjetas seleccionables de tipo entrega
- [ ] Direcciones se cargan desde `client.addresses`
- [ ] `isDefault` preseleccionada
- [ ] Nueva direccion se guarda via API (no solo en memoria)
- [ ] Se actualiza `lastUsedAt`
- [ ] "Recogida" salta selector direcciones
- [ ] Paso se colapsa con resumen tras completar
- [ ] Responsive + dark mode

---

### TPV-08 -- Frontend: Paso 3 (Productos del catalogo)

**Tipo:** Frontend | **Prioridad:** Critica | **Esfuerzo:** Alto (5-6h) | **Dep:** TPV-06

#### Comportamiento

**Busqueda:** Filtrado instantaneo client-side por nombre y descripcion. Boton X para limpiar.

**Categorias:** Chips horizontales con scroll. "Todos" default. Categoria activa destacada.

**Grid productos:** 3 col desktop, 2 col tablet/movil. Tarjeta: imagen (o placeholder), nombre, precio, boton anadir. Si ya esta en carrito: cantidad con -/+. Agotados: tarjeta atenuada + badge "Agotado" + boton deshabilitado.

**Resumen pedido (inline):** Lista items con cantidad, nombre, total linea. Botones -/+ y papelera. Subtotal automatico. Carrito vacio: "Anade productos para continuar".

#### Criterios de aceptacion
- [ ] Catalogo desde `listCatalogItemsRequest` (solo `active`)
- [ ] Busqueda filtra por nombre y descripcion
- [ ] Chips de categorias filtran el grid
- [ ] Anadir, incrementar, decrementar, eliminar productos
- [ ] Resumen con desglose y total por linea
- [ ] Subtotal calculado automaticamente
- [ ] Agotados atenuados con badge
- [ ] Grid responsive + dark mode + animaciones suaves

---

### TPV-09 -- Frontend: Paso 4 (Pago, observaciones, estado y accion final)

**Tipo:** Frontend | **Prioridad:** Critica | **Esfuerzo:** Alto (5-6h) | **Dep:** TPV-06, TPV-08

#### Comportamiento

**Metodos de pago (4 tarjetas):** Efectivo, Tarjeta, Bizum, Otros. Preselecciona `defaultPaymentMethod` del cliente o "Efectivo".

**Calculadora cambio (solo Efectivo):** Input "El cliente paga con: ___EUR". Cambio = pagado - total. Si pagado < total: "Falta X,XX EUR".

**Observaciones:** Textarea 3 lineas. "Notas internas para cocina y reparto". Guarda en `notes`.

**Estado inicial:** "Nuevo" (`pending`) / "En preparacion" (`preparing`). Default "Nuevo". Info: "El gerente puede configurar el default". Oculto para trabajadores (ver TPV-12).

**Footer fijo:** Siempre visible. Resumen: cliente, direccion, tipo, pago, productos, total. 3 botones:
- **Cancelar**: confirma con dialog
- **Guardar (Nuevo)**: crea con `pending`
- **Cobrar y enviar a cocina**: crea con `preparing`

**Al crear (`handleCreate`):**
1. Validar: cliente, direccion (si domicilio), carrito, pago
2. Construir `DeliveryOrder` con datos acumulados
3. `createDeliveryOrderRequest(userId, orderData)`
4. Exito: confirmacion (ver TPV-13). Error: toast + formulario NO se resetea

#### Criterios de aceptacion
- [ ] 4 metodos de pago como tarjetas seleccionables
- [ ] `defaultPaymentMethod` del cliente preseleccionado
- [ ] Calculadora cambio solo con "Efectivo", calculo correcto
- [ ] Observaciones guardan en `notes`
- [ ] Estado inicial "Nuevo" default
- [ ] Footer fijo con resumen completo
- [ ] "Guardar (Nuevo)" -> status `pending`
- [ ] "Cobrar y enviar" -> status `preparing`
- [ ] "Cancelar" pide confirmacion
- [ ] Validacion completa antes de crear
- [ ] Pedido con `clientId` vinculado + `lastUsedAt` actualizado

---

### TPV-10 -- Frontend: Ruta, sidebar y lazy loading

**Tipo:** Frontend | **Prioridad:** Critica | **Esfuerzo:** Bajo (30 min) | **Dep:** TPV-06

#### Que hacer

**`routes.tsx`:**
```typescript
const TpvRapidoPage = lazy(() => import('./pages/saas/TpvRapidoPage'));
// En children de 'saas':
{ path: 'vertical/delivery/tpv', Component: TpvRapidoPage },
```

**`Sidebar.tsx`:**
```typescript
// Nuevo item en seccion Delivery:
{ id: 'tpv-rapido', navKey: 'tpvRapido', icon: <Zap className="w-5 h-5" />, path: '/saas/vertical/delivery/tpv' },

// Anadir al grupo delivery:
itemIds: ['tpv', 'tpv-locales', 'delivery', 'tpv-rapido', 'delivery-catalog', 'web-orders', 'web-config']
```

#### Criterios de aceptacion
- [ ] Ruta `/saas/vertical/delivery/tpv` carga la pagina
- [ ] Item "TPV Rapido" en sidebar con icono Zap
- [ ] Lazy loading activo
- [ ] Permisos sidebar respetados

---

### TPV-11 -- Backend: Permiso `delivery` en TEAM_PERMISSION_KEYS

**Tipo:** Backend | **Prioridad:** Alta | **Esfuerzo:** Bajo (30 min) | **Dep:** Ninguna

#### Que hacer

**`couchdb.js`:** Anadir `'delivery'` a `TEAM_PERMISSION_KEYS`

**`Sidebar.tsx`:** Items del grupo `delivery` (incl. `tpv-rapido`) usan permiso `delivery`.

#### Criterios de aceptacion
- [ ] `TEAM_PERMISSION_KEYS` incluye `'delivery'`
- [ ] Admin/Gerente obtienen `delivery: { view: true, edit: true }` automaticamente
- [ ] Sidebar oculta/muestra items delivery segun permiso
- [ ] Settings/Roles muestra `delivery` configurable
- [ ] Sin regresion en permisos existentes

---

### TPV-12 -- Frontend: Permisos gerente vs trabajador

**Tipo:** Frontend | **Prioridad:** Alta | **Esfuerzo:** Medio (2h) | **Dep:** TPV-06, TPV-11

#### Matriz de permisos

| Accion | Gerente (edit:true) | Trabajador (view:true, edit:false) | Sin permiso |
|--------|---------------------|-------------------------------------|-------------|
| Acceder a pagina | Si | Si | Redirect dashboard |
| Crear pedidos | Si | Si | -- |
| Cobrar pedidos | Si | Si | -- |
| Cambiar estado inicial | Si | No (usa default) | -- |
| Editar pedidos existentes | Si | No | -- |
| Config TPV | Si | No | -- |

#### Criterios de aceptacion
- [ ] Sin `delivery.view` -> redirect a dashboard
- [ ] `view:true, edit:false` -> crear y cobrar, sin config
- [ ] `edit:true` -> todas las opciones
- [ ] Selector estado oculto para trabajadores
- [ ] Sin flicker al redirigir

---

### TPV-13 -- Frontend: Flujo post-creacion (confirmacion, reset, conexion cocina)

**Tipo:** Frontend | **Prioridad:** Alta | **Esfuerzo:** Medio (2-3h) | **Dep:** TPV-09

#### Comportamiento

**Tras creacion exitosa:** Pantalla confirmacion con check animado. Resumen: numero, cliente, productos, total, direccion, pago, estado. Dos botones: "Ver pedido" (navega a `/saas/delivery`) y "Crear otro pedido" (reset + autofocus telefono). Info: "Se envio a cocina" (si `preparing`) o "Guardado como nuevo" (si `pending`).

**Conexion cocina:** Pedido via API con status correcto. `WorkerTpvDelivery.tsx` y `Delivery.tsx` lo ven en polling 30s (ya existente).

#### Criterios de aceptacion
- [ ] Confirmacion con animacion tras exito
- [ ] Resumen completo del pedido
- [ ] "Crear otro" resetea flujo + autofocus telefono
- [ ] "Ver pedido" navega a Delivery con pedido seleccionado
- [ ] Pedido visible en cocina/operativa en < 30s
- [ ] Error: toast + formulario NO se resetea
- [ ] Numero pedido auto-generado

---

### TPV-14 -- Backend: Vincular `clientId` en pedido y guardar historial

**Tipo:** Backend | **Prioridad:** Alta | **Esfuerzo:** Medio (1.5h) | **Dep:** TPV-01

#### Que hacer

**`buildDeliveryOrderDocument`:** Anadir `clientId`, `paymentMethod`, `orderType`, `deliveryAddressId`.

**Controlador creacion:** Si `clientId` presente, actualizar `lastUsedAt` de direccion usada en el cliente.

**`sanitizeDeliveryOrder`:** Incluir nuevos campos.

#### Criterios de aceptacion
- [ ] `clientId` persiste y se devuelve
- [ ] `paymentMethod` persiste (efectivo/tarjeta/bizum/otros)
- [ ] `orderType` persiste (domicilio/recogida)
- [ ] `deliveryAddressId` persiste
- [ ] `lastUsedAt` actualizado al crear pedido con `clientId`
- [ ] Sin regresion en creacion desde `Delivery.tsx`

---

### TPV-15 -- Frontend: Alertas contextuales integradas

**Tipo:** Frontend | **Prioridad:** Media | **Esfuerzo:** Medio (2h) | **Dep:** TPV-06 a TPV-09

#### Catalogo de alertas

| ID | Alerta | Paso | Estilo |
|----|--------|------|--------|
| A1 | Telefono vacio | 1 | Borde rojo + shake + mensaje |
| A2 | Cliente duplicado | 1 | Banner ambar con datos + [Usar existente] [Crear igualmente] |
| A3 | Nombre vacio (crear cliente) | 1 | Borde rojo + mensaje |
| A4 | Calle vacia (crear cliente) | 1 | Borde rojo + mensaje |
| A5 | Domicilio sin direccion | 2 | Banner ambar |
| A6 | Producto agotado | 3 | Badge "Agotado" + boton disabled |
| A7 | Pedido sin productos | 3 | Shake resumen + mensaje |
| A8 | Sin forma de pago | 4 | Borde rojo seccion pago |
| A9 | Cambio insuficiente | 4 | Texto rojo "Falta X,XX EUR" |
| A10 | Error de red | 4 | Toast rojo con detalle |

Componente `TpvAlert` reutilizable: `type`, `message`, `action?`, `secondaryAction?`, `dismissible?`

#### Criterios de aceptacion
- [ ] 10 alertas implementadas
- [ ] Error: rojo. Warning: ambar
- [ ] Acciones cuando corresponde
- [ ] Shake suave, inline (no modal)
- [ ] Dark mode

---

### TPV-16 -- Frontend: Diseno visual, animaciones y UX polish

**Tipo:** Frontend (UX/UI) | **Prioridad:** Media | **Esfuerzo:** Medio (3h) | **Dep:** TPV-06 a TPV-09

#### Elementos

**Flujo conversacional:** Animacion slide-down + fade-in (200ms ease-out) por paso. Pasos completados colapsan suavemente.

**Pasos colapsados:**
- Paso 1: Avatar + nombre + telefono + badge "Habitual"/"Nuevo" + editar
- Paso 2: Icono tipo + "A domicilio . C/ Gran Via 25" + editar
- Paso 3: "3 productos . 19,50 EUR" + editar

**Footer:** Backdrop blur, total grande, botones diferenciados (cancelar gris outline, guardar gris solid, cobrar verde solid). Disabled si faltan pasos.

**Responsive:** Desktop >=1024px: max-w 720px centrado. Tablet 768-1023: full + padding 24px. Movil <768: full + padding 16px + grid 2 col.

**Dark mode:** Patron `bg-white dark:bg-gray-800`, `border-gray-200 dark:border-gray-700`.

**Micro-interacciones:** Hover tarjetas scale(1.02). Click + salta numero. Total tipo odometro. Telefono: busqueda -> spinner. Check final: animacion stroke-dasharray.

#### Criterios de aceptacion
- [ ] Animaciones suaves (200ms ease-out)
- [ ] Pasos colapsan con resumen + editar
- [ ] Footer sticky con backdrop blur
- [ ] Responsive desktop/tablet/movil
- [ ] Dark mode completo
- [ ] Micro-interacciones sin afectar rendimiento
- [ ] Coherente con sistema de diseno (Tailwind, Radix, Lucide)

---

## Orden de implementacion

**Fase 1 -- Cimientos:** TPV-01 (backend modelo) -> TPV-02 (tipos TS) -> TPV-03 (API busqueda) + TPV-05 (prefijo) + TPV-11 (permiso)

**Fase 2 -- Core TPV:** TPV-04 (hook busqueda) -> TPV-06 (pagina + paso 1) + TPV-10 (ruta + sidebar)

**Fase 3 -- Flujo completo:** TPV-07 (tipo entrega) -> TPV-08 (productos) -> TPV-09 (pago + footer) + TPV-14 (clientId backend)

**Fase 4 -- Permisos y post-creacion:** TPV-12 (permisos UI) + TPV-13 (confirmacion + reset)

**Fase 5 -- Pulido:** TPV-15 (alertas) + TPV-16 (UX polish)

---

## Archivos afectados

| Archivo | Accion | Tickets |
|---------|--------|---------|
| `services/couchdb.js` | Modificar | TPV-01, TPV-11, TPV-14 |
| `controllers/clientsController.js` | Modificar | TPV-03 |
| `routers/clientsRouter.js` | Modificar | TPV-03 |
| `controllers/deliveryController.js` | Modificar | TPV-14 |
| `src/app/context/AppContext.tsx` | Modificar | TPV-02 |
| `src/app/lib/deliveryApi.ts` | Modificar | TPV-02 |
| `src/app/lib/crmApi.ts` | Modificar | TPV-03 |
| `src/app/hooks/useClientPhoneSearch.ts` | **Crear** | TPV-04 |
| `src/app/components/saas/PhonePrefixSelector.tsx` | **Crear** | TPV-05 |
| `src/app/pages/saas/TpvRapidoPage.tsx` | **Crear** | TPV-06 a 09, 12, 13, 15, 16 |
| `src/app/routes.tsx` | Modificar | TPV-10 |
| `src/app/components/saas/Sidebar.tsx` | Modificar | TPV-10, TPV-11 |

---

## Conexiones con otros modulos

| Modulo | Conexion |
|--------|----------|
| **CRM (Clientes)** | Busqueda telefono, carga datos, creacion rapida, `clientId` en pedido |
| **Pedidos (Delivery)** | Creacion pedido, historial, estados |
| **Caja** | Metodo pago; movimiento caja (futuro) |
| **Cocina** | Status `preparing` aparece en tab cocina (polling 30s) |
| **Sala/Reparto** | Status `delivery` aparece en tab reparto (polling 30s) |
| **Finanzas** | Cobro podria generar ingreso automatico (futuro, segun FINANZAS.md) |

---

## Nota sobre NUEVO_CLIENTE_MODAL.md

El TPV **no depende** del NuevoClienteModal universal. Usa flujo inline propio (paso 1) porque un modal interrumpiria el flujo rapido. Solo necesita campos minimos (nombre, telefono, calle).

Comparten: campos `defaultPaymentMethod`/`addresses`/`phonePrefix` (TPV-01), tipos TS (TPV-02), endpoint busqueda (TPV-03). Implementar estos tickets de forma que sirvan para ambos.
