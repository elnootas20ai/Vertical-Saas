# 🎯 Mejoras UX para Planificación Horaria - UDAR 360

## 📸 Análisis de las Capturas

Basándome en las 3 capturas proporcionadas, he identificado problemas críticos de UX que afectan la productividad del gerente.

---

## ❌ **PROBLEMAS DETECTADOS**

### **1. SCROLL EXCESIVO (Crítico)**
```
Problema:
┌────────────────────────────────┐
│ Header (Centro + Semana)       │ ← Usuario empieza aquí
│ Objetivos de Ventas (grande)   │
│ Grid de trabajadores           │
│ Resumen                        │
│ Incidencias                    │
│                                │
│ [Copiar] [Guardar] [Publicar] │ ← Usuario debe scrollear hasta aquí
└────────────────────────────────┘

Impacto:
- Cada vez que edita un turno, debe scrollear abajo para guardar
- Feedback visual (Borrador/Publicado) está arriba, lejos
- Ciclo de edición lento: editar → scroll → guardar → scroll
```

**Propuesta:**
```tsx
// Barra de acciones STICKY en la parte superior (no inferior)
<div className="sticky top-0 z-50 bg-white border-b-2 shadow-md">
  <div className="flex items-center justify-between p-3">
    <div className="flex items-center gap-2">
      <Badge>Borrador</Badge>
      {hasChanges && <Badge variant="warning">Sin guardar</Badge>}
    </div>
    <div className="flex gap-2">
      <Button size="sm">Copiar Semana</Button>
      <Button size="sm">Guardar</Button>
      <Button size="sm">Publicar</Button>
    </div>
  </div>
</div>
```

---

### **2. OBJETIVOS DE VENTAS DEMASIADO GRANDES (Medio)**
```
Problema:
Las 7 tarjetas de objetivos ocupan ~300px de altura
Son solo CONTEXTO, pero tienen el protagonismo visual

Actual:
┌───────────────────────────────────┐
│ Lun  Mar  Mié  Jue  Vie  Sáb  Dom│
│3500€ 3200€ 3000€ 3800€ 4500€ ...  │
│█████ █████ ████ █████ █████ ...   │
│3200€ 3100€ 2800€ 3500€ 4200€ ...  │
│ ✓    ✓    ~    ✓    ✓   ...      │
└───────────────────────────────────┘
         ↓ 300px de altura
```

**Propuesta: Modo Compacto**
```tsx
// Objetivos en una sola fila compacta
<div className="grid grid-cols-7 gap-1 p-2 bg-blue-50 rounded-lg">
  {salesObjectives.map(day => (
    <div className="text-center p-2">
      <p className="text-xs text-gray-600">{day.short}</p>
      <p className="text-numeric font-bold">{day.objective}€</p>
      <span className="text-xs">{getStatusIcon(day.status)}</span>
    </div>
  ))}
</div>

// Ahorro: de 300px → 80px (220px menos)
```

---

### **3. FALTA DE FEEDBACK VISUAL EN TIEMPO REAL (Crítico)**
```
Problema:
El usuario edita → no sabe si se guardó
El usuario publica → no ve confirmación persistente
El usuario añade turnos → no ve progreso total

Actual:
[Edita turno] → ... → ¿Se guardó? → Scroll abajo → Ver badge
```

**Propuesta: Sidebar Flotante (Desktop)**
```tsx
// Sidebar fijo a la derecha con resumen en vivo
<div className="fixed right-4 top-24 w-64 bg-white border-2 rounded-lg shadow-xl p-4">
  <h3 className="text-sm font-bold mb-3">Resumen Semanal</h3>
  
  {/* Progreso de planificación */}
  <div className="mb-4">
    <div className="flex justify-between text-xs mb-1">
      <span>Progreso</span>
      <span className="font-bold">85%</span>
    </div>
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div className="bg-green-500 h-2 rounded-full" style={{width: '85%'}} />
    </div>
    <p className="text-xs text-gray-500 mt-1">
      28 turnos de 35 asignados
    </p>
  </div>
  
  {/* Horas por día */}
  <div className="space-y-1">
    {weekDays.map((day, idx) => (
      <div className="flex justify-between text-xs">
        <span>{day.short}</span>
        <span className="text-numeric">{dailyTotals[idx]}h</span>
      </div>
    ))}
  </div>
  
  {/* Estado */}
  <div className="mt-4 pt-4 border-t">
    {hasChanges ? (
      <Badge variant="warning" className="w-full">
        Cambios sin guardar
      </Badge>
    ) : (
      <Badge variant="success" className="w-full">
        Todo guardado
      </Badge>
    )}
  </div>
</div>
```

