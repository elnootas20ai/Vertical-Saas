# Handoff para el asistente (Vertial / udar)

**Para quién:** futuras sesiones de chat con el mismo proyecto.  
**Para quién no:** no es documentación de producto para el cliente final.

**Visión general (SaaS, verticales, precios, PDV, módulos, disco/memoria):** `docs/VERTIAL-SAAS-VISION.md` — leer antes que este archivo si hace falta contexto de negocio o restricciones de servidor.

## Cómo trabaja este usuario

- Prefiere **hacer las cosas contigo** (tú ejecutas, propones, aplicas); no solo recetas sueltas.
- Más que “solo código”: **sigue su criterio de producto** cuando lo diga (ej. TPV por tienda, gerente multi-sede, trabajador acotado).
- Si pide **dejar rastro** para después: este archivo + `shared/naming/README.md` son la referencia rápida.

## Qué tocamos ya (resumen técnico)

| Tema | Dónde mirar |
| --- | --- |
| Códigos PDV tipo `BAD-01` desde el nombre | `shared/naming/deliveryPointOfSaleCode.js` (+ `.d.ts`) |
| Reexport TS / merge centros ↔ delivery | `src/app/lib/deliveryApi.ts` (import + `export` de naming) |
| Crear PDV sin `code` en API | `controllers/deliveryController.js` → `suggestNextPdvCode` |
| PDV por defecto en caja | `src/app/components/saas/TpvRegisterGate.tsx` (`Tienda principal` + código sugerido) |
| Ops Delivery: un solo PDV seleccionado, CTA alineado con TPV/PRO | `src/app/pages/saas/DeliveryOpsCenter.tsx` (`FiltersBar`) |
| Pedidos delivery: auto-filtro un PDV | `src/app/pages/saas/DeliveryOrders.tsx` |
| Wizard pedido: PDV único + etiqueta pantalla | `src/app/components/delivery/CreateOrderWizard.tsx` |
| Etiqueta UI `código · nombre` | `pointOfSaleDisplayLabel` en `deliveryApi.ts` |
| Workers: lista PDV filtrada por empleo | `listPointsOfSale` en `deliveryController.js` |

## Regla de oro para no duplicar lógica

- **Naming / slugs reutilizables:** solo en `shared/naming/*.js`. El front **no** copia la lógica: importa desde ahí (vía `deliveryApi` si conviene).
- Nuevo módulo “parecido”: copiar `deliveryPointOfSaleCode.js` → renombrar → enganchar (ver `shared/naming/README.md`).

## Dudas típicas

- **“Solo cambiar nombres”** en un módulo nuevo: a menudo basta copiar el `.js` de naming, ajustar stop-words y el fallback (`PDV`).
- **Marca vs nombre de tienda en PDV:** el nombre por defecto dejó de ser `companyName`; códigos salen del nombre del centro / “Tienda principal”.

Última intención explícita del usuario: *preparar todo para que en el futuro cambiar sea fácil o copiable* → por eso existe `shared/` + este handoff.
