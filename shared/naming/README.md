# Convenciones de códigos / nombres compartidos

Aquí vive la lógica **reutilizable entre backend (Node) y frontend (Vite)** que no debe duplicarse en `services/` y `src/` por separado.

## Cómo añadir un módulo parecido

1. **Copia** `deliveryPointOfSaleCode.js` con un nombre claro del dominio, p. ej. `butcherStationCode.js`.
2. **Ajusta** solo lo que cambie: lista `*_STOP_WORDS`, longitud del prefijo, patrón del sufijo (`-01`), fallback (`PDV`, etc.).
3. **Backend:** en tu `controller`, `import { … } from '../../shared/naming/tuArchivo.js'` (ruta relativa desde `controllers/`).
4. **Frontend:** en tu `*Api.ts` o hook, reexporta o importa la misma ruta, p. ej.  
   `export { suggestNextX } from '../../../shared/naming/tuArchivo.js'`
5. **Tipos TS:** añade un `tuArchivo.d.ts` junto al `.js` con las firmas exportadas (como `deliveryPointOfSaleCode.d.ts`).

Así un futuro cambio de regla es **un solo archivo** + tipos opcionales.

## Convención de rutas

- Raíz del repo: `shared/naming/`
- Desde `controllers/fooController.js`: `../shared/naming/...`
- Desde `src/app/lib/fooApi.ts`: `../../../shared/naming/...`

## Contenido actual

| Archivo | Uso |
| --- | --- |
| `deliveryPointOfSaleCode.js` | Prefijo desde nombre del PDV + correlativo (`BAD-01`). Nombre visible: 1.er local sin sufijo, 2.º+ `Base - 02`. Usado en `deliveryController`, `deliveryApi` / Ajustes / TPV. |
