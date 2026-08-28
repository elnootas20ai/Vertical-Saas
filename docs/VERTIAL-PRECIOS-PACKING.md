# Vertial — Precios y packing (documento vivo)

> **Última sesión:** 2026-08-26  
> **Chats de referencia:** [ddf568c7](ddf568c7-f283-4186-9de9-43418654eac7) (SVAs y embudo, 3 ago) · [836107d7](836107d7-191b-4d38-a88e-30ca00ff8aeb) (comparativa mercado, 25 ago)  
> **Backup plan Cursor:** `.cursor/plans/precios_smb_enterprise_5e4ae4a2.plan.md`

Este archivo es la **biblia comercial humana** para seguir apuntando precios, SVAs y decisiones.  
**No sustituye** aún `planCatalog.ts` ni MONEI — al cerrar una decisión aquí, pedir alinear código por separado.

**Ancla:** PDV ≡ tienda. **Todos los planes incluyen 1 tienda** en el suelo. Pro no regala una 2ª: la **2ª tienda en adelante** = **149 €/mes** c/u (solo **Pro+**, como addon).

---

## Reglas de uso

1. **Nueva fila SVA** → §2 + línea en §9 Changelog  
2. **Precio cerrado** → cambiar estado a «Cerrado» en §2  
3. **No tocar código** hasta marcar «Cerrado» y pedir alinear facturación  
4. PDF comparativa mercado: `node scripts/generate-vertial-apps-equivalencias-pdf.mjs` → `docs/Vertial-Aplicaciones-Equivalencias.pdf`  
5. Planes en producto (código): `src/app/lib/planCatalog.ts` · addons: `src/app/lib/planAddonCatalog.ts`  
6. **Albarán vs Factura vs Correo:** `docs/tickets/COMPRAS-ALBARAN-VS-FACTURA.md`  
7. **Texto anexo contrato / hojas de cliente:** [`docs/VERTIAL-HOJAS-CLIENTE-CONTRATO.md`](VERTIAL-HOJAS-CLIENTE-CONTRATO.md)

---

## 1. Planes base (embudo)

| Plan | €/mes (suelo) | Anual eq. (−20 %) | Incluye (suelo) | Qué puede sumar | Techo self-serve | Al superar → |
|------|---------------:|------------------:|-----------------|-----------------|------------------|--------------|
| **Gancho** (Básico) | **49** | 39 | TPV + Verifactu · catálogo mín. · **1 PDV** «vacío» · **2 workers** · owner | Packs workers | ~49 + workers · **sin** SVAs · **sin** tienda extra | Subir a Mediano |
| **Mediano** | **179** * | **143** | **1 tienda** · paridad **TPV + gestión** (1 app) · ver §1 suelo · **4 workers** · **Dashboard 1** | SVAs · packs workers | **~366 €** con 4 SVAs · **1 tienda max** | Pro o «Hablar con Vertial» |
| **Pro** | **350** * | 279 | **1 tienda** · **todo Vertial** (SVAs dentro) · **12 workers** · OFFLINE · chat/calendario · alertas/API/portfolio según gates | PDV/marca/empresa extra · packs workers | Workers **25** · PDVs ~**6–8** (propuesto) | **Enterprise** |
| **Enterprise** | Cotizado | — | A medida (multi-empresa, muchos PDV, +25 workers, SLA…) | — | Sin techo público | Contrato |

\* Pro en código: **349 €/mes** (narrativa **350 €**). Mediano en código aún **149 €** — packing cerrado a **179 €** (pendiente alinear MONEI).

**Embudo:** **49 → 179 → 350** (Pro **350 €** cerrado de momento).

---

## 1f — Los tres planes (ficha cerrada 2026-08-26)

Código producto: `basic` · `normal` · `pro`. UI: **Básico** · **Mediano (Normal)** · **Pro**.

| | **Básico** | **Mediano (Normal)** | **Pro** |
|---|:---:|:---:|:---:|
| **€/mes** | **49** | **179** | **350** (349 código) |
| **Anual eq.** | 39 | 143 | 279 |
| **Tiendas incluidas** | 1 | 1 | 1 |
| **Workers** | 2 | 4 | 12 |
| **SVAs** | ✗ no puede | ✗ compra aparte | ✓ todos incluidos |
| **2ª tienda+** | ✗ | ✗ | ✓ addon 149 € |

---

### Básico — 49 €/mes

**Para quién:** probar / arrancar con **solo caja** (gancho).

