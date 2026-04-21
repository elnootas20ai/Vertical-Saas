# Informes Operativos y Económicos — Delivery

**Página:** `/saas/vertical/delivery/informes`  
**Objetivo:** Medir el rendimiento real del negocio y de cada canal de venta.  
**Módulo:** `src-delivery/app/components/informes/`

---

## Estado actual

### Ya implementado
- Catálogo de informes por categorías con 8 tabs y ~50 informes definidos (`informes-catalogo.ts`)
- Componentes compartidos: `InformesHeader`, `InformesFilters`, `PlantillaInforme`, `KPICardInforme`, `ChartControls`, `InformesNivelAnalisis`
- 3 informes delivery básicos (solo datos mock, sin filtros ni niveles): `InformeRendimientoDelivery`, `InformeCanalesVenta`, `InformeIncidenciasDelivery`
- Informes generales avanzados con patrón completo (filtros, niveles Base/Normal/Pro, comparativa, rankings, alertas, insights): `InformeTicketMedio`, `InformeIngresos`, `InformeGastos`, etc.
- Sistema de exportación (PDF/Excel/CSV) en `InformesHeader`
- Backend: `salesMetricsController.js` con agregaciones de ventas, `alertEngine.js` con sistema de alertas, SSE para tiempo real, CouchDB

### Patrón de referencia
El informe `InformeTicketMedio` es el modelo a seguir. Tiene 11 bloques bien definidos:
1. Header con breadcrumb y exportación
2. Filtros (periodo, PDV multiselección, filtros personalizados) — responsive
3. Nivel de análisis (Base / Normal / Pro)
4. KPIs principales (cards compactas)
5. Gráfico principal (línea/barra/circular con controles)
6. Detalle en tabla colapsable
7. Comparativa con periodo anterior (NORMAL+)
8. Rankings y estadísticas (NORMAL+)
9. Alertas inteligentes (PRO)
10. Insights y recomendaciones (PRO)
11. Responsive completo (móvil/desktop)

---

## Tickets

---

### INF-01 · Refactorizar InformeRendimientoDelivery al patrón completo

**Prioridad:** Alta  
**Tipo:** Mejora  
**Archivo:** `src-delivery/app/components/informes/InformeRendimientoDelivery.tsx`

**Estado actual:**  
Componente básico con datos mock planos, 4 KPIs estáticas, 1 gráfico de líneas y 1 tabla de estados. Sin filtros, sin niveles de análisis, sin secciones colapsables.

**Cambios requeridos:**

1. **Header** — Usar `InformesHeader` con breadcrumb `Informes > Negocio > Rendimiento Delivery`, botón de exportación (PDF/Excel/CSV)
2. **Filtros** — Usar `InformesFilters` con:
   - Periodo: hoy / semana / mes / trimestre / últimos 30d / 90d / personalizado
   - Sede/PDV: multiselección de sedes del negocio
   - Canal: checkboxes para Directo, Glovo, Uber Eats, Just Eat, Web propia, Teléfono
   - Trabajador: selector múltiple de empleados (cocina, montaje, reparto)
3. **Nivel de análisis** — `InformesNivelAnalisis` con Base/Normal/Pro
4. **KPIs** (4 cards) — Usar `KPICardInforme`:
   - Tiempo medio **cocina** (minutos) + variación vs periodo anterior
   - Tiempo medio **montaje** (minutos) + variación
   - Tiempo medio **reparto** (minutos, desde salida hasta entrega) + variación
   - Tiempo medio **total** (desde pedido recibido hasta entregado) + variación
5. **Gráfico principal** — `ChartControls` con agrupaciones:
   - Por periodo: evolución diaria/semanal de tiempos (líneas superpuestas para cocina, montaje, reparto, total)
   - Por canal: barras comparando tiempos medios entre Directo, Glovo, Uber Eats, Just Eat, Web
   - Por trabajador: barras horizontales con tiempos por persona
   - Por franja horaria: heatmap o barras mostrando en qué horas los tiempos son peores
6. **Detalle** — Tabla colapsable con últimos pedidos: Fecha/hora, Canal, Nº pedido, T. cocina, T. montaje, T. reparto, T. total, Estado, Trabajador cocina, Trabajador reparto
7. **Comparativa** (NORMAL+) — Comparar métricas con periodo anterior seleccionable
8. **Rankings** (NORMAL+):
   - Trabajador más rápido en cocina
   - Trabajador más rápido en reparto
   - Canal con mejor tiempo total
   - Franja horaria más eficiente
   - Día de la semana más rápido
