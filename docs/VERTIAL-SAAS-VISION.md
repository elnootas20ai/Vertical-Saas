# Vertial — visión general del producto y de la arquitectura

Documento **para humanos y para el asistente**: resume el “qué es” y el “cómo lo construimos” sin tener que leer todo el repo de golpe. Incluye **restricciones de disco y memoria** y qué acciones pueden saturar el servidor. Las conclusiones de implementación concretas siguen en `shared/AGENT_HANDOFF.md` y en el código.

---

## 1. Qué es Vertial

- **SaaS multi-tenant**: cada cliente es una cuenta de negocio con sus datos, su equipo y sus **puntos de venta (PDV)**.
- **Verticales**: el mismo núcleo sirve **varios tipos de negocio** (módulos / “verticales”: delivery, TPV, taller, etc.). Lo que cambia entre verticales es sobre todo **pantallas, flujos y reglas de dominio**, no la idea de “cuenta + PDV + permisos”.
- **Acceso**: cada cliente opera en su espacio; los **PDV** son la unidad operativa de tienda / caja / cocina según el módulo.

---

## 2. Modelo comercial (referencia de producto)

| Precio mensual (referencia) | Rol del plan | PDV incluidos |
|----------------------------|----------------|----------------|
| **50 €**                   | Entrada / básico | **1 PDV** |
| **150 €**                  | Intermedio     | **1 PDV** |
| **350 €**                  | Alto / multi-sede base | **2 PDV** |

- **PDV adicional** (más allá de lo que incluye el plan): **+50 €** cada uno (ampliación / add-on).
- En código hoy los planes se expresan como **Básico / Normal / Pro** con límites de PDV **1 / 1 / 2**; los **importes (50 / 150 / 350 / +50)** deben vivir alineados con **catálogo de facturación** (Monei / planes) cuando el producto y el panel de precios coincidan al 100 % con esta tabla.

---

## 3. Cómo queremos programarlo (módulos y futuro)

1. **Módulos por vertical**  
   Cada vertical debería poder **aislarse** (carpetas claras, APIs con prefijo o router propio, permisos explícitos). Si un día se “vende” o se despliega solo Delivery, no arrastra medio monolito por accidente.

2. **Duplicable**  
   Patrones repetibles: “listado + detalle + permiso por PDV”, “wizard con pasos”, “CTA de límite de plan”. Para algo **muy parecido** en otro vertical: **copiar el patrón** y renombrar (no reinventar desde cero cada vez).

3. **Lógica compartida fuera del front y del back duplicado**  
   Reglas que deben ser **idénticas** en Node y en Vite (códigos automáticos, slugs, etc.) → carpeta **`shared/`** (ver `shared/README.md` y `shared/naming/README.md`). Un solo archivo `.js` + `.d.ts` si hace falta.

4. **Multi-PDV y permisos**  
   - Un **gerente** puede tener varias tiendas (varios PDV).  
   - Un **trabajador** suele ir acotado a **un PDV** (rol / empleo).  
   La UI y la API deben **filtrar por PDV** donde toque, para no mezclar datos entre tiendas.

5. **Documentos de continuidad**  
   - `HANDOFF.md` (raíz) → apunta al detalle.  
   - `shared/AGENT_HANDOFF.md` → rutas y decisiones ya tomadas en código.  
   - **Este archivo** → visión de producto + principios; al cambiar precios o reglas de negocio, **actualizar aquí primero** y luego el código / facturación.

6. **Recursos escasos en servidor** (disco y RAM)  
   El entorno de despliegue puede tener **muy poco disco y/o muy poca memoria**. Conviene:
   - **Programar ligero**: no inflar dependencias ni bundles sin necesidad; evitar cargar en RAM **listas enormes** de una sola vez (paginación, `limit` en APIs, streaming cuando tenga sentido).
   - **Logs y temporales** con rotación o techo de tamaño; no dar por hecho disco ilimitado.
   - **Aviso explícito a quien opera el sistema** (tú, soporte, cliente avanzado): ciertas acciones **pueden llenar el servidor** si son **muy grandes** o muy frecuentes: importaciones masivas, informes a todo el histórico, generación de muchos PDFs, subida de muchos ficheros o imágenes, exports CSV gigantes, backups manuales encadenados, etc. En producto: **mensajes de “operación pesada”**, **límites** (tamaño, filas, ventana de fechas), **trozos** o **cola** en lugar de aceptar trabajo ilimitado en una sola petición.

---

## 4. Glosario mínimo

| Término | Significado breve |
|--------|----------------------|
| **Tenant / cuenta** | Un cliente de Vertial (un negocio). |
| **PDV** | Punto de venta físico o lógico (tienda, caja, cocina enlazada a un centro). |
| **Vertical** | Módulo de negocio (Delivery, TPV, etc.) sobre el mismo SaaS. |
| **Plan** | Suscripción que fija precio y **cuántos PDV** incluye; ampliaciones para más PDV. |

---

## 5. Relación con otros archivos

| Archivo | Contenido |
|---------|-----------|
| `docs/VERTIAL-SAAS-VISION.md` | **Este** — visión producto + arquitectura modular. |
| `shared/AGENT_HANDOFF.md` | Detalle técnico y rutas ya implementadas. |
| `shared/naming/README.md` | Cómo añadir otra regla de códigos compartida Node + Vite. |

Si algo de este documento **contradice** el código, priorizar la **decisión de producto acordada contigo** y abrir tarea para alinear código o facturación.