**Incluye:**
- 1 tienda · **2 workers** (owner no cuenta)
- **TPV + Verifactu**
- **Catálogo mínimo** (carta / productos básicos)
- **Operativa mínima** (cobrar, pedidos del vertical, caja)
- **Dashboard 1** (ventas del día · por marca)

**No incluye:**
- Escandallo · Compras · Inventario serio
- OPS · Alertas · Chat · Calendario
- **SVAs** · tienda extra

**Pitch:** *«Empieza con TPV legal y catálogo. Cuando crezcas → Mediano.»*

---

### Mediano (Normal) — 179 €/mes

**Para quién:** **1 local completo** — sustituye **Revo + Yurest Lite** (~150 €) en **una app**.

**Incluye todo Básico, más:**
- **4 workers**
- **Inventario / stock**
- **Escandallo** (recetas, food cost, margen)
- **Compras:** proveedores, pedidos, **albarán OCR**, **factura OCR** (foto/subida)
- Alerta variación precio proveedor · stock ligado a ventas/recetas
- Clientes básicos

**No incluye:**
- **OPS** (centro operativo tiempo real)
- **Correo facturas IMAP** (automático al buzón)
- Dashboard completo · Alertas negativas · Multi-sede · OFFLINE
- Chat, calendario, RRHH, finanzas, CRM+, canales, web pedidos, QR mesas → **SVA** o subir a **Pro**

**Pitch:** *«Revo + Yurest en una app. 179 € vs ~150 € en dos proveedores.»*

---

### Pro — 350 €/mes

**Para quién:** **mandar el negocio** — dirección, escala, todo incluido.

**Incluye todo Mediano, más:**
- **12 workers**
- **OPS** / visión operativa en tiempo real
- **Correo facturas IMAP** (entran solas al buzón)
- **Dashboard completo** (gráficas, finanzas, KPIs, márgenes)
- **Alertas negativas** (caja, dinero, operación)
- **OFFLINE** TPV · **API** · webhooks · conciliación bancaria
- **Función multi-sede** (2ª tienda = addon **149 €** · empresa extra **89 €** · marca **19 €**)
- **Todos los SVAs incluidos:** RRHH 50 · Finanzas 49 · CRM+ 39 · Canales 49 · Web pedidos 39 · QR mesas 49 · Chat 50 · Calendario 19

**Pitch:** *«Operas + ves + controlas + escalas. Un precio, sin sumar módulos.»*

---

### Comparativa rápida (qué desbloquea cada salto)

| Capacidad | Básico | Mediano | Pro |
|-----------|:------:|:-------:|:---:|
| TPV + Verifactu | ✓ | ✓ | ✓ |
| Inventario · Escandallo · Compras OCR | ✗ | ✓ | ✓ |
| Correo IMAP facturas | ✗ | ✗ | ✓ |
| OPS tiempo real | ✗ | ✗ | ✓ |
| Dashboard completo · Alertas | ✗ | ✗ | ✓ |
| SVAs (RRHH, web, QR, chat…) | ✗ | à la carte | ✓ incluidos |
| Multi-tienda (función) | ✗ | ✗ | ✓ |

---

**Mediano vs mercado 2 apps:** TPV (~50–70 €) + Yurest Lite (~**79 €**) ≈ **130–150 €/mes** en dos apps. **179 €** = **+~29 €** por **una sola app**, sync nativo y **4 workers** incluidos (argumento comodidad, no “el más barato”).

### Mediano · Pro · SVA — resumen comercial (cerrado 2026-08-26)

**Tres capas — no mezclar:**

| Capa | Qué es | Quién la paga |
|------|--------|---------------|
| **Plan base** | Básico / Mediano / Pro — suelo fijo | Todos |
| **SVA** | Módulo opcional **encima de Mediano** | Solo Mediano (à la carte). **Pro = todos incluidos** |
| **Addon capacidad** | Más tiendas, workers, marcas… | Pro+ (y packs workers en todos) |

**Reglas duras:**

1. **Básico (49 €)** y **Mediano (179 €)** → **sin SVAs** en el gancho; Mediano **sí puede** contratar SVAs.
2. **Pro (350 €)** → **todos los SVAs incluidos**; no se venden sueltos.
3. **Mediano 179 €** = **paridad Revo + Yurest Lite** (1 app) — ver **§1e Paquete Mediano**. **Pro** = Mediano + OPS + correo IMAP + dirección + SVAs incluidos.
4. **1 tienda** en suelo en todos los planes; 2ª+ tienda = addon **149 €** (solo Pro+).