9. **Alertas** (PRO) — Sección colapsable con detección automática de:
   - Tiempos de cocina disparados (>X min configurables)
   - Tiempos de reparto por encima del SLA
   - Trabajador con tiempos anómalos (>2σ sobre la media)
   - Pedidos retrasados por encima del umbral (%)
   - Acumulación de pedidos en cola
10. **Insights** (PRO) — Recomendaciones automáticas tipo:
    - "Los viernes entre 20-22h los tiempos de cocina son 40% superiores a la media"
    - "El repartidor X tiene tiempos de entrega 25% más bajos que la media"

**Datos:** Mock por ahora, preparado para recibir datos reales de `deliveryApi`.

**Criterios de aceptación:**
- Sigue exactamente el patrón de InformeTicketMedio
- Responsive: funciona en móvil y desktop
- Filtros funcionales sobre datos mock
- Secciones colapsables funcionan correctamente
- Los 3 niveles de análisis muestran/ocultan bloques

---

### INF-02 · Refactorizar InformeCanalesVenta al patrón completo + Rentabilidad

**Prioridad:** Alta  
**Tipo:** Mejora  
**Archivo:** `src-delivery/app/components/informes/InformeCanalesVenta.tsx`

**Estado actual:**  
Componente básico con 3 KPIs (TPV/Agregadores/Web), pie chart y barras de evolución. Sin filtros, sin desglose de canales individuales (Glovo, Uber Eats, Just Eat por separado), sin margen ni rentabilidad.

**Cambios requeridos:**

1. **Header** — `InformesHeader` con breadcrumb `Informes > Negocio > Canales de Venta`
2. **Filtros** — `InformesFilters`:
   - Periodo: estándar
   - Sede/PDV: multiselección
   - Canal: checkboxes por canal individual (Directo/TPV, Glovo, Uber Eats, Just Eat, Web propia, Teléfono, App propia)
3. **Nivel de análisis** — Base / Normal / Pro
4. **KPIs** (4 cards):
   - Ventas totales (€) + variación
   - Canal más rentable (nombre + margen %)
   - Comisiones totales pagadas a plataformas (€)
   - Margen neto medio entre canales (%)
5. **Gráfico principal** — Con agrupaciones:
   - Por periodo: evolución mensual de ventas separada por canal (líneas o barras apiladas)
   - Por canal (distribución): pie/donut con % de ventas por cada canal
   - Por rentabilidad: barras comparando Venta Bruta vs Comisión vs Margen Neto por canal
6. **Tabla de canales** — Detalle por canal con columnas:
   - Canal (icono + nombre)
   - Nº pedidos
   - Venta bruta (€)
   - % sobre total ventas
   - Comisión plataforma (€ y %)
   - Otros costes canal (€)
   - Margen neto (€)
   - Margen neto (%)
   - Ticket medio del canal (€)
   - Variación vs periodo anterior
7. **Desglose comisiones** (NORMAL+) — Tabla específica:
   - Glovo: comisión por pedido (€), % sobre venta, total comisiones periodo, nº pedidos
   - Uber Eats: idem
   - Just Eat: idem
   - Comparativa visual de quién cobra más
8. **Comparativa** (NORMAL+) — Comparar distribución y rentabilidad con periodo anterior
9. **Rankings** (NORMAL+):
   - Canal con mayor ticket medio
   - Canal con mayor volumen de pedidos
   - Canal más rentable (mayor margen neto %)
   - Canal con mayor crecimiento
   - Franja horaria más activa por canal
10. **Alertas** (PRO):
    - Canal con baja rentabilidad (margen < umbral)
    - Canal con caída de ventas (>X% vs periodo anterior)
    - Comisiones Glovo/Uber Eats/Just Eat superan umbral configurado
    - Canal con ticket medio descendiente
    - Concentración excesiva en un solo canal (>X%)
11. **Insights** (PRO):
    - "El canal Directo tiene un margen 3x superior al de Glovo. Considera promocionar pedidos directos"
    - "Uber Eats ha crecido 18% pero tu margen ha bajado 2.3% por aumento de comisiones"

**Criterios de aceptación:**
- Cada canal de agregador (Glovo, Uber Eats, Just Eat) aparece como línea separada, NO agrupados como "Agregadores"
- Se ve claramente cuánto paga el negocio de comisiones a cada plataforma
- La rentabilidad real por canal es visible de un vistazo

---

