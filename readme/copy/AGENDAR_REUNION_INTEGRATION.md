# 📅 INTEGRACIÓN: AGENDAR REUNIÓN DESDE CHATS

## 🎯 OBJETIVO
Permitir que desde una conversación en Chats se pueda agendar una reunión directamente, abriendo el modal de calendario con los asistentes pre-cargados.

## ✅ ESTADO ACTUAL (PREPARADO)

### 1. **AppContext** - Listo ✓
```typescript
// /src/app/context/AppContext.tsx

interface AppContextType {
  scheduleMeetingData: { attendees: string[]; fromChat: boolean } | null;
  scheduleMeetingWithContact: (contactName: string) => void;
  clearScheduleMeetingData: () => void;
}
```

**Funcionalidad:**
- `scheduleMeetingData`: Contiene los asistentes pre-cargados y un flag indicando que viene desde chat
- `scheduleMeetingWithContact(contactName)`: Setea los datos y navega a 'agendar-reunion'
- `clearScheduleMeetingData()`: Limpia los datos después de crear el evento

### 2. **ChatsGerente** - Listo ✓
```typescript
// /src/app/components/sections/gerente/ChatsGerente.tsx

// Menú desplegable (⋮) en header del chat
<button onClick={() => {
  scheduleMeetingWithContact(conversacionSeleccionada.nombre);
  setShowMenuOpciones(false);
}}>
  <Calendar className="size-4" />
  Agendar reunión
</button>
```

**Ubicación:** Menú de tres puntos (⋮) en el header de cada conversación personal  
**Comportamiento actual:** 
1. Llama a `scheduleMeetingWithContact(nombreContacto)`
2. Navega automáticamente a la sección 'agendar-reunion'
3. LayoutResponsive renderiza `<CalendarioGerente />`

### 3. **LayoutResponsive** - Listo ✓
```typescript
// /src/app/components/layout/LayoutResponsive.tsx

case 'agendar-reunion':
  return <CalendarioGerente />;
```

---

## 🔧 SIGUIENTE PASO: INTEGRACIÓN EN CalendarioGerente

### **Modificar `/src/app/components/sections/gerente/Calendario.tsx`**

```typescript
import { useApp } from '../../../context/AppContext';

export function CalendarioGerente() {
  const { currentCompany, scheduleMeetingData, clearScheduleMeetingData } = useApp();
  const [showEventModal, setShowEventModal] = useState(false);
  
  // 🚀 NUEVO: Detectar si viene desde Chats
  useEffect(() => {
    if (scheduleMeetingData && scheduleMeetingData.fromChat) {
      setShowEventModal(true); // Abrir modal automáticamente
    }
  }, [scheduleMeetingData]);

  return (
    <div>
      {/* ... código existente ... */}
      
      {showEventModal && (
        <EventModal
          isOpen={showEventModal}
          onClose={() => {
            setShowEventModal(false);
            clearScheduleMeetingData(); // Limpiar datos al cerrar
          }}
          // 🚀 NUEVO: Pre-cargar asistentes
          defaultAttendees={scheduleMeetingData?.attendees || []}
          onSave={(newEvent) => {
            // Guardar evento...
            clearScheduleMeetingData(); // Limpiar después de guardar
          }}
        />
      )}
    </div>
  );
}
```

---

## 📝 MODIFICAR EventModal

### **Actualizar `/src/app/components/modals/EventModal.tsx`**