Ver detalle en §1e (Mediano), §1 suelo Pro, §2 SVAs, §3 addons.

**Pitch Mediano:** *«Revo + Yurest en una app. 179 € vs ~150 € en dos proveedores.»*  
**Pitch Pro:** *«Ver y mandar el negocio: OPS, correo facturas, dashboard jefe, multi-sede.»*

### §1e — Paquete **Mediano 179 €** (cerrado)

**= Revo + Yurest Lite en 1 app** (mercado ~150 € → Vertial **179 €** + 4 workers + sync nativo).

| ✓ Incluido | |
|------------|---|
| 1 tienda · **4 workers** | |
| **TPV + Verifactu** (caja, mesas, comandas, cobro) | = Revo |
| Carta / catálogo · inventario · clientes básicos | |
| **Escandallo** (recetas, food cost, margen) | = Yurest |
| **Compras:** pedidos, albarán OCR, factura OCR, proveedores | = Yurest |
| Alerta si sube precio proveedor · stock ligado a ventas | = Yurest |
| **Dashboard 1** (ventas del día · por marca) | |

| ✗ No incluido | → |
|---------------|---|
| OPS tiempo real · correo IMAP facturas | **Pro** |
| Dashboard jefe · alertas · multi-sede · OFFLINE | **Pro** |
| Chat, calendario, RRHH, web, QR, Glovo… | **SVA** o **Pro** |

---

### Mediano 179 € — checklist gates (producto)

| Pieza | Mediano | Notas |
|-------|:-------:|-------|
| **1 tienda / 1 PDV** | ✓ | |
| **4 workers** | ✓ **Cerrado** | Antes 6; código aún 6 (`planCatalog.ts`) |
| **TPV + Verifactu** | ✓ **Cerrado** | |
| **Catálogo** | ✓ **Cerrado** | Productos/menú del local |
| **Ops del vertical** (pedidos, caja…) | ✓ | Implícito en «1 tienda seria» |
| **Clientes básicos** | ✓ **Cerrado** | No CRM+ (SVA) |
| **Chat equipo** | ✗ **Cerrado** | **SVA** (§2) o incluido en Pro — no Básico ni Mediano suelo |
| **Calendario** | ✗ **Cerrado** | **SVA** (§2) o incluido en Pro — no Básico ni Mediano suelo |
| **Dashboard 1** (franja superior) | ✓ **Cerrado** | Ventas diarias y desglose **por marca** del local — ver §1b |
| **Resto del dashboard** (gráficas, finanzas, embudo, márgenes…) | ✗ | Solo **Pro** — bloques tapados + CTA upgrade |
| **Stock básico** (`Inventario` en catálogo) | ✓ **Cerrado** | Unidades, baja al vender, agotado |
| **Escandallo** (recetas, food cost, margen) | ✓ **Cerrado** | Paridad Yurest Lite |
| **Compras** (proveedores · pedidos · albarán · facturas · OCR) | ✓ **Cerrado** | Paridad Yurest Lite — **sin** correo IMAP |
| **Correo facturas IMAP** (automático al buzón) | ✗ | **Pro** |
| **OPS** (centro operativo / ver negocio tiempo real) | ✗ | **Pro** |
| **4 workers** | ✓ **Cerrado** | Diferenciador vs Yurest (ellos no venden cupo equipo en el mismo paquete) |
| **RRHH · Finanzas · CRM+ · Canales** | ✗ | SVAs (§2) o incluidos en Pro |
| **Web pedidos** (enlace público · recoger/delivery) | ✗ **Cerrado** | SVA (§2) o incluido en Pro — no es «Canales» (Glovo/Uber…) |
| **QR mesas** (pedido desde mesa · token por mesa) | ✗ **Cerrado** | SVA (§2) o incluido en Pro — ver `docs/tickets/WEB-PEDIDOS-Y-QR-MESAS.md` |
| **Multi-tienda · portfolio · calendario multi-PDV** | ✗ | Pro + addons |
| **Alertas** (centro de alertas / motor) | ✗ **Cerrado** | No en Mediano — **Pro** (negativas); Básico pendiente |
| **OFFLINE / airbag TPV** (caja sin nube) | ✗ **Cerrado** | Solo **Pro** — incluido en suelo Pro, no SVA |