### INF-03 · Nuevo informe: Ventas Delivery (desglose multidimensional)

**Prioridad:** Alta  
**Tipo:** Nuevo componente  
**Archivo:** `src-delivery/app/components/informes/InformeVentasDelivery.tsx`

**Descripción:**  
Informe central de ventas que permite analizar las ventas por múltiples dimensiones: hora, día, canal, sede y trabajador.

**Estructura (patrón completo):**

1. **Header** — `Informes > Negocio > Ventas Delivery`
2. **Filtros**:
   - Periodo: estándar + personalizado
   - Sede/PDV: multiselección
   - Canal: Directo, Glovo, Uber Eats, Just Eat, Web, Teléfono, App
   - Trabajador: selector múltiple
   - Tipo producto: categorías de carta
3. **Nivel de análisis** — Base / Normal / Pro
4. **KPIs** (4 cards):
   - Ventas totales del periodo (€) + variación
   - Nº total de pedidos + variación
   - Ticket medio (€) + variación
   - Venta media por hora (€/h)
5. **Gráfico principal** — Con agrupaciones:
   - **Por hora**: barras con ventas por franja horaria (12h-15h, 19h-22h como picos típicos delivery)
   - **Por día**: barras/línea con ventas diarias
   - **Por canal**: pie/barras comparando ventas entre canales
   - **Por sede**: barras comparando sedes
   - **Por trabajador**: barras horizontales con ventas atribuidas por trabajador
   - **Por día de la semana**: barras agrupadas L-D
6. **Detalle** — Tabla con pedidos: Fecha/hora, Nº pedido, Canal, Sede, Trabajador, Importe bruto, Descuento, Importe neto, Nº ítems, Estado
7. **Heatmap de ventas** (NORMAL+) — Matriz día de la semana x franja horaria, coloreada por volumen de ventas. Permite ver de un vistazo cuándo vende más el negocio.
8. **Comparativa** (NORMAL+) — Periodo actual vs anterior
9. **Rankings** (NORMAL+):
   - Franja horaria con mayor venta
   - Día de la semana top
   - Canal con mayor ticket medio
   - Sede con mayor volumen
   - Trabajador con mayor venta acumulada
10. **Alertas** (PRO):
    - Caída de ventas (>X% vs periodo anterior)
    - Franja horaria con ventas inusualmente bajas
    - Sede con descenso de ventas
    - Día con anomalía de ventas
11. **Insights** (PRO):
    - "Los sábados entre 20-21h representan el 18% de tus ventas semanales"
    - "El canal Web ha crecido un 22% pero solo representa el 8% del total"

**Registro en catálogo:**  
Añadir a `informes-catalogo.ts` en la categoría `negocio`:
```
{ id: 'ventas-delivery', nombre: 'Ventas Delivery', nivel: 'base', disponible: true, vertical: 'delivery', descripcion: 'Ventas por hora, día, canal, sede y trabajador' }
```

**Registro en `Informes.tsx`:**  
Importar el componente y añadir la condición `if (informeAbierto === 'ventas-delivery')`.

**Criterios de aceptación:**
- Se puede cambiar de dimensión (hora/día/canal/sede/trabajador) de forma fluida
- El heatmap se ve claro y da información accionable de un vistazo
- Filtros combinables (ej: ver ventas de Glovo en la sede Norte por hora)

---

### INF-04 · Nuevo informe: Productos Top Delivery

**Prioridad:** Media  
**Tipo:** Nuevo componente  
**Archivo:** `src-delivery/app/components/informes/InformeProductosTopDelivery.tsx`

**Descripción:**  
Ranking de los productos más vendidos, con análisis por canal, rentabilidad y tendencias.

**Estructura:**

1. **Header** — `Informes > Negocio > Productos Top Delivery`
2. **Filtros**:
   - Periodo
   - Sede/PDV
   - Canal (Directo, Glovo, Uber Eats, Just Eat, Web, Teléfono)
   - Categoría de producto (pizzas, hamburguesas, bebidas, postres, etc.)
3. **Nivel de análisis** — Base / Normal / Pro
4. **KPIs** (4 cards):
   - Producto estrella (nombre + unidades vendidas)
   - Productos distintos vendidos
   - Concentración top 5 (% de ventas que representan)
   - Producto con mayor ticket medio
5. **Gráfico principal**:
   - **Por volumen**: barras horizontales top 10/20 productos por unidades vendidas
   - **Por ingresos**: barras top 10/20 por € generados
   - **Por canal**: barras agrupadas mostrando qué productos venden más en cada canal
   - **Evolución**: líneas mostrando tendencia temporal del top 5
