# Reglas de buenas prácticas de programación

Este documento define el estándar obligatorio para trabajar en el proyecto.

## 1) CSS Modules con jerarquía clara

### Estructura recomendada

| Nivel | Convención | Ejemplo |
| --- | --- | --- |
| Componente | Un archivo por componente | `Button.module.css` |
| Sección | Estilos de pantalla por módulo | `Dashboard.module.css` |
| Layout | Estilos de estructura global por layout | `LayoutResponsive.module.css` |
| Utilidades locales | Clases auxiliares internas del módulo | `.container`, `.header`, `.actions` |

### Reglas

- Cada componente debe tener su estilo encapsulado cuando el estilo sea específico.
- Evitar estilos globales para comportamiento local de componentes.
- Nombrar clases con intención de negocio/UI, no con aspecto visual ambiguo.

## 2) `index.css` con variables de color

### Política

- Los colores del sistema se definen como variables CSS en `:root`.
- Modo oscuro usa sobreescritura de variables en `.dark`.
- Componentes consumen tokens (`var(--primary)`, etc.), no colores hardcodeados.

### Ejemplo base

| Tipo | Variable |
| --- | --- |
| Fondo | `--background` |
| Texto | `--foreground` |
| Primario | `--primary` |
| Borde | `--border` |
| Estados | `--destructive`, `--muted`, `--accent` |

## 3) Uso de `camelCase` en inglés

- Variables, funciones, props, hooks y estado: `camelCase`.
- Nombres deben estar en inglés y describir intención funcional.
- Componentes React en `PascalCase`.
- Prohibido mezclar español e inglés en identificadores nuevos.

## 4) Código limpio y sin ruido (obligatorio)

| Regla | Estado |
| --- | --- |
| No se permiten comentarios de código (`//`, `/* */`) | Obligatorio |
| No se permiten `console.log` en código final | Obligatorio |
| Eliminar imports no usados | Obligatorio |
| Eliminar estilos no usados | Obligatorio |
| Eliminar variables/componentes no usados | Obligatorio |
| Optimizar legibilidad, rendimiento y mantenimiento | Obligatorio |

## 5) Reutilización y modularidad

- Si un componente ya existe, se reutiliza antes de crear uno nuevo.
- Modularizar repeticiones en componentes compartidos.
- Mantener las mismas props cuando ya hay un patrón aceptado.
- No crear props nuevas si ya existe una estructura validada en el proyecto.

## 6) Checklist antes de merge

- Sin comentarios de código.
- Sin `console.log`.
- Sin código muerto.
- Nombres en inglés y `camelCase`.
- Sin duplicaciones evitables.
- Uso de componentes existentes siempre que aplique.