**Idea de venta Mediano:** ver **§1e** (paquete cerrado).

### Pro 350 € — qué añade sobre Mediano

| Extra Pro | |
|-----------|---|
| OPS / visión operativa tiempo real | |
| Correo facturas IMAP | |
| Dashboard completo + alertas negativas | |
| Multi-sede (función) + OFFLINE + API | |
| **Todos los SVAs incluidos** + 12 workers | |

### Escandallo — referencia producto (interno)

**Yurest (marketing / producto):** no es magia sin configurar — hay que dar de alta recetas y proveedores. Lo que venden como «automático» es el **bucle cerrado** una vez montado:

| Capacidad | Yurest | Vertial hoy | Notas |
|-----------|:------:|:-----------:|-------|
| Ficha técnica / receta por plato | ✓ | ✓ | `EscandalloPanel`, líneas ingrediente |
| Food cost % y margen | ✓ | ✓ | `catalogCosting` |
| Crear escandallo sin picar todo a mano | ✓ (desde receta) | ✓ | Botón «Generar escandallo» + presets pizza/burger/tacos/bar (`catalogImportCosting`) |
| Compra OCR → actualiza precio ingrediente | ✓ | ✓ (parcial) | Albarán/factura proveedor; variación de precio detectada |
| Compra OCR → **recalcula** escandallos afectados | ✓ | ◐ | Coste en inventario sí; recalcular todos los platos al cambiar coste = **cerrar bucle** (pendiente producto) |
| Venta TPV → baja stock por receta | ✓ (vía integración TPV) | ✓ | Nativo en Vertial (`recipeCostingFallback`, pipeline stock) |
| Alerta si sube coste / margen en riesgo | ✓ | ◐ | `supplierPriceVariance` + alertas Pro; falta alerta «margen plato X» |
| Mermas por ingrediente / técnica | ✓ | ✗ / mínimo | Yurest más formal; Vertial cantidades fijas en receta |
| APPCC / trazabilidad elaboración | ✓ | ✗ | No prioritario mismo nivel Yurest |
| Multi-local recetario unificado | ✓ | Pro+addons | Portfolio / varias tiendas |
| Margen sobre **ventas reales** (no solo teórico) | ◐ informes | ✓ | Paneles margen producto vendido (delivery) — **diferenciador Vertial** |

**Conclusión comercial:** Escandallo **Pro** debe ser **≥ Yurest en el bucle compra→coste→margen→venta→stock**. Vertial ya va **delante en TPV+stock nativo** y **bootstrap rápido** (presets carta). Falta cerrar **recalc en cascada** al cambiar coste proveedor y alertas de margen por plato — eso es lo que Yurest vende como «todo automático».

**No meter Escandallo ni Compras OCR como SVA:** en **Mediano**. **Pro** añade correo IMAP, OPS y dirección.

### Catálogo — gates Mediano vs Pro (cerrado)

Módulo `/saas/delivery-catalog` (`CatalogModuleNav`):

| UI producto | Mediano | Pro |
|-------------|:-------:|:---:|
| **Carta** (menú/productos) | ✓ | ✓ |
| **Ingredientes** (delivery) | ✓ | ✓ |
| **Inventario** | ✓ | ✓ |
| **Escandallo** | ✓ | ✓ |
| **Compras** (pedidos, albarán, factura OCR) | ✓ | ✓ + **correo IMAP** |
| **Consumos** equipo | pendiente gate | pendiente gate |

**Nota:** Mediano = paquete **§1e**. Pro añade OPS, correo IMAP, dashboard jefe, multi-sede, SVAs.

### Dashboard — gate Mediano vs Pro (cerrado)

**Mediano (179 €):** solo **Dashboard 1** — la franja de arriba en `/saas/dashboard`:

- Ventas **del día** (y lo mínimo operativo del local: pedidos, caja hoy…)
- Desglose **por marca comercial** (Pizzería, Burger, etc.)
- Sin gráficas largas, sin embudo CRM, sin widget finanzas/EBITDA, sin márgenes avanzados

**Pro (350 €):** todo lo demás del dashboard desbloqueado:

- Gráficas, evolución, informes KPI
- Finanzas / EBITDA en dashboard
- Embudo CRM, fichajes en dashboard, márgenes producto, paneles lazy avanzados
- **Visión general** multi-empresa / portfolio CEO (aparte: requiere cupo + addons §1)