6. **Tabla detalle** — Ranking completo: Posición, Producto, Categoría, Unidades vendidas, Ingresos (€), Ticket medio, % sobre total, Canal predominante, Tendencia (↑↓→)
7. **Análisis por canal** (NORMAL+) — Tabla cruzada: Producto × Canal con unidades vendidas. Responde a "¿Qué se pide más por Glovo vs Directo?"
8. **Rankings** (NORMAL+):
   - Top 5 productos por canal
   - Productos con mayor crecimiento
   - Productos en declive
   - Productos exclusivos de un canal
9. **Alertas** (PRO):
    - Producto estrella con caída de ventas
    - Producto con stock bajo + alta demanda
    - Producto con margen negativo
10. **Insights** (PRO):
    - "La pizza 4 quesos es el #1 en Glovo pero solo #8 en Directo"
    - "Los postres representan solo el 4% de ventas delivery, oportunidad de venta cruzada"

**Registro en catálogo:**
```
{ id: 'productos-top-delivery', nombre: 'Productos Top', nivel: 'base', disponible: true, vertical: 'delivery', descripcion: 'Ranking de productos más vendidos por canal' }
```

---

### INF-05 · Nuevo informe: Ventas por Trabajador

**Prioridad:** Media  
**Tipo:** Nuevo componente  
**Archivo:** `src-delivery/app/components/informes/InformeVentasTrabajador.tsx`

**Descripción:**  
Análisis de rendimiento individual de cada empleado en ventas, tiempos y productividad.

**Estructura:**

1. **Header** — `Informes > Equipo > Ventas por Trabajador`
2. **Filtros**:
   - Periodo
   - Sede/PDV
   - Canal
   - Trabajador: selector individual o "Todos"
   - Puesto: cocina, montaje, reparto, caja, todos
3. **Nivel de análisis** — Base / Normal / Pro
4. **KPIs** (4 cards):
   - Total pedidos gestionados + variación
   - Venta media por trabajador (€) + variación
   - Trabajador más productivo (nombre)
   - Productividad media (pedidos/hora)
5. **Gráfico principal**:
   - **Por trabajador**: barras horizontales comparando ventas atribuidas (€) por persona
   - **Por productividad**: barras con pedidos/hora por trabajador
   - **Evolución**: líneas con productividad diaria por trabajador seleccionado
   - **Por puesto**: barras agrupadas por tipo de puesto (cocina/montaje/reparto)
6. **Tabla detalle** — Por trabajador: Nombre, Puesto, Horas trabajadas, Pedidos gestionados, Ventas atribuidas (€), Pedidos/hora, Tiempo medio por pedido, Incidencias, Valoración media
7. **Ficha individual** (NORMAL+) — Al hacer clic en un trabajador se despliega su ficha con métricas detalladas: evolución temporal, comparativa con media del equipo, puntos fuertes, áreas de mejora
8. **Rankings** (NORMAL+):
   - Trabajador con mayor venta
   - Trabajador más rápido
   - Trabajador con menos incidencias
   - Trabajador con mejor valoración cliente
9. **Alertas** (PRO):
    - Trabajador con productividad anómala (baja o muy alta)
    - Trabajador con muchas incidencias
    - Desviación de tiempo medio significativa
10. **Insights** (PRO):
    - "María tiene un 22% más de productividad los turnos de mañana vs noche"

**Control de visibilidad — ROL TRABAJADOR:**
- Un trabajador solo puede ver sus propios datos
- NO ve datos de otros compañeros
- NO ve rankings comparativos
- El gerente puede configurar si el trabajador ve o no sus métricas operativas

**Registro en catálogo:** Categoría `equipo`:
```
{ id: 'ventas-trabajador', nombre: 'Ventas por trabajador', nivel: 'base', disponible: true, vertical: 'delivery', descripcion: 'Rendimiento y ventas atribuidas por empleado' }
```

---

### INF-06 · Nuevo informe: Caja y Diferencias

**Prioridad:** Alta  
**Tipo:** Nuevo componente  
**Archivo:** `src-delivery/app/components/informes/InformeCajaDiferencias.tsx`

**Descripción:**  
Control de caja de repartidores y TPV, con seguimiento de arqueos, diferencias y conciliación.

**Estructura:**

