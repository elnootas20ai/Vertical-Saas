# 🎨 Sistema Tipográfico UDAR 360

## 📐 Tipografías Base

### **Inter** - Tipografía Principal
- **Uso:** Todo el texto de la interfaz
- **Pesos disponibles:** 300, 400, 500, 600, 700, 800
- **Características:** Legible, moderna, optimizada para UI

### **Inter Tight** - Títulos Destacados
- **Uso:** Títulos principales de módulos y páginas
- **Pesos disponibles:** 600, 700, 800
- **Fallback:** Si no está disponible, usa Inter Semibold
- **Características:** Condensada, impacto visual, profesional

---

## 📊 Jerarquía Visual

### **Nivel 1: Títulos de Módulo (h1)**
```css
font-family: Inter Tight
font-size: 24px (1.5rem)
font-weight: 700 (Bold)
line-height: 1.25
letter-spacing: -0.025em
```
**Uso:** Dashboard, Equipo, Finanzas, Operativa

**Ejemplo:**
```tsx
<h1 className="text-2xl font-bold">Equipo</h1>
```

---

### **Nivel 2: Subtítulos de Sección (h2)**
```css
font-family: Inter
font-size: 20px (1.25rem)
font-weight: 600 (Semibold)
line-height: 1.375
letter-spacing: -0.025em
```
**Uso:** Secciones dentro de módulos, encabezados de tarjetas principales

**Ejemplo:**
```tsx
<h2 className="text-xl font-semibold">Trabajadores (23)</h2>
```

---

### **Nivel 3: Subtítulos Menores (h3)**
```css
font-family: Inter
font-size: 18px (1.125rem)
font-weight: 600 (Semibold)
line-height: 1.375
```
**Uso:** Títulos de componentes, modales, paneles laterales

**Ejemplo:**
```tsx
<h3 className="text-lg font-semibold">Datos Personales</h3>
```

---

### **Nivel 4: Títulos de Componentes (h4)**
```css
font-family: Inter
font-size: 16px (1rem)
font-weight: 500 (Medium)
line-height: 1.5
```
**Uso:** Tarjetas, listas, elementos UI pequeños

**Ejemplo:**
```tsx
<h4 className="text-base font-medium">Configuración General</h4>
```

---

## 🔤 Texto UI

### **Texto Base (p)**
```css
font-family: Inter
font-size: 16px (1rem)
font-weight: 400 (Regular)
line-height: 1.625
```
**Uso:** Párrafos, descripciones, contenido general

**Ejemplo:**
```tsx
<p className="text-base text-gray-600">
  Gestión de trabajadores, horarios y documentación laboral
</p>
```

---

### **Texto Secundario**
```css
font-family: Inter
font-size: 14px (0.875rem)
font-weight: 400 (Regular)
color: oklch(0.708 0 0) [gris medio]
```
**Uso:** Metadatos, información complementaria, fechas

**Ejemplo:**
```tsx
<p className="text-sm text-secondary">Última actualización: 10 Ene 2025</p>
```

---

### **Labels y Etiquetas**
```css
font-family: Inter
font-size: 14px (0.875rem)
font-weight: 500 (Medium)
line-height: 1.5
```
**Uso:** Labels de formularios, etiquetas de campos

**Ejemplo:**
```tsx
<label className="text-sm font-medium text-gray-700">
  Nombre Completo
</label>
```

---

## 🔢 Números y KPIs

### **Números Estándar (.text-numeric)**
```css
font-family: Inter
font-weight: 600 (Semibold)
font-variant-numeric: tabular-nums
letter-spacing: -0.025em
```
**Uso:** Horas, euros, cantidades en tablas

**Ejemplo:**
```tsx
<span className="text-numeric">40h</span>
<span className="text-numeric">2,400€</span>
```

---

### **KPIs Destacados (.text-kpi)**
```css
font-family: Inter Tight
font-weight: 700 (Bold)
font-variant-numeric: tabular-nums
letter-spacing: -0.05em
```
**Uso:** Dashboard, objetivos de ventas, métricas destacadas

**Ejemplo:**
```tsx
<div className="text-3xl text-kpi text-blue-900">
  3,500€
</div>
```

---

## 🎯 Casos de Uso Específicos

### **Botones**
```tsx
// Botón primario
<Button className="font-semibold">
  Publicar Horarios
</Button>

// Botón secundario
<Button variant="secondary" className="font-medium">
  Guardar Borrador
</Button>
```

---

### **Inputs y Formularios**
```tsx
// Input normal
<input className="text-base font-normal" />

// Label del input
<label className="text-sm font-medium text-gray-700">
  Email
</label>
```

---

### **Badges y Pills**
```tsx
// Badge estándar
<Badge className="text-xs font-medium">
  Activo
</Badge>

// Badge con número
<Badge className="text-xs font-semibold">
  23 trabajadores
</Badge>
```

---

### **Tablas**
```tsx
// Header de tabla
<th className="text-xs font-semibold uppercase tracking-wide">
  Trabajador
</th>

// Celda de tabla - texto
<td className="text-sm font-normal text-gray-900">
  Carlos Martínez
</td>

// Celda de tabla - número
<td className="text-sm text-numeric">
  40h
</td>
```

