# Carnicería — estado operativo (ago 2026)

Cierre de los 10 huecos del stack carnicería (`butcherShop`). Delivery / restaurante / compraventa no se tocan.

## Qué quedó cableado

1. **Puente catálogo** — `bt_catalog` ↔ `catalog_item` (`services/butcherCatalogBridge.js`) al crear/editar en butcher-ops y en catálogo core si `vertical=butcherShop`.
2. **Reposición auto** — stock ≤ mínimo → borrador de compra (`services/butcherAutoReorder.js`, desde alert engine).
3. **Hub caducidad** — panel en Centro operativo con Rebajar 20% / Elaborados / Merma.
4. **Onboarding** — tour propio `butcherShop` en `getOnboardingTourSteps` (sin checklist delivery).
5. **Dashboard home** — `VERTICAL_DASHBOARD_MAP.butcherShop` → `ButcherDashboard`.
6. **Margen objetivo** — `butcherTargetMarginPct` editable en Productos (icono € sugiere precio).
7. **Básculas** — `/saas/vertical/carniceria/basculas` + menú lateral.
8. **Tests** — `tests/butcherMath.test.js` (precio, despiece, lote, caducidad).
9. **Mis repartos (worker)** — `/saas/worker/butcher-reparto` si `ownDeliveryEnabled`.
10. **Etiqueta** — `printTicketDocument` + fallback HTML browser (`butcherLabelPrint.ts`).

## Cómo probar rápido (UI)

1. Productos → alta corte €/kg + stock mínimo → guarda margen % → sugiere precio.
2. Compras → confirma entrada → lote/stock; baja stock a mano o vende hasta mínimo → aparece draft en Compras.
3. TPV → pesa / kg → cobra → stock baja; etiqueta en última línea.
4. Hub → si hay lote ≤3 días: Rebajar / Elaborados / Merma.
5. Básculas → registra dispositivo; Repartos (flag) → worker ve Mis repartos.
6. Home → dashboard carnicería; tour onboarding al abrir cuenta nueva.

## Docs tickets relacionados

- `docs/tickets/COMPRAS-CARNICERIA-TICKETS.md`
- `docs/tickets/CARNICERIA-ALERTAS-BACKEND.md`
- `docs/tickets/MERMA-PERDIDAS-CARNICERIA.md`
- `docs/tickets/BASCULA-INTEGRACION-TICKETS.md` (si existe)
