# Carnicería — cierre madurez (vs delivery)

Delivery **no se tocó**. Referencia de listón, no plantilla de código.

## Hecho

| Capacidad | Estado |
|-----------|--------|
| Módulo formal + isolation rule | `verticals/butcher`, registry |
| Alta guiada | checklist + tour |
| PDV/terminal multi-mostrador | selector en TPV + `butcherTpvScope` |
| Venta → finance + Verifactu | `butcherSaleFinance` + `tryAutoIssueForButcherSale` |
| Cobro canónico | primero `butcher_sale` (FEFO); ticket ops = espejo |
| Offline TPV | cola `butcher_sale` + flush |
| Anulación TPV | void + restore stock + asiento return |
| Caja turno | `TpvRegisterGate` + export CSV cierre Z |
| Etiqueta ESC/POS | `encodeButcherLabelEscpos` |
| Push CEO | caducado / stock crítico / merma / caja |
| Tests | math, module, tpv mapping, push whitelist |

## Canónico datos

- Venta: `bt_catalog` + lotes `bt_lote` FEFO
- `butcher_batch` = espejo legacy
- Informe tiendas usa `storeId` / `pointOfSaleId` + nombre PDV

## Cómo probar

1. TPV → abrir caja → cobrar kg en báscula → Hub Finanzas + método del día
2. Sin red → cobrar → banner sync → al volver online se crea la venta
3. Tras cobro → **Anular venta** → stock vuelve
4. Selector de mostrador (si hay 2+ PDV) → venta lleva `pointOfSaleId`
5. Botón **Z** → CSV de sesión
6. Verifactu activo en empresa → venta con `verifactuRecordId`
7. `npx vitest run tests/butcherModule.test.js tests/butcherMath.test.js tests/butcherTpvSale.test.js tests/pushAlertPolicy.test.js`