**UX producto (cuando se implemente gates):** bloques Pro = **tapados** (blur o placeholder) + **CTA** «Sube a Pro» — no ocultar del todo; que se vea que existe. Referencia código: `dashboardPlanCatalog.ts`, `VertialBillingUpgradeLink`.

**Básico (49 €):** **Dashboard 1** (igual que Mediano) — ventas del día · por marca. Sin escandallo ni compras.

### Qué cuesta más (no viene en Básico / Mediano suelo)

**Regla:** 49 € y **179 €** = **1 tienda**, vista **de ese local**. Multi-sede, visión de grupo y dirección consolidada = **más plan + más addons**.

| Capacidad | Básico 49 | Mediano 179 | Pro 350 | Extra €/mes (packing) |
|-----------|:---------:|:-----------:|:-------:|----------------------:|
| Dashboard **1** (ventas día · por marca) | ✓ | ✓ | ✓ | Incluido |
| Dashboard **completo** (gráficas, finanzas, CRM…) | ✗ | ✗ * | ✓ | * Mediano: solo franja superior; resto CTA Pro |
| **Multi-tienda** (2ª+ PDV, calendario por local, TPV por sede…) | ✗ | ✗ | ✓ * | **149** / PDV extra |
| **Visión general / portfolio CEO** (varias empresas/locales agregados) | ✗ | ✗ | ✓ * | Pro + cupo multi-empresa; **89** / empresa extra |
| Informes / KPIs **consolidados** multi-sede | ✗ | ✗ | ✓ | Incluido en Pro (con sedes contratadas) |
| API · webhooks · conciliación bancaria | ✗ | ✗ | ✓ | Incluido en Pro |
| Marca comercial extra (líneas catálogo) | ✗ | ✗ | ✓ | **19** / marca |

\* Pro desbloquea la **función**; cada tienda/empresa/marca **extra** se paga aparte (§3). Sin addon PDV, Pro sigue siendo **1 tienda** en el suelo.

**Ventas (una frase):** «Mediano gestiona un local. Si quieres **varias tiendas** o el **dashboard de grupo**, entras en Pro y pagas cada sede/empresa extra.»

### Alertas por plan (regla comercial)

| Plan | Alertas |
|------|---------|
| Básico | Pendiente (antes: positivas) |
| **Mediano** | **No incluidas** |
| Pro | Negativas (avisan de problemas: caja, dinero, operación) |

---

## 2. SVAs (solo Mediano; incluidos en Pro)

Los SVAs se contratan en **Mediano** para empujar el ticket hacia Pro. En **Pro van incluidos**.

| SVA | €/mes | En Pro | Estado | Notas |
|-----|------:|:------:|--------|-------|
| RRHH | **50** | incluido | **Cerrado** | Equipo, fichajes, horarios, nóminas en el mismo SaaS |
| Finanzas | **49** | incluido | Propuesto | Conta / caja seria — falta OK |
| CRM+ | **39** | incluido | Propuesto | Clientes Pro (gasto, fidelización…) — falta OK |
| Canales | **49** | incluido | Propuesto | Integraciones agregadores (Glovo, Uber Eats…) — **no** es web propia |
| **Web pedidos** | **39** | incluido | Propuesto | Carta pública Vertial · selector tienda · recoger/delivery — puerta A en ticket producto |
| **QR mesas** | **49** | incluido | Propuesto | QR **por mesa** · pedido a sala/cocina · sin URL adivinable — puerta B en ticket producto |
| **Chat equipo** | **50** | incluido | **Cerrado** | Mensajería interna del local / equipo |
| **Calendario** | **19** | incluido | **Cerrado** | Agenda gestión (turnos, eventos internos — no multi-PDV Pro) |

**Mercado (referencia):** Yurest **no** da QR mesa ni web pedidos. Revo lo cubre con **Revo SOLO** (addon al TPV). Qamarero ≈ **119 €** mesas+comandas como app aparte. Vertial = SVAs separados (web ≠ mesa).

**Suma SVAs (8)** = 50 + 49 + 39 + 49 + 39 + 49 + 50 + 19 = **344 €/mes**  
Mediano 179 + todos los SVAs = **523 €/mes** → **Pro 350 €** sale mucho más barato que Mediano à la carte. Empuje claro a Pro.

**Suma SVAs «clásicos» (4, sin web/QR/chat/cal)** = **187 €/mes** → Mediano + 4 SVAs = **366 €/mes** (sigue > Pro).