1. **Header** — `Informes > Finanzas > Caja y Diferencias`
2. **Filtros**:
   - Periodo
   - Sede/PDV
   - Tipo caja: Repartidor / TPV / Todas
   - Trabajador/repartidor específico
3. **Nivel de análisis** — Base / Normal / Pro
4. **KPIs** (4 cards):
   - Total cobrado en efectivo (€)
   - Total diferencias detectadas (€, con color rojo si negativo)
   - Nº de arqueos realizados
   - % de arqueos con diferencia
5. **Gráfico principal**:
   - **Evolución diferencias**: barras con diferencias diarias (positivas arriba en verde, negativas abajo en rojo)
   - **Por repartidor**: barras con diferencias acumuladas por persona
   - **Por PDV/TPV**: barras con diferencias por punto de venta
   - **Por turno**: diferencias por turno (mañana/tarde/noche)
6. **Tabla sesiones de caja** — Fecha, Hora apertura, Hora cierre, Tipo (repartidor/TPV), Trabajador, Efectivo esperado (€), Efectivo contado (€), Diferencia (€), Motivo diferencia, Estado
7. **Resumen por trabajador** (NORMAL+) — Tabla: Trabajador, Nº sesiones, Total cobrado, Total diferencias, Diferencia media, Diferencia máxima, Sesiones sin diferencia (%)
8. **Comparativa** (NORMAL+) — Diferencias totales vs periodo anterior
9. **Rankings** (NORMAL+):
   - Repartidor con más diferencias
   - Repartidor con menos diferencias
   - PDV con mayor diferencia acumulada
   - Turno con mayor incidencia
10. **Alertas** (PRO):
    - Diferencia de caja superior a umbral (€)
    - Trabajador con diferencias recurrentes
    - Sesión de caja abierta demasiado tiempo
    - Patrón de diferencias sospechoso
11. **Insights** (PRO):
    - "El repartidor X tiene diferencias 3x superiores a la media. Revisa procedimiento de cobro"

**Conexión con datos existentes:**
- Backend ya tiene `driver_cash_session` y `tpv_register_session` en `deliveryRouter.js` / `couchdb.js`
- Campos relevantes: `motivoDiferencia`, estado de apertura/cierre, importes

**Registro en catálogo:** Categoría `finanzas`:
```
{ id: 'caja-diferencias', nombre: 'Caja y diferencias', nivel: 'base', disponible: true, vertical: 'delivery', descripcion: 'Arqueos, diferencias y conciliación de caja' }
```

---

### INF-07 · Refactorizar InformeIncidenciasDelivery al patrón completo

**Prioridad:** Media  
**Tipo:** Mejora  
**Archivo:** `src-delivery/app/components/informes/InformeIncidenciasDelivery.tsx`

**Estado actual:**  
Componente básico con KPIs, gráfico por tipo, barras diarias y tabla por responsable. Sin filtros, sin niveles, sin alertas.

**Cambios requeridos:**

1. **Header** — `InformesHeader` con exportación
2. **Filtros** — Periodo, Sede/PDV, Canal, Tipo incidencia (multiselección), Trabajador
3. **Nivel de análisis** — Base / Normal / Pro
4. **KPIs** (4 cards con `KPICardInforme`):
   - Total incidencias + variación
   - Tasa resolución (%) + variación
   - Tiempo medio resolución (min) + variación
   - Incidencias / 100 pedidos + variación
5. **Gráfico principal** con agrupaciones:
   - Por periodo: evolución diaria/semanal
   - Por tipo: pie/barras con distribución
   - Por canal: barras mostrando en qué canal hay más incidencias
   - Por responsable: barras con incidencias gestionadas y tiempo medio
6. **Detalle** — Tabla completa: Fecha/hora, Nº pedido, Canal, Tipo incidencia, Descripción, Responsable, T. resolución, Estado, Acción tomada
7. **Comparativa** (NORMAL+)
8. **Rankings** (NORMAL+): Responsable más rápido, canal con más incidencias, tipo más frecuente, día/hora con más incidencias
9. **Alertas** (PRO): Pico de incidencias, tipo de incidencia recurrente, responsable con tiempos altos
10. **Insights** (PRO)

---

### INF-08 · Sistema de filtros avanzados para delivery

**Prioridad:** Alta  
**Tipo:** Nuevo componente  
**Archivo:** `src-delivery/app/components/informes/InformesFiltersDelivery.tsx`

**Descripción:**  
Extensión del componente `InformesFilters` con los filtros específicos de delivery que necesitan todos los informes de este vertical.

