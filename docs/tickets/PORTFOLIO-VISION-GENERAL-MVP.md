# Visión general CEO — backlog vivo

**Página:** `/saas/dashboard` → Todas las empresas  
**Actualizado:** 2026-08-04

## Jerarquía UI (rectora)

urgente → agregado → tendencia → detalle

1. **Barra** — título + contadores Críticas / Atención  
2. **Hero 2 col** — feed alertas por severidad | portafolio consolidado (ingresos, caja, dotación, barras)  
3. **Semana vs semana** — tarjeta por empresa (mejora / empeora / igual)  
4. **Mapa riesgo × tamaño** — scatter 4 cuadrantes  
5. **Signos vitales** — grilla con filtros Todas / Crítico / Atención / Estable  
6. **Drawer** — detalle empresa/alerta sin perder contexto  

## Datos

- Alertas: `useCeoAlertFeed` (summary + top unresolved)  
- Riesgo/salud: `ceoVisionModel` (alertas + MoM + pendiente + equipo)  
- Semana vs semana: snapshot localStorage semanal  
- Color marca: `primaryColor` de marca o hash estable  

## Archivos

- `GeneralDashboard.tsx`
- `portfolio/ceo/CeoVisionDashboard.tsx`
- `portfolio/ceo/ceoVisionModel.ts`
- `portfolio/ceo/useCeoAlertFeed.ts`