### Partner (afiliados)

**20 %** sobre MRR del cliente (plan + packs workers + SVAs + capacidad). Enterprise: comisión aparte / negociada.

---

## 3. Addons de capacidad

Addons de **tamaño**, no de menú de módulos. Marca y empresa solo desde **Pro+**.

| Addon | €/mes (packing) | Desde | Notas |
|-------|----------------:|-------|-------|
| PDV / tienda extra (2ª, 3ª…) | **149** | Pro+ | Ancla: ~150 €/tienda · **no** incluida en el suelo Pro |
| Marca comercial extra | **19** | Pro+ | Línea catálogo (p. ej. Pizzería, Burger) |
| Empresa extra | **89** | Pro+ | Segundo negocio / vertical aislado |
| Workers +5 | **29** | Todos los planes | Hasta tope self-serve |
| Workers +10 | **49** | Todos los planes | Hasta tope self-serve |
| Tablet TPV extra | **9,90** | Pro+ | Solo en **código** hoy; no cerrado en packing SVA |

- **Owner** de la cuenta **no** cuenta como worker.  
- **Tope workers self-serve:** 25. Más → «Hablar con Vertial».

### Cupos workers por plan (cerrado)

| Plan | Workers incluidos |
|------|------------------:|
| Gancho | 2 |
| Mediano | **4** |
| Pro | 12 |

---

## 4. Ejemplos de ticket (€/mes)

| Escenario | €/mes approx |
|-----------|-------------:|
| Solo probar TPV | **49** |
| 1 tienda seria (Mediano) | **179** |
| 1 tienda + RRHH | **229** |
| 1 tienda + SVAs clásicos (4) | **366** |
| 1 tienda + todos los SVAs (8) | **523** |
| 1 tienda + Chat (Mediano + SVA) | **229** |
| 1 tienda + Calendario (Mediano + SVA) | **198** |
| 1 tienda + Web pedidos (Mediano + SVA) | **218** |
| 1 tienda + QR mesas (Mediano + SVA) | **228** |
| Mercado TPV + Yurest (2 apps) | **~150** |
| Vertial Mediano (1 app, +comodidad) | **179** (+29 vs 2 apps) |
| 1 tienda + todo (Pro) | **350** (349 en código) |
| 2 tiendas + todo (Pro + 1 PDV extra) | **499** (350 + 149) |
| Pro + 2 empresas + portfolio CEO (addon empresa) | **439** (350 + 89) |
| 2 tiendas + 2 empresas + todo | **588** (350 + 149 + 89) |
| Pro + pack +10 workers | **399** |

---

## 5. Comparativa vs mercado (argumentario ventas)

**Escenario:** plan Pro · **12 trabajadores** · **1 PDV** · Vertial Pro **349 €/mes** (279 €/mes anual).

**Reglas:** solo precios públicos verificables · total €/mes por app · sin «ahorro operativo» inventado · apps sin tarifa fija **no suman**.

| Módulo Vertial | App mercado | Total €/mes |
|----------------|-------------|------------:|
| Chat de equipo | Slack Pro | 81 |
| Documentos + calendario | Google Workspace Starter | 97 |
| RRHH | Factorial (entrada) | 66 |
| Nóminas | Holded Nóminas | 60 |
| Facturación | Holded Estándar | 59 |
| Stock | Holded Inventario | 25 |
| Sala + reservas | CoverManager Essential | 89 |
| Mesas / comandas (QR mesa) | Qamarero | 119 |
| Web pedidos / carta QR cliente | Revo SOLO (addon TPV) | — * |
| TPV + caja | Revo XEF ONE | 50 |
| Informes | Power BI Pro (~2 gestores) | 20 |
| **SUMA stack** | | **666** |
| **Vertial Pro** | todo incluido | **349** |
| **Diferencia** | | **317 (~48 %)** |

### Sin precio público (incluido en Pro, no suman)

| Módulo Vertial | Equivalente mercado |
|----------------|---------------------|
| Centro operativo delivery | Deliverect / UrbanPiper / similares |
| Escandallos / food cost | Mastery / food-cost SaaS |

\* Revo SOLO = addon al TPV; tarifa pública variable según distribuidor — no suma en tabla. Vertial empaqueta **Web pedidos** y **QR mesas** como SVAs Mediano (§2).