```typescript
interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultAttendees?: string[]; // 🚀 NUEVO
  onSave?: (event: any) => void;
}

export function EventModal({ 
  isOpen, 
  onClose, 
  defaultAttendees = [], // 🚀 NUEVO
  onSave 
}: EventModalProps) {
  const { currentUser } = useApp();
  const [asistentes, setAsistentes] = useState<string[]>([]);

  // 🚀 NUEVO: Pre-cargar asistentes cuando se abre el modal
  useEffect(() => {
    if (isOpen && defaultAttendees.length > 0) {
      // Incluir al usuario actual + el contacto del chat
      const attendeesList = [
        currentUser.name, // Usuario actual
        ...defaultAttendees // Contacto del chat
      ];
      setAsistentes(attendeesList);
    }
  }, [isOpen, defaultAttendees, currentUser]);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      {/* ... resto del modal ... */}
      
      {/* Campo de asistentes pre-cargado */}
      <div>
        <label>Asistentes</label>
        <div className="flex flex-wrap gap-2">
          {asistentes.map((asistente, index) => (
            <div key={index} className="bg-blue-100 px-3 py-1 rounded-full">
              {asistente}
              <button onClick={() => {
                setAsistentes(asistentes.filter((_, i) => i !== index));
              }}>×</button>
            </div>
          ))}
        </div>
        {/* Input para añadir más asistentes... */}
      </div>
    </Modal>
  );
}
```

---

## 🎬 FLUJO COMPLETO

```
Usuario en ChatsGerente
    ↓
Hace clic en "Agendar reunión" (menú ⋮)
    ↓
scheduleMeetingWithContact("Carlos Rodríguez")
    ↓
AppContext.scheduleMeetingData = {
  attendees: ["Carlos Rodríguez"],
  fromChat: true
}
    ↓
setCurrentSection("agendar-reunion")
    ↓
LayoutResponsive renderiza <CalendarioGerente />
    ↓
useEffect detecta scheduleMeetingData.fromChat === true
    ↓
setShowEventModal(true) → Abre modal automáticamente
    ↓
EventModal recibe defaultAttendees=["Carlos Rodríguez"]
    ↓
useEffect en EventModal pre-carga asistentes:
  - "Juan García" (usuario actual)
  - "Carlos Rodríguez" (contacto del chat)
    ↓
Usuario completa el formulario y guarda
    ↓
clearScheduleMeetingData() → Limpia el estado
```

---

## 🔗 INTEGRACIÓN CON SUPABASE (FUTURO)

### **📊 ESTRUCTURA DE BASE DE DATOS**

```sql
-- Tabla de eventos
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  location TEXT,
  description TEXT,
  company_id UUID REFERENCES companies(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de asistentes (relación muchos a muchos)
CREATE TABLE event_attendees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  user_name TEXT, -- Para usuarios que no están en el sistema
  status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'declined'
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);
```

### **🔄 CÓMO SE VERÁ EN AMBOS CALENDARIOS**

#### **Ejemplo práctico:**
```
Juan García (Gerente) agenda reunión con Carlos Rodríguez (Trabajador)
         ↓
Se crea evento:
  - title: "Revisión de objetivos"
  - date: "2026-01-15"
  - created_by: juan_id
         ↓
Se crean 2 registros en event_attendees:
  1. { event_id: evento_123, user_id: juan_id, status: 'accepted' }
  2. { event_id: evento_123, user_id: carlos_id, status: 'pending' }
         ↓
CALENDARIO DE JUAN (Gerente):
  - Ve el evento porque es created_by
  - Ve el evento porque está en event_attendees
  - Status: "Confirmado" (created_by siempre es 'accepted')
         ↓
CALENDARIO DE CARLOS (Trabajador):
  - Ve el evento porque está en event_attendees
  - Status: "Pendiente de confirmar"
  - Puede aceptar/rechazar la invitación
```

### **💻 CÓDIGO PARA GUARDAR EVENTO**

Cuando se implemente Supabase, el flujo será:

```typescript
const handleSaveEvent = async (eventData) => {
  const { currentUser } = useApp();
  
  // 1. Crear evento en Supabase
  const { data: newEvent } = await supabase
    .from('events')
    .insert({
      title: eventData.title,
      date: eventData.date,
      time: eventData.time,
      location: eventData.location,
      description: eventData.description,
      company_id: currentCompany.id,
      created_by: currentUser.id
    })
    .select()
    .single();

  // 2. Obtener IDs de los asistentes por nombre
  const { data: users } = await supabase
    .from('users')
    .select('id, name')
    .in('name', asistentes); // asistentes = ["Juan García", "Carlos Rodríguez"]

  // 3. Añadir asistentes a la tabla event_attendees
  const attendeesData = users.map(user => ({
    event_id: newEvent.id,
    user_id: user.id,
    user_name: user.name,
    status: user.id === currentUser.id ? 'accepted' : 'pending' // Creador auto-acepta
  }));

  await supabase
    .from('event_attendees')
    .insert(attendeesData);

  // 4. Enviar notificaciones a los asistentes (excepto al creador)
  const otherAttendees = users.filter(u => u.id !== currentUser.id);
  await Promise.all(
    otherAttendees.map(attendee => 
      supabase.from('notifications').insert({
        user_id: attendee.id,
        type: 'event_invitation',
        title: `Nueva reunión: ${eventData.title}`,
        message: `${currentUser.name} te ha invitado a una reunión`,
        event_id: newEvent.id,
        read: false
      })
    )
  );

  // 5. Limpiar estado
  clearScheduleMeetingData();
  onClose();
};
```

### **📋 CÓDIGO PARA CARGAR EVENTOS EN CALENDARIO**

```typescript
// En CalendarioGerente.tsx o CalendarioTrabajador.tsx

const loadEvents = async () => {
  const { currentUser } = useApp();
  
  // Cargar eventos donde el usuario es asistente O creador
  const { data: eventos } = await supabase
    .from('events')
    .select(`
      *,
      event_attendees!inner(user_id, status)
    `)
    .or(`created_by.eq.${currentUser.id},event_attendees.user_id.eq.${currentUser.id}`)
    .eq('company_id', currentCompany.id)
    .order('date', { ascending: true });

  setEventos(eventos);
};

// ✅ Esto asegura que AMBOS usuarios vean el evento:
// - Juan lo ve porque created_by = juan_id
// - Carlos lo ve porque está en event_attendees con user_id = carlos_id
```

### **🎨 VISUALIZACIÓN EN CALENDARIO**

```typescript
// Renderizar evento con indicador visual

const renderEvento = (evento) => {
  const { currentUser } = useApp();
  const isCreator = evento.created_by === currentUser.id;
  const myAttendance = evento.event_attendees.find(a => a.user_id === currentUser.id);
  
  return (
    <div className={`evento ${
      isCreator ? 'border-l-4 border-blue-500' : 'border-l-4 border-green-500'
    }`}>
      <h3>{evento.title}</h3>
      <p>{evento.time}</p>
      
      {/* Indicador de rol */}
      {isCreator && <Badge>Organizador</Badge>}
      {!isCreator && myAttendance && (
        <Badge color={
          myAttendance.status === 'accepted' ? 'green' :
          myAttendance.status === 'declined' ? 'red' : 'yellow'
        }>
          {myAttendance.status === 'pending' ? 'Pendiente' : 
           myAttendance.status === 'accepted' ? 'Confirmado' : 'Rechazado'}
        </Badge>
      )}
      
      {/* Botones de acción solo si NO eres el organizador */}
      {!isCreator && myAttendance?.status === 'pending' && (
        <div className="flex gap-2 mt-2">
          <Button onClick={() => acceptEvent(evento.id)}>Aceptar</Button>
          <Button onClick={() => declineEvent(evento.id)}>Rechazar</Button>
        </div>
      )}
    </div>
  );
};
```

---

## ✅ RESPUESTA A LA PREGUNTA: "¿Se verá en el calendario de ambos?"

### **SÍ, ABSOLUTAMENTE ✓**

Cuando Juan García (Gerente) agenda una reunión con Carlos Rodríguez (Trabajador):

