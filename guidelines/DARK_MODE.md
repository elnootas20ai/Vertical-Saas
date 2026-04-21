# Modo Oscuro — Guía de implementación

## Arquitectura

El modo oscuro se basa en tres capas:

| Capa | Archivo | Responsabilidad |
|------|---------|-----------------|
| Variables CSS | `src/styles/theme.css` | Define las custom properties (`--background`, `--foreground`, etc.) para `:root` (claro) y `.dark` (oscuro) |
| Overrides nativos | `src/styles/dark-mode.css` | Corrige elementos del navegador que no heredan custom properties: `<select>`, inputs de fecha, autofill de Chrome, portales de Radix UI, tablas, calendario, etc. |
| Proveedor React | `src/app/App.tsx` | `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>` añade/quita la clase `.dark` en `<html>` |

## Cómo funciona el toggle

- **Topbar** (`src/app/components/saas/Topbar.tsx`): botón sol/luna visible en escritorio.
  - Usa `resolvedTheme` (no `theme`) para mostrar el icono correcto incluso cuando el tema está en modo "sistema".
  - Al cambiar el tema añade `.theme-transitioning` al `<html>` durante 300 ms para activar las transiciones CSS suaves, luego la elimina.
- **Settings → Apariencia** (`src/app/pages/saas/Settings.tsx`, función `TabApariencia`): selector de tres opciones — Claro / Oscuro / Sistema.

## Variables CSS disponibles

```css
--background          /* fondo base de la página */
--foreground          /* texto principal */
--card                /* fondo de tarjetas */
--card-foreground     /* texto sobre tarjetas */
--popover             /* fondo de dropdowns, menus, popovers */
--popover-foreground  /* texto en popover */
--primary             /* color de acción primaria */
--primary-foreground
--secondary
--secondary-foreground
--muted               /* fondos apagados (chips, badges suaves) */
--muted-foreground    /* textos de ayuda */
--accent              /* hover/focus sobre items de lista */
--accent-foreground
--destructive         /* rojo de acciones peligrosas */
--destructive-foreground
--border              /* bordes generales */
--input               /* fondo transparente de inputs */
--input-background    /* fondo real del input */
--ring                /* color del focus ring */
--sidebar, --sidebar-foreground, --sidebar-primary, etc.
```

Todas las variables de Tailwind se mapean en el bloque `@theme inline` de `theme.css`.

## Convenciones en componentes

### ✅ Correcto — usar variables CSS / clases de Tailwind con variante dark
```tsx
// Variables CSS (se actualizan solas al cambiar tema)
className="bg-card text-card-foreground border-border"

// Utilidades de Tailwind con dark:
className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
```

### ❌ Incorrecto — colores hardcoded sin variante dark
```tsx
// No hacer esto en componentes SaaS:
className="bg-white text-gray-900"

// Excepción válida: botones blancos sobre fondos de gradiente de color
// (ej: WorkerClock, WorkerHome) — el blanco es intencional para contraste.
```

## Elementos nativos del navegador

Los elementos `<select>`, `<option>`, `input[type="date"]`, `input[type="time"]` y el autofill de Chrome **no heredan custom properties CSS**. Se corrigen explícitamente en `dark-mode.css` sección 2, 3 y 3b.

## Portales de Radix UI

Los portales de Radix (Select, DropdownMenu, Popover, Tooltip, Dialog, Sheet) renderizan en `document.body`. Como `.dark` se aplica a `<html>`, los portales **sí heredan** las custom properties por cascada. No obstante, `dark-mode.css` añade selectores explícitos (`[data-slot="select-content"]`, etc.) para mayor robustez ante versiones futuras de Radix.

## Transición suave

La clase `.theme-transitioning` en `dark-mode.css` aplica `transition` a todas las propiedades de color durante el cambio de tema. Se activa programáticamente en `Topbar.tsx` y se elimina tras 300 ms para no interferir con otras animaciones de la UI.

## Impresión

La sección `@media print` en `dark-mode.css` fuerza siempre el esquema claro al imprimir, independientemente del tema activo.

## Accesibilidad (WCAG 2.1 AA)

Las luminosidades definidas en `.dark` de `theme.css` garantizan los siguientes ratios de contraste mínimos:

| Par de colores | Ratio aproximado |
|---------------|-----------------|
| `--foreground` sobre `--background` | ≥ 12:1 |
| `--muted-foreground` sobre `--background` | ≥ 4.6:1 |
| `--primary` sobre `--primary-foreground` | ≥ 9:1 |
| `--destructive-foreground` sobre `--destructive` | ≥ 5:1 |

## Pruebas recomendadas

1. Activar modo oscuro desde **Settings → Apariencia** o el icono de la barra superior.
2. Verificar todos los desplegables (`<Select>`, `<DropdownMenu>`, `<Popover>`).
3. Verificar inputs de fecha/hora y autofill del navegador.
4. Verificar el buscador global (⌘K).
5. Verificar tablas, calendarios y modales.
6. Probar en Chrome, Firefox y Safari (macOS/iOS).
7. Probar con preferencia de sistema en modo oscuro (`prefers-color-scheme: dark`) y la opción "Sistema" activa.
8. Usar las herramientas de accesibilidad de Chrome DevTools para validar el contraste.