**Regenerar PDF:** `node scripts/generate-vertial-apps-equivalencias-pdf.mjs`  
**Fuente datos:** `scripts/generate-vertial-apps-equivalencias-pdf.mjs` (`CON_PRECIO`, `SIN_PRECIO_PUBLICO`)

---

## 6. Qué NO es SVA (va dentro del plan)

| Pieza | Decisión |
|-------|----------|
| Verifactu | En gancho 49 (suelo legal TPV) |
| OCR facturas / albaranes proveedor | **Mediano ✓** (OCR foto/subida) · **Pro** (+ correo IMAP) · **no** SVA |
| Compras + escandallo OCR | **Mediano ✓** (paridad Yurest) |
| Correo IMAP · OPS | **Pro** — no SVA |
| Soporte 49 €/mes | **Rechazado** |
| Alertas (centro / motor) | **No** en Mediano · **Pro** (negativas) |
| Alertas Pro / API light / portfolio CEO | **Pro** (350 €); portfolio multi-empresa además requiere cupo empresa (89 € addon) — no SVA suelto |
| Dashboard **1** (ventas día por marca) | Mediano ✓ · Básico pendiente |
| Dashboard **completo** (gráficas, finanzas, CRM…) | **Pro** — Mediano ve bloques tapados + CTA |
| Stock básico (`Inventario`) | Mediano ✓ |
| Compras + escandallo OCR (paridad Yurest Lite) | **Mediano ✓** |
| Correo IMAP · OPS · dashboard jefe · multi-sede | **Pro** |
| Chat equipo · Calendario | **SVA** Mediano (§2) · incluidos **Pro** — no en suelo Básico/Mediano |
| Web pedidos · QR mesas | **SVA** Mediano (§2) · incluidos **Pro** — no vienen en dúo mercado TPV+Yurest |
| Dashboard multi-sede / visión general CEO | **Pro** + sedes/empresas contratadas (PDV **149**, empresa **89**) |
| OFFLINE / airbag TPV | **Pro** — incluido (caja local-first; no SVA) |

**OFFLINE (idea):** caja local-first en tablet; si cae la nube no descuadra. **Cerrado en Pro.** Plan técnico: `tpv_caja_local-first` (diseño, no ejecutado).

---

## 7. Código vs este doc (divergencias)

Prioridad comercial: **este doc** cuando está «Cerrado». El código refleja implementación anterior o parcial.

| Concepto | Packing (este doc) | Código hoy |
|----------|-------------------:|-----------:|
| Pro mensual | 350 (narrativa) | **349** (`planCatalog.ts`, MONEI) |
| Básico / Mediano | 49 / **179** | **49 / 149** (`planCatalog.ts`) |
| Pro — PDV incluidos | **1** | **1** (`planCatalog.ts` maxLocations) ✓ |
| PDV extra (2ª+) | **149** | **49** (`planAddonCatalog.ts`) |
| Marca extra | **19** | **19** ✓ |
| Empresa extra | **89** | **89** ✓ |
| Worker extra | packs **29** / **49** (+5 / +10) | **5 €/u** (`extra_worker`) |
| SVAs módulo (RRHH, Finanzas…) | 50 / 49 / 39 / 49 | **No existen** en catálogo billing |
| Tablet TPV extra | 9,90 (solo código) | **9,90** ✓ |
| Workers incluidos plan | 2 / **4** / 12 | **2 / 6 / 12** (`planCatalog.ts`) |
| Mediano — suelo (chat, calendario, stock…) | §1 tabla suelo | Bullets distintos en `planCatalog.ts` |
| Dashboard Mediano = solo Dashboard 1 | §1b | `dashboardPlanCatalog.ts` desbloquea charts/finance en **normal** |

---

## 8. Pendientes / para apuntar

- [ ] **OK** stack SVA Finanzas 49 / CRM+ 39 / Canales 49  
- [ ] **OK** SVA **Web pedidos 39** / **QR mesas 49** (precios propuestos)  
- [x] **Chat equipo SVA 50 €** / **Calendario SVA 19 €** — cerrado 2026-08-26  
- [ ] **Gates producto** — catálogo: Mediano = Carta + Inventario + **Escandallo**; Compras = Pro + CTA  
- [ ] **Dashboard 1 en Básico** — ¿igual que Mediano o más recortado?  
- [ ] **Enterprise** — cotización (base + €/PDV + bloque workers); muro «Hablar con Vertial»  
- [ ] **Alinear Mediano 179 €** en `planCatalog.ts` y MONEI (código hoy 149 €)  
- [ ] Regenerar PDF equivalencias si cambia `CON_PRECIO`  
- [ ] _(añadir aquí nuevas filas SVA o precios)_