#### **📅 Calendario de Juan:**
```
┌──────────────────────────────────────┐
│ Revisión de objetivos                │
│ 15 Ene • 14:00 - 15:00              │
│ 📍 Sala de Juntas                    │
│ 👤 Organizador                       │
│ 👥 Carlos Rodríguez (Pendiente)     │
└──────────────────────────────────────┘
```

#### **📅 Calendario de Carlos:**
```
┌──────────────────────────────────────┐
│ Revisión de objetivos                │
│ 15 Ene • 14:00 - 15:00              │
│ 📍 Sala de Juntas                    │
│ 👤 Invitado por: Juan García         │
│ ⚠️ Pendiente de confirmar            │
│ [Aceptar] [Rechazar]                 │
└──────────────────────────────────────┘
```

### **📊 RESUMEN:**

| Aspecto | Juan (Gerente) | Carlos (Trabajador) |
|---------|----------------|---------------------|
| **Ve el evento** | ✅ SÍ | ✅ SÍ |
| **Rol** | Organizador | Invitado |
| **Status inicial** | Confirmado | Pendiente |
| **Puede editar** | ✅ SÍ | ❌ NO |
| **Puede eliminar** | ✅ SÍ | ❌ NO |
| **Puede aceptar/rechazar** | ❌ NO | ✅ SÍ |
| **Recibe notificación** | ❌ NO | ✅ SÍ |

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

- [x] AppContext con scheduleMeetingData
- [x] scheduleMeetingWithContact() en AppContext
- [x] Botón "Agendar reunión" en ChatsGerente
- [x] Routing 'agendar-reunion' en LayoutResponsive
- [ ] useEffect en CalendarioGerente para abrir modal
- [ ] defaultAttendees prop en EventModal
- [ ] Pre-carga de asistentes en EventModal
- [ ] clearScheduleMeetingData() después de guardar
- [ ] Integración con Supabase (tabla events)
- [ ] Integración con Supabase (tabla event_attendees)
- [ ] Sistema de notificaciones a asistentes

---

## 📌 NOTAS IMPORTANTES

1. **Solo para chats personales:** El botón "Agendar reunión" NO aparece en canales (solo en conversaciones 1-a-1)
2. **Asistentes por defecto:** Siempre incluye al usuario actual + el contacto del chat
3. **Limpieza de estado:** Importante llamar a `clearScheduleMeetingData()` al cerrar o guardar el modal
4. **Navegación:** La función `scheduleMeetingWithContact` ya cambia automáticamente la sección
5. **Disponible en ambos perfiles:** La funcionalidad está implementada tanto en ChatsGerente como en ChatsTrabajador

---

## 🎨 UX/UI

**Menú desplegable en ChatsGerente:**
```
┌────────────────────────────┐
│ ⭐ Fijar conversación       │
│ 📅 Agendar reunión    ← NEW │
│ 🔇 Silenciar notificaciones │
├────────────────────────────┤
│ ❌ Eliminar conversación    │
└────────────────────────────┘
```

**Modal de Calendario (pre-cargado):**
```
┌─────────────────────────────────────┐
│  Crear Evento                   [X] │
├─────────────────────────────────────┤
│  Título: [                        ] │
│  Fecha:  [   11/01/2026          ] │
│  Hora:   [   14:00               ] │
│  Asistentes:                        │
│    [Juan García] [Carlos Rodríguez] │
│    + Añadir asistente               │
│                                     │
│           [Cancelar]  [Guardar]     │
└─────────────────────────────────────┘
```

---

## 📞 SOPORTE TÉCNICO

Para cualquier duda sobre esta implementación, consultar:
- `/src/app/context/AppContext.tsx` (líneas 11-17, 31, 55-62)
- `/src/app/components/sections/gerente/ChatsGerente.tsx` (líneas 946-955)
- `/src/app/components/layout/LayoutResponsive.tsx` (líneas 78-79)