**Filtros a incluir:**

1. **Periodo** — Selector estándar (ya existe en `InformesFilters`)
2. **Sede / PDV** — Multiselección con checkboxes (ya existe como select simple, ampliar a multiselección)
3. **Canal** — NUEVO. Checkboxes multiselección:
   - Directo / TPV
   - Glovo
   - Uber Eats
   - Just Eat
   - Web propia
   - Teléfono
   - App propia
4. **Trabajador** — NUEVO. Selector múltiple:
   - Dropdown searchable con lista de empleados
   - Filtro por puesto (cocina / montaje / reparto / caja)
   - "Todos" por defecto
5. **Fechas personalizadas** — Ya existe
6. **Botón reset** — Ya existe

**Diseño:**
- **Móvil:** Periodo visible + botón filtros que despliega panel. Badge con nº de filtros activos
- **Desktop:** Fila horizontal con todos los filtros inline. Dropdowns con checkboxes para canal y trabajador
- Mismo estilo visual que `InformesFilters` existente
- Props para color del tema (para que cada informe use su color)

**Criterios de aceptación:**
- Funciona standalone y reemplaza `InformesFilters` en todos los informes delivery
- Los filtros emiten callbacks `onChange` para que cada informe filtre sus datos
- Responsive con breakpoint md (768px)

---

### INF-09 · Sistema de alertas delivery en informes

**Prioridad:** Alta  
**Tipo:** Nuevo componente + lógica  
**Archivos:**
- `src-delivery/app/components/informes/InformesAlertasDelivery.tsx` (componente UI)
- `src-delivery/app/lib/alertasInformesDelivery.ts` (lógica de detección)

**Descripción:**  
Motor de alertas que analiza los datos del informe activo y genera alertas automáticas contextuales. Las alertas son UI-only por ahora (se calculan sobre los datos cargados del informe).

**Tipos de alerta a implementar:**

| ID | Alerta | Condición | Severidad |
|----|--------|-----------|-----------|
| A01 | Caída de ventas | Ventas del periodo < X% vs periodo anterior | Alta |
| A02 | Margen bajo | Margen neto por canal < umbral configurado | Alta |
| A03 | Canal baja rentabilidad | Canal con margen < X% | Media |
| A04 | Tiempos cocina disparados | Tiempo medio cocina > umbral (ej. 20 min) | Alta |
| A05 | Tiempos reparto disparados | Tiempo medio reparto > umbral | Alta |
| A06 | Trabajador productividad baja | Pedidos/hora < X% de la media del equipo | Media |
| A07 | Trabajador productividad anómala alta | Pedidos/hora > 2σ de la media (posible error datos) | Baja |
| A08 | Diferencias de caja | Diferencia acumulada > umbral | Alta |
| A09 | Comisiones elevadas | Comisiones de un canal > X% de ventas | Media |
| A10 | Concentración de canal | Un canal > X% del total ventas | Baja |
| A11 | Producto estrella en declive | Top producto con caída >X% | Media |
| A12 | Ticket medio descendente | Ticket medio < X% vs periodo anterior | Media |

**Componente UI (reutilizable):**
```tsx
<InformesAlertasDelivery
  alertas={alertasDetectadas}
  onDismiss={(id) => ...}
  onConfigUmbral={(alertaId) => ...}
/>
```

- Cada alerta muestra: icono de severidad, título, descripción con datos, acción sugerida
- Colores por severidad: rojo (alta), naranja (media), azul (baja)
- Botón para configurar umbrales
- Solo visible en nivel PRO

---

### INF-10 · Permisos por rol (gerente vs trabajador)

**Prioridad:** Alta  
**Tipo:** Lógica transversal  
**Archivos:**
- `src-delivery/app/components/sections/Informes.tsx`
- Todos los informes delivery
- `src-delivery/app/context/AppContext.tsx` (lectura del rol)

**Descripción:**  
Implementar control de visibilidad en informes según el rol del usuario.

**Reglas de visibilidad:**

| Sección / Dato | Gerente | Trabajador |
|-----------------|---------|------------|
| Catálogo completo de informes | Todos | Solo los autorizados |
| Ventas totales del negocio | Sí | No |
| Rentabilidad global | Sí | No |
| Margen por canal | Sí | No |
| Comisiones plataformas | Sí | No |
| Datos de caja (global) | Sí | No |
| Datos operativos propios | Sí | Sí (si se autoriza) |
| Datos operativos de otros | Sí | No |
| Rankings de trabajadores | Sí | No (solo posición propia) |
| Alertas | Todas | Solo las que le afectan |
| Informes de equipo | Sí | Solo ficha propia |
| Tiempos operativos globales | Sí | Sí (si se autoriza) |
| Productos top | Sí | Sí (operativo) |