---

### **4. AÑADIR TURNO ES LENTO (Medio)**
```
Problema:
Click "+ Añadir turno" → Modal → Seleccionar horas → Guardar
Para cada turno: 4-5 clicks

Actual:
1. Click "+ Añadir turno"
2. Modal se abre
3. Click hora inicio
4. Seleccionar hora
5. Click hora fin
6. Seleccionar hora
7. Click "Añadir Turno"
```

**Propuesta: Plantillas Rápidas**
```tsx
// Botón con dropdown de plantillas
<div className="relative group">
  <button className="text-xs px-2 py-1 bg-blue-50 rounded border border-blue-300">
    + Turno rápido ▼
  </button>
  
  {/* Dropdown con plantillas */}
  <div className="absolute hidden group-hover:block bg-white border shadow-lg">
    <button onClick={() => addShift('09:00', '13:00')}>
      Mañana (09-13) · 4h
    </button>
    <button onClick={() => addShift('16:00', '20:00')}>
      Tarde (16-20) · 4h
    </button>
    <button onClick={() => addShift('09:00', '17:00')}>
      Completo (09-17) · 8h
    </button>
    <button onClick={() => openCustomModal()}>
      Personalizado...
    </button>
  </div>
</div>

// Ahorro: De 7 clicks → 2 clicks (70% más rápido)
```

---

### **5. NO HAY AUTO-SAVE (Crítico)**
```
Problema:
Si el gerente cierra la pestaña sin guardar → pierde todo

Riesgo:
- Perder 30 min de trabajo
- Frustración del usuario
- Desconfianza en el sistema
```

**Propuesta: Auto-guardado + Indicador**
```tsx
const [autoSaving, setAutoSaving] = useState(false);
const [lastSaved, setLastSaved] = useState<Date | null>(null);

// Auto-save cada 30 segundos
useEffect(() => {
  if (hasChanges) {
    const timer = setTimeout(() => {
      setAutoSaving(true);
      // Guardar en localStorage o backend
      saveDraft(schedules);
      setAutoSaving(false);
      setLastSaved(new Date());
      setHasChanges(false);
    }, 30000); // 30 segundos
    
    return () => clearTimeout(timer);
  }
}, [hasChanges, schedules]);

// Indicador visual
<div className="flex items-center gap-2 text-xs text-gray-600">
  {autoSaving && (
    <>
      <Loader className="size-3 animate-spin" />
      <span>Guardando...</span>
    </>
  )}
  {lastSaved && !autoSaving && (
    <>
      <CheckCircle2 className="size-3 text-green-600" />
      <span>Guardado {formatRelativeTime(lastSaved)}</span>
    </>
  )}
</div>
```

---

### **6. INCIDENCIAS OCULTAS (Bajo)**
```
Problema:
"3 incidencias esta semana" está colapsado
El gerente puede perderlas

Actual:
▼ Incidencias y Cambios de Último Momento [3]
  [Click para ver]
```

**Propuesta: Alerta Visual Destacada**
```tsx
{incidents.length > 0 && (
  <div className="bg-orange-100 border-2 border-orange-400 rounded-lg p-4">
    <div className="flex items-start gap-3">
      <AlertTriangle className="size-5 text-orange-600 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-bold text-orange-900">
          ⚠️ {incidents.length} incidencias esta semana
        </p>
        <div className="mt-2 space-y-1">
          {incidents.slice(0, 2).map(inc => (
            <p className="text-xs text-orange-800">
              • {inc.employee}: {inc.short} ({inc.date})
            </p>
          ))}
          {incidents.length > 2 && (
            <button className="text-xs text-orange-600 underline">
              Ver todas ({incidents.length})
            </button>
          )}
        </div>
      </div>
    </div>
  </div>
)}
```

---

### **7. COPIAR TURNO ENTRE DÍAS (Medio)**
```
Problema:
Para copiar un turno de Lunes a Martes:
1. Memorizar turno
2. Click "+ Añadir"
3. Escribir mismo turno

Debería ser: Drag & Drop
```

