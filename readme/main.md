# Estructura principal de `src`

Este proyecto está montado como frontend React + Vite y su núcleo vive en `src/app`.

## Visión rápida

| Ruta | Rol en el proyecto | Qué contiene |
| --- | --- | --- |
| `src/main.tsx` | Punto de entrada | Monta React e importa `index.css`. |
| `src/styles/` | Estilos globales | `index.css`, `theme.css`, `tailwind.css`, `fonts.css`. |
| `src/app/App.tsx` | Composición raíz | Envuelve todo con `AppProvider` y renderiza `LayoutResponsive`. |
| `src/app/context/` | Estado global | Contexto de app (usuario, sección activa, rol, vista global/single). |
| `src/app/components/` | UI y pantallas | Layout, secciones de negocio, modales, UI base y asistentes. |
| `src/app/data/` | Datos mock y catálogos | Mock de empresa/usuarios y configuración de informes. |
| `src/app/hooks/` | Hooks reutilizables | Responsive y preferencias regionales. |
| `src/app/types.ts` y `src/app/types/` | Tipado de dominio | Entidades del negocio y tipos por módulo. |
| `src/app/utils/` | Lógica auxiliar | Reglas de CRM y RRHH. |

## Cómo está organizado `src/app/components`

| Carpeta | Uso |
| --- | --- |
| `components/layout/` | Estructura principal responsive: header, sidebar y drawer móvil. |
| `components/sections/` | Pantallas funcionales por área (dashboard, finanzas, configuración, etc.). |
| `components/sections/gerente/` | Vistas específicas del rol gerente. |
| `components/sections/trabajador/` | Vistas específicas del rol trabajador. |
| `components/sections/configuracion/` | Módulos de configuración avanzada del sistema. |
| `components/modals/` | Flujos en modal (crear, editar, operaciones de inventario, etc.). |
| `components/ui/` | Biblioteca de componentes base reutilizables. |
| `components/wizards/` | Flujos paso a paso (alta/creación guiada). |
| `components/productos/`, `rrhh/`, `dashboard/`, etc. | Módulos por dominio funcional. |

## Flujo de ejecución (de arriba a abajo)

1. `src/main.tsx` inicializa la app.
2. `src/app/App.tsx` monta `AppProvider`.
3. `LayoutResponsive` decide qué contenido pintar según:
   - rol (`gerente` o `trabajador`)
   - sección activa (`currentSection`)
   - breakpoint (desktop/tablet/mobile)
4. Las secciones consumen estado compartido de `AppContext`.

## Estado global actual

`AppContext` centraliza:

- Usuario actual y empresa actual.
- Modo de vista (`single` o `global`).
- Sección activa de navegación.
- Rol activo (cambio gerente/trabajador).
- Acciones globales (abrir chat, agendar reunión, etc.).
- Persistencia en `localStorage`.

## Diseño y estilos

- `index.css` carga las capas globales.
- `theme.css` define variables de diseño (tipografía, colores, radios, tokens).
- `tailwind.css` configura Tailwind y fuentes de escaneo.
- `fonts.css` carga familias tipográficas.

## Resumen de arquitectura

La arquitectura está orientada a producto SaaS modular:

- **Entrada mínima y limpia** (`main.tsx` + `App.tsx`).
- **Estado compartido único** (`AppContext`).
- **Render por rol/sección** en layout central.
- **Dominio separado por carpetas** dentro de `components`.
- **Sistema visual global** en `styles`.