**Implementación:**
1. Leer `userRole` del `AppContext` (ya existe `'gerente' | 'trabajador'`)
2. En `Informes.tsx`: filtrar catálogo según rol (añadir campo `rolesPermitidos` a `InformeDefinicion`)
3. En cada informe: prop `userRole` que controla qué secciones/datos se muestran
4. Componente wrapper `<ConPermisoInforme rol={rol} requiere="rentabilidad">` que oculta contenido
5. Si un trabajador accede a una sección no autorizada, mostrar card explicativo: "Esta sección es visible solo para gerentes. Contacta con tu responsable."

**Criterios de aceptación:**
- Cambiar rol en la demo alterna correctamente lo que se ve
- Un trabajador NO puede ver rentabilidad, márgenes ni comisiones de plataformas
- Un trabajador SÍ puede ver sus propios tiempos y pedidos gestionados (si se autoriza)

---

### INF-11 · Navegación entre secciones (conexiones)

**Prioridad:** Media  
**Tipo:** Nuevo componente  
**Archivo:** `src-delivery/app/components/informes/InformesConexiones.tsx`

**Descripción:**  
Barra o panel de navegación rápida que conecta los informes con las secciones operativas relacionadas.

**Conexiones requeridas:**
- **Dashboard** — "Ver dashboard general" → Sección `dashboard`
- **Pedidos** — "Ver pedidos en curso" → Sección `operativa` > tab Pedidos
- **Cocina** — "Ver cola de cocina" → Sección `operativa` > tab Cocina
- **Reparto** — "Ver repartidores activos" → Sección `operativa` > tab Reparto
- **Caja** — "Ver sesiones de caja" → Sección `operativa` > tab Caja
- **Finanzas** — "Ver resumen financiero" → Sección `finanzas`
- **Equipo** — "Ver gestión de equipo" → Sección `equipo`

**Diseño:**
- Barra horizontal al final de cada informe (o en el header) con chips/botones de navegación rápida
- Cada botón tiene icono + texto corto + nombre de sección
- Navegación vía `useApp().setCurrentSection()`
- Solo mostrar conexiones relevantes al informe actual (ej: informe de tiempos → Cocina y Reparto)

**Implementación:**
- Componente reutilizable que acepta array de conexiones
- Cada informe define sus conexiones relevantes

---

### INF-12 · Automatización de informes (programación y envío)

**Prioridad:** Media  
**Tipo:** Nuevo componente  
**Archivo:** `src-delivery/app/components/informes/InformesAutomatizacion.tsx`

**Descripción:**  
Panel para configurar la generación y envío automático de informes diarios, semanales y mensuales.

**Funcionalidades:**

1. **Lista de informes programados** — Tabla con: Informe, Frecuencia, Destinatarios, Próximo envío, Estado (activo/pausado), Acciones
2. **Crear programación** — Modal/formulario:
   - Seleccionar informe(s) del catálogo
   - Frecuencia: Diario (a las X), Semanal (día y hora), Mensual (día del mes y hora)
   - Filtros predefinidos (sede, canal, periodo a cubrir)
   - Formato: PDF, Excel, o ambos
   - Destinatarios: emails (pueden ser externos)
   - Asunto personalizable
3. **Vista previa** — Botón para generar una previa del informe con la configuración actual
4. **Historial de envíos** — Últimos envíos con estado (enviado, error, pendiente)

**Estado actual del backend:**
- `alertEngine.js` ya tiene infraestructura de cron y notificaciones
- No existe endpoint de generación de informes programados — se necesitará en el futuro
- Por ahora: UI completa con datos mock, preparada para conectar

**Diseño:**
- Accesible desde el catálogo de informes (botón "Programar informes" en el header)
- Card con resumen de informes programados activos
- Solo visible para rol gerente

---

### INF-13 · Actualización en tiempo real con SSE

**Prioridad:** Baja  
**Tipo:** Integración  
**Archivos:**
- `src-delivery/app/hooks/useInformesSSE.ts` (nuevo hook)
- Informes que requieran tiempo real

**Descripción:**  
Hook para suscribirse a eventos SSE del backend y actualizar los datos del informe activo en tiempo real.

