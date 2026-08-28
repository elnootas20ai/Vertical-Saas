# Compras — Albarán vs Factura vs Correo facturas

**Estado:** referencia producto (implementado en código).  
**Dónde vive:** Catálogo → **Compras** (`/saas/delivery-catalog` · pestañas) + **Correo facturas** (`/saas/correo-facturas`).

---

## 1. Resumen en una frase

| Documento | Para qué | Cuándo |
|-----------|----------|--------|
| **Pedido** | Lo que pides al proveedor | Antes de que llegue la mercancía |
| **Albarán** | Lo que **recibes** (recepción + stock) | Cuando llega el camión / reparto |
| **Factura** | Lo que **pagas** (contabilidad) | Cuando el proveedor factura |

**Mismo backend:** tipo CouchDB `purchase_invoice`. Se separan por `documentKind` / OCR (`invoiceIsAlbaran`).

---

## 2. Pestañas en Compras

| Pestaña UI | Rol |
|------------|-----|
| **Proveedores** | Catálogo de proveedores |
| **Pedidos** | Crear / enviar pedido (email, WhatsApp…) |
| **Albarán** | Pedidos en espera + OCR albarán + comprobar + **carga almacén** |
| **Facturas** | Facturas proveedor (manuales o entradas por correo) |
| **Correo facturas** | Config IMAP por tienda → PDFs entran solos a **Facturas** |

---

## 3. Flujo Albarán (recepción)

1. Pedido en `sent` / `pending` / `partial` → lista **«En espera de albarán»** (`AlbaranEsperaList`).
2. Escaneas foto/PDF del albarán (OCR).
3. **Comprobar** (`AlbaranCorroborateModal`): cruza **pedido ↔ albarán** (cantidad, precio).
4. Confirmas → pedido `received` / `partial` → **stock sube** (`ocrStockReceivedAt`).
5. Doc guardado con `documentKind: 'albaran'`.

**Código:** `albaranReceptionCompare.ts`, `AlbaranCorroborateModal.tsx`, `albaranOcrDraft.ts`, tab `albaranes` en `DeliveryCatalog.tsx`.

---

## 4. Flujo Factura (administración)

1. Llega por **IMAP** (`SupplierInvoiceEmailPage`, `supplierInvoiceProcessor`) o alta manual.
2. OCR PDF → revisión en pestaña **Facturas**.
3. No sustituye la recepción física: es el documento de **pago / contabilidad**.
4. Desde un pedido ya recibido puedes ir a **registrar la factura** (`PurchaseOrdersPage`).

**Código:** `supplierInvoiceApi.ts`, `supplierInvoicePdfParse.js`, tab `invoices` en `DeliveryCatalog.tsx`.

---

## 5. Cómo se distinguen en código

```ts
// src/app/lib/albaranReceptionCompare.ts
invoiceIsAlbaran(inv) → documentKind / ocrData incluye 'albaran'
```

- **Albarán** → pestaña Albarán, flujo recepción + stock.
- **No albarán** → pestaña Facturas.

---

## 6. Variación de precio (vs Yurest)

Al confirmar albarán/factura: **detecta** si el precio unitario difiere del esperado (`supplierPriceVariance`, alertas).

**Pendiente producto (paridad Yurest «automático»):** al actualizar coste de ingrediente → **recalcular escandallos** afectados en cascada + alerta margen por plato. Ver §1c en `docs/VERTIAL-PRECIOS-PACKING.md`.

---

## 7. Correo facturas — vs mercado

| Producto | ¿Entrada automática por email? | Cómo |
|----------|-------------------------------|------|
| **Vertial** | ✓ | **IMAP** al buzón real del local (`supplierInvoiceConfig` por PDV) → poll → OCR → Facturas |
| **Yurest** | ◐ | **OCR con foto** desde app móvil/tablet; no venden IMAP al buzón del cliente en web pública |
| **Holded** | ✓ | Dirección `@holdedbox.com` + reenvío; bandeja Escáner (no es tu IMAP, es buzón Holded) |
| **Revo XEF** | ✗ | TPV; no gestiona facturas proveedor |
| **Terceros** (Tailride, Gennai, AutoApunte…) | ✓ | Conectan Gmail/Outlook/IMAP y empujan a Holded u otro ERP |

**Argumento Vertial:** buzón **propio del restaurante** (IMAP), integrado con **pedido + albarán + stock + escandallo** en la misma app — no hace falta Holded aparte para esa pieza en Pro.

---

## 8. Plan comercial

- **Mediano:** sin Compras (solo Inventario básico).
- **Pro:** Compras completo (pedidos, albarán, facturas, correo IMAP, OCR). OCR facturas **no es SVA** (§6 packing).

---

## Changelog

| Fecha | Nota |
|-------|------|
| 2026-08-26 | Doc creado — aclaración albarán vs factura vs correo + comparativa mercado email |