**Cerrados 2026-08-26 (sesión):** Chat + calendario → **SVAs** (Mediano compra · Pro incluye) · OFFLINE → **Pro** · Escandallo+Compras → **Pro** (Mediano = Inventario) · Pro precio → **350 €**

### Competencia (referencia rápida)

TPV + Yurest Lite ≈ **130–150 €/mes** (2 apps). **Mediano 179 €** = +**~29 €** por 1 app + 4 workers. Pro **350 €** vs stack argumentario **666 €** (§5).  
Mediano+SVAs clásicos (**366 €**) o +todos (**523 €**) → **Pro 350 €** (más barato con todo incluido). Multi-tienda = Pro + addons (**149 €/PDV**, **89 €/empresa**). Mercado TPV+Yurest **no** incluye web pedidos ni QR mesa (Revo SOLO / Qamarero aparte).

---

## 9. Changelog

| Fecha | Decisión |
|-------|----------|
| 2026-08-03 | Chat plan mode ([ddf568c7](ddf568c7-f283-4186-9de9-43418654eac7)): embudo 49→149→350, SVAs Mediano, workers +5=29 / +10=49, tope 25, PDV extra 149, RRHH SVA 50 cerrado |
| 2026-08-04 | OFFLINE/airbag TPV anotado como posible SVA app (pendiente) |
| 2026-08-04 | Alertas: Básico positivas, Pro negativas — apuntado en `planCatalog.ts` |
| 2026-08-25 | Chat ([836107d7](836107d7-191b-4d38-a88e-30ca00ff8aeb)): comparativa mercado 666 vs 349, Qamarero + Revo, script `generate-vertial-apps-equivalencias-pdf.mjs` |
| 2026-08-26 | Creado este documento maestro fusionando plan Cursor + script + divergencias código |
| 2026-08-26 | **Pro = 1 tienda** (no 2 incluidas). 2ª+ tienda = addon 149 € en Pro+. Empuje Mediano→Pro = módulos + workers, no 2ª sede |
| 2026-08-26 | Multi-tienda, portfolio CEO y dashboard consolidado = **Pro + addons**; Mediano/Básico = 1 local |
| 2026-08-26 | **Mediano recortado:** 4 workers · TPV+VF+catálogo+clientes básicos · sin chat · sin calendario · stock pendiente |
| 2026-08-26 | **Dashboard Mediano:** solo Dashboard 1 (ventas día por marca arriba); resto Pro tapado + CTA |
| 2026-08-26 | **Stock Mediano:** Inventario básico sí · **Escandallo + Compras** = Pro (asimilación Yurest+TPV; workers 4 en Mediano) |
| 2026-08-26 | **Mediano = 179 €/mes** cerrado (+~29 € vs TPV+Yurest ~150 €; 1 app + workers). Anual eq. **143 €/mes**. Código aún 149 € |
| 2026-08-26 | **Mediano sin alertas** — motor/centro de alertas solo **Pro** (negativas) |
| 2026-08-26 | **Web pedidos** y **QR mesas** = **SVAs Mediano** (39 + 49 € propuestos); incluidos Pro. No vienen en TPV+Yurest; mercado = Revo SOLO / Qamarero aparte |
| 2026-08-26 | **Hipótesis Pro → 400 €** (no cerrado): más SVAs dentro de Pro; embudo posible 49→179→400 |
| 2026-08-26 | **Chat + calendario → Pro** (no Básico ni Mediano) |
| 2026-08-26 | **OFFLINE / airbag TPV → Pro** incluido (no SVA) |
| 2026-08-26 | **Escandallo base → Mediano 179 €** (paridad Yurest Lite). Pro = escandallo + compras conectadas + bucle automático. Revoca cierre «escandallo solo Pro» |
| 2026-08-26 | **Pro 350 €** confirmado de momento (descartada subida a 400 € por ahora) |
| 2026-08-26 | **§1f** Ficha cerrada **Básico · Mediano (Normal) · Pro** — referencia única tres planes |
| 2026-08-26 | **Chat SVA 50 €** · **Calendario SVA 19 €** — precios cerrados |
| 2026-08-26 | **Hoja cliente Mediano** en `docs/VERTIAL-HOJAS-CLIENTE-CONTRATO.md` (anexo contrato) |