**Eventos a escuchar:**
- `delivery:order:created` — Nuevo pedido → actualizar contadores de ventas
- `delivery:order:status_changed` — Cambio de estado → actualizar tiempos operativos
- `delivery:order:completed` — Pedido completado → actualizar métricas de venta y tiempos finales
- `delivery:cash_session:updated` — Actualización de caja → refrescar datos de caja
- `delivery:alert:triggered` — Nueva alerta → añadir a la lista de alertas del informe

**Implementación:**
```tsx
const { datos, alertas, ultimaActualizacion } = useInformesSSE({
  informeId: 'ventas-delivery',
  filtros: { sede, canal, periodo }
});
```

**Indicador visual:**
- Punto verde pulsante en el header cuando hay datos en tiempo real
- Timestamp "Última actualización: hace X segundos"
- Opción de pausar/reanudar tiempo real

**Prerrequisitos:**
- Backend ya tiene `/api/sse` con infraestructura SSE
- Falta emitir eventos específicos de delivery desde el controller

---

### INF-14 · Registrar nuevos informes en catálogo y navegación

**Prioridad:** Alta (hacer después de crear cada informe)  
**Tipo:** Configuración  
**Archivos:**
- `src-delivery/app/data/informes-catalogo.ts`
- `src-delivery/app/components/sections/Informes.tsx`

**Descripción:**  
Cada informe nuevo (INF-03, INF-04, INF-05, INF-06) debe registrarse en:

1. **`informes-catalogo.ts`** — Añadir entrada en la categoría correcta con `vertical: 'delivery'`:
   - `ventas-delivery` → categoría `negocio`
   - `productos-top-delivery` → categoría `negocio`
   - `ventas-trabajador` → categoría `equipo`
   - `caja-diferencias` → categoría `finanzas`

2. **`Informes.tsx`** — Añadir import y condición `if (informeAbierto === 'ID')` para cada nuevo informe

3. **Verificar** que el filtro por `vertical === 'delivery'` funciona correctamente

**Orden de categorías actualizado:**
- **Negocio:** Actividad del negocio, **Ventas Delivery** (NUEVO), Ticket medio, Volumen operaciones, Rendimiento Delivery, Canales de venta, **Productos Top** (NUEVO), Incidencias Delivery, ...
- **Finanzas:** Ingresos, Gastos, Margen, **Caja y diferencias** (NUEVO), Flujo de caja, ...
- **Equipo:** Fichajes, Horas trabajadas, **Ventas por trabajador** (NUEVO), Asistencia y absentismo, ...

---

## Orden de implementación recomendado

### Fase 1 — Fundamentos (hacer primero)
1. **INF-08** Filtros delivery → Base para todos los informes
2. **INF-10** Permisos por rol → Transversal, afecta a todo

### Fase 2 — Informes core (máximo valor)
3. **INF-03** Ventas Delivery → Informe central, mayor impacto
4. **INF-01** Refactorizar Rendimiento Delivery → Tiempos operativos
5. **INF-02** Refactorizar Canales + Rentabilidad → Canal y comisiones
6. **INF-06** Caja y Diferencias → Control financiero diario

### Fase 3 — Informes complementarios
7. **INF-04** Productos Top → Valor analítico medio
8. **INF-05** Ventas por Trabajador → Productividad equipo
9. **INF-07** Refactorizar Incidencias → Completar patrón

### Fase 4 — Infraestructura avanzada
10. **INF-09** Alertas delivery → Detección automática
11. **INF-11** Navegación entre secciones → UX
12. **INF-14** Registrar en catálogo → Integración final

### Fase 5 — Automatización (futuro)
13. **INF-12** Automatización informes → Programación y envío
14. **INF-13** Tiempo real SSE → Datos en vivo

---

## Notas técnicas

- **Datos:** Todos los informes usan datos mock por ahora. La estructura de datos debe ser compatible con lo que devolverá la API real (`deliveryApi.ts`)
- **Backend existente:** `deliveryRouter.js` tiene endpoints de pedidos y sesiones de caja. Falta endpoint de agregaciones/métricas delivery
- **Componentes compartidos:** Reutilizar al máximo `InformesHeader`, `KPICardInforme`, `ChartControls`, `InformesNivelAnalisis`
- **Recharts:** Librería de gráficos ya instalada y usada en todo el proyecto
- **Responsive:** Todos los informes deben funcionar bien en móvil (380px+) y desktop
- **Patrón de referencia:** `InformeTicketMedio.tsx` (1009 líneas, patrón completo)