---

### **Objetivos de Ventas (Caso Real)**
```tsx
<div className="text-center">
  {/* Día */}
  <p className="text-xs font-medium text-gray-700">Lun 8</p>
  
  {/* Objetivo - KPI destacado */}
  <p className="text-xl text-kpi text-gray-900">
    3,500€
  </p>
  
  {/* Comparativa - texto secundario */}
  <p className="text-xs text-secondary">
    3,200€ sem. ant.
  </p>
</div>
```

---

### **Detalle de Trabajador (Caso Real)**
```tsx
{/* Título del panel */}
<h2 className="text-2xl font-bold text-gray-900">
  {employee.name}
</h2>

{/* Subtítulo/Rol */}
<p className="text-base text-gray-600">
  {employee.role}
</p>

{/* Label de campo */}
<label className="text-xs font-medium text-gray-500">
  Nombre Completo
</label>

{/* Valor del campo */}
<p className="text-sm text-gray-900">
  Carlos Martínez
</p>

{/* Salario - número destacado */}
<p className="text-sm text-numeric font-semibold">
  2,400€/mes
</p>
```

---

### **Header de Módulo (Caso Real)**
```tsx
<div>
  {/* Título del módulo - Display */}
  <h1 className="text-2xl font-bold text-gray-900">
    Equipo
  </h1>
  
  {/* Descripción del módulo */}
  <p className="text-sm text-gray-500 mt-1">
    Gestión de trabajadores, horarios y documentación laboral
  </p>
</div>
```

---

## 🎨 Clases Utility de Tailwind

### **Tamaños de Texto**
```tsx
text-xs      // 12px - Metadatos, labels pequeños
text-sm      // 14px - Texto UI secundario
text-base    // 16px - Texto base
text-lg      // 18px - Subtítulos, destacados
text-xl      // 20px - Subtítulos de sección
text-2xl     // 24px - Títulos principales
text-3xl     // 30px - Títulos destacados
text-4xl     // 36px - Hero titles
```

---

### **Pesos de Fuente**
```tsx
font-light      // 300 - Uso muy específico
font-normal     // 400 - Texto base
font-medium     // 500 - Labels, énfasis medio
font-semibold   // 600 - Botones, subtítulos
font-bold       // 700 - Títulos principales
font-extrabold  // 800 - KPIs, números destacados
```

---

### **Line Heights**
```tsx
leading-tight    // 1.25  - Títulos compactos
leading-snug     // 1.375 - Subtítulos
leading-normal   // 1.5   - Texto UI estándar
leading-relaxed  // 1.625 - Párrafos legibles
leading-loose    // 2     - Espaciado amplio
```

---

## ✅ Mejores Prácticas

### **✓ HACER:**
- Usar Inter como base para toda la UI
- Usar Inter Tight solo para títulos principales (h1)
- Usar `.text-numeric` para todos los números (€, h, unidades)
- Usar `.text-kpi` para métricas destacadas del Dashboard
- Mantener consistencia en pesos: Medium (labels), Semibold (botones), Bold (títulos)
- Usar `tabular-nums` para alineación de números en tablas

### **✗ NO HACER:**
- NO usar múltiples familias tipográficas (solo Inter/Inter Tight)
- NO usar pesos extremos innecesariamente (light/extrabold)
- NO mezclar estilos de títulos
- NO usar texto demasiado pequeño (<12px) para contenido principal
- NO ignorar la jerarquía visual establecida

---

## 🚀 Implementación en Código

### **Importación Automática**
Las fuentes se importan automáticamente vía `fonts.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600;700;800&display=swap');
```

### **Variables CSS Disponibles**
```css
--font-base: 'Inter', ...
--font-display: 'Inter Tight', 'Inter', ...

--text-xs: 0.75rem
--text-sm: 0.875rem
--text-base: 1rem
--text-lg: 1.125rem
--text-xl: 1.25rem
--text-2xl: 1.5rem
--text-3xl: 1.875rem

--font-weight-normal: 400
--font-weight-medium: 500
--font-weight-semibold: 600
--font-weight-bold: 700
```

---

## 📱 Responsive Typography

### **Mobile (<768px)**
```tsx
<h1 className="text-xl md:text-2xl font-bold">
  Título del Módulo
</h1>
```

### **Tablet (768-1024px)**
```tsx
<h1 className="text-xl lg:text-2xl font-bold">
  Título del Módulo
</h1>
```

### **Desktop (≥1024px)**
Usar tamaños completos sin restricciones.

---

## 🎯 Resultado Final

El sistema tipográfico de **UDAR 360** transmite:

✨ **Profesionalidad** - Inter es la tipografía de referencia en SaaS  
✨ **Claridad** - Jerarquía visual bien definida  
✨ **Escalabilidad** - Sistema consistente y mantenible  
✨ **Legibilidad** - Optimizado para interfaces de gestión  
✨ **Modernidad** - Diseño actual y atemporal  

---

**Última actualización:** Enero 2025  
**Sistema tipográfico unificado para todo UDAR 360** ✅
