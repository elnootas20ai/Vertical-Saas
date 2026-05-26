# Checklist de activación — Delivery

**Objetivo:** Que un usuario nuevo complete **tienda/PDV → marca → catálogo → empresa → operar** sin perderse en Ajustes.

**UI:** Barra lateral «Alta delivery» (`ActivationChecklist`) cuando `businessType === 'delivery'`.

**Regla de oro:** Sin **tienda + PDV activos** no se puede configurar marca ni catálogo.

- **Sidebar:** Catálogo, proveedores, TPV/Caja, Delivery Ops, etc. aparecen **deshabilitados** (no clicables) hasta tener PDV; el catálogo además exige **marca** lista.
- **Ajustes → Marca:** pestaña bloqueada / redirige a **Tienda** sin PDV.
- **Pantallas:** aviso si entras por URL directa.
- **Checklist:** pasos con candado (mismo orden).

## Pasos (orden obligatorio)

| # | Paso | Ruta | Subpasos | Hecho cuando |
|---|------|------|----------|--------------|
| 1 | **Tienda y PDV** | `/saas/settings/tienda` | Primera tienda · PDV activo | ≥1 centro retail activo + ≥1 PDV |
| 2 | **Marca** | `/saas/settings/marca` | Marca principal OK | `isBrandSetupComplete` (bloqueado hasta paso 1) |
| 3 | **Catálogo** | `/saas/catalog` | Producto · Precio | ≥1 artículo con precio > 0 (bloqueado hasta PDV + marca) |
| 4 | **Empresa** | `/saas/settings/empresa` | Nombre · CIF · Dirección · Teléfono | Revisión: suele venir del registro; el paso se completa solo si faltan datos (bloqueado hasta PDV) |
| 5 | **Listo para vender** | `/saas/settings/tienda?action=horarios` | Horario · Listo TPV | ≥1 tienda retail activa con `openingHours` válido + prerrequisitos |

**Horarios:** se configuran en el **wizard de crear/editar tienda** (paso «Horarios»), guardados en el documento `WorkCenter` (`openingHours`). Sin tiendas no hay bloque suelto de horarios.

## Código

- Pasos y candados: `deliveryActivationChecklist.ts`, `deliveryActivationGates.ts`
- Bloqueo UI: `DeliveryActivationGatePanel.tsx`, `useDeliveryStorePdvGate.ts`, `CompanyMarcaSettings`, `DeliveryCatalog`
- Datos en vivo: `ActivationChecklistContext.tsx`
- Horarios por tienda: `SalesPointsTab.tsx` (`WorkCenterModal`) + `workCentersApi.ts` (`openingHours`)

## Criterio de cierre

Checklist oculto **solo** al **100%**. Sin «Saltar por ahora» ni cierre manual en delivery.

## Mismo PC, otra cuenta

Tour y checklist por `user_id` + `business_id` (`onboardingLocalKeys.ts`).

**Tour (popup):** una vez por empresa; al saltar o terminar no vuelve al recargar. Reinicio: Ayuda → Tour interactivo.

**Sidebar «Alta delivery»:** obligatorio hasta el **100 %** (sin «Saltar por ahora»).