**Propuesta: Drag & Drop**
```tsx
// Turno draggable
<div
  draggable
  onDragStart={(e) => {
    e.dataTransfer.setData('shift', JSON.stringify(shift));
    e.dataTransfer.setData('employeeId', employeeId);
  }}
  className="cursor-move bg-blue-50 border border-blue-200 rounded p-2"
>
  <p className="text-xs font-semibold">09:00 - 13:00</p>
</div>

// Celda droppable
<td
  onDrop={(e) => {
    e.preventDefault();
    const shiftData = JSON.parse(e.dataTransfer.getData('shift'));
    const sourceEmployeeId = e.dataTransfer.getData('employeeId');
    
    // Copiar turno
    copyShift(sourceEmployeeId, dayIndex, shiftData);
  }}
  onDragOver={(e) => e.preventDefault()}
  className="relative"
>
  {/* Indicator cuando está over */}
  <div className="absolute inset-0 bg-blue-200 opacity-0 hover:opacity-30" />
</td>
```

---

## ✨ **RESUMEN DE PROPUESTAS**

### **PRIORIDAD ALTA (Implementar YA)**

1. **Sticky Action Bar Superior**
   - Botones siempre visibles
   - Indicador de estado (guardado/sin guardar)
   - Evita scroll constante

2. **Auto-guardado**
   - Cada 30 segundos
   - Indicador visual de estado
   - Previene pérdida de datos

3. **Objetivos Compactos**
   - Reducir de 300px → 80px
   - Liberar espacio vertical
   - Mantener información visible

### **PRIORIDAD MEDIA (Implementar Siguiente Sprint)**

4. **Sidebar de Resumen Flotante (Desktop)**
   - Resumen en tiempo real
   - Progreso de planificación
   - Sin necesidad de scroll

5. **Plantillas de Turnos Rápidas**
   - Dropdown con turnos frecuentes
   - De 7 clicks → 2 clicks
   - Ahorro del 70% del tiempo

6. **Drag & Drop para Copiar Turnos**
   - Copiar entre días
   - Copiar entre trabajadores
   - UX intuitiva

### **PRIORIDAD BAJA (Nice to Have)**

7. **Incidencias Destacadas**
   - Alerta visual si > 0 incidencias
   - No colapsado por defecto
   - Mostrar primeras 2-3

8. **Atajos de Teclado**
   - `Ctrl+S` → Guardar
   - `Ctrl+Enter` → Publicar
   - `Esc` → Cerrar modal

---

## 📊 **IMPACTO ESPERADO**

### **Antes (Estado Actual)**
```
Tiempo para planificar semana completa (4 trabajadores × 7 días):
- Añadir 28 turnos: 28 × 15 seg = 7 min
- Scroll constante: 3 min
- Guardar/verificar: 2 min
= TOTAL: ~12 minutos
```

### **Después (Con Mejoras)**
```
Tiempo con mejoras:
- Plantillas rápidas: 28 × 5 seg = 2.3 min
- Sin scroll (sticky bar): 0 min
- Auto-save: 0 min
= TOTAL: ~2-3 minutos

AHORRO: 75% del tiempo (9 minutos menos)
```

---

## 🎯 **IMPLEMENTACIÓN SUGERIDA**

### **Fase 1: Quick Wins (1-2 días)**
```tsx
// 1. Sticky action bar superior
// 2. Objetivos compactos
// 3. Auto-save básico
```

### **Fase 2: Mejoras UX (3-5 días)**
```tsx
// 4. Sidebar flotante de resumen
// 5. Plantillas rápidas
// 6. Indicadores de progreso
```

### **Fase 3: Features Avanzadas (1 semana)**
```tsx
// 7. Drag & Drop
// 8. Atajos de teclado
// 9. Animaciones y feedback
```

---

## ✅ **CHECKLIST DE VALIDACIÓN**

Antes de dar por finalizada la mejora, verificar:

- [ ] Los botones de acción están siempre visibles
- [ ] El usuario ve feedback inmediato al editar
- [ ] Se puede añadir un turno en menos de 5 segundos
- [ ] El auto-guardado funciona y se indica visualmente
- [ ] No se requiere scroll para ver el estado
- [ ] Los objetivos de ventas son visibles pero discretos
- [ ] Las incidencias son imposibles de pasar por alto
- [ ] El resumen está siempre disponible sin scroll

---

## 🚀 **RESULTADO FINAL ESPERADO**

Una ventana de planificación que:

✅ **Ahorra tiempo** - 75% más rápida  
✅ **Evita errores** - Auto-guardado + feedback visual  
✅ **Reduce fricción** - Sin scroll, sticky actions  
✅ **Aumenta confianza** - El gerente siempre sabe el estado  
✅ **Es intuitiva** - Plantillas, drag & drop, atajos  

---

**Documento creado:** Enero 2025  
**Basado en:** Análisis de capturas de pantalla reales  
**Objetivo:** Convertir UDAR 360 en el SaaS más eficiente de gestión de horarios
