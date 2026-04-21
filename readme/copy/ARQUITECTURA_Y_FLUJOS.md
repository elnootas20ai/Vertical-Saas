# 🏗️ ARQUITECTURA Y FLUJOS DE DATOS - UDAR 360

**Diagramas visuales y flujos de integración**

---

## 📐 ARQUITECTURA GENERAL

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Components  │  │   Sections   │  │    Modals    │          │
│  │  (UI Layer)  │  │  (Pages)     │  │              │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│         └──────────────────┴──────────────────┘                  │
│                            │                                     │
│                  ┌─────────▼─────────┐                          │
│                  │  Custom Hooks     │                          │
│                  │  (useEmployees,   │                          │
│                  │   useSchedules)   │                          │
│                  └─────────┬─────────┘                          │
│                            │                                     │
│                  ┌─────────▼─────────┐                          │
│                  │  React Query      │                          │
│                  │  (Cache & State)  │                          │
│                  └─────────┬─────────┘                          │
│                            │                                     │
│                  ┌─────────▼─────────┐                          │
│                  │  Services Layer   │                          │
│                  │  (employees.svc,  │                          │
│                  │   schedules.svc)  │                          │
│                  └─────────┬─────────┘                          │
│                            │                                     │
│                  ┌─────────▼─────────┐                          │
│                  │  Supabase Client  │                          │
│                  └─────────┬─────────┘                          │
└────────────────────────────┼─────────────────────────────────────┘
                             │
                             │ HTTPS / WebSocket
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│                      SUPABASE (Backend)                          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  PostgreSQL  │  │  Supabase    │  │   Supabase   │          │
│  │   Database   │  │    Auth      │  │   Storage    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│         │ Row Level Security (RLS)            │                  │
│         │                  │                  │                  │
│  ┌──────▼──────────────────▼──────────────────▼───────┐          │
│  │              Supabase Realtime                     │          │
│  │         (WebSocket para chats y notif.)            │          │
│  └────────────────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🔄 FLUJO DE DATOS: CREAR EMPLEADO

```
┌──────────────┐
│   Usuario    │
│  (Gerente)   │
└──────┬───────┘
       │
       │ 1. Click "Añadir Empleado"
       ▼
┌──────────────────────────┐
│  AddEmployeeModal.tsx    │
│  (Formulario UI)         │
└──────┬───────────────────┘
       │
       │ 2. Fill form & Submit
       ▼
┌──────────────────────────────┐
│  useCreateEmployee() hook    │
│  (React Query Mutation)      │
└──────┬───────────────────────┘
       │
       │ 3. mutateAsync(employeeData)
       ▼
┌──────────────────────────────┐
│  employeesService.create()   │
│  (Service Layer)             │
└──────┬───────────────────────┘
       │
       │ 4. supabase.from('employees').insert(...)
       ▼
┌──────────────────────────────┐
│  Supabase PostgreSQL         │
│  + RLS Policy Check          │
└──────┬───────────────────────┘
       │
       │ 5. Return created employee
       ▼
┌──────────────────────────────┐
│  React Query Cache Update    │
│  - Invalidate ['employees']  │
│  - Show toast notification   │
└──────┬───────────────────────┘
       │
       │ 6. UI Auto-refresh
       ▼
┌──────────────────────────────┐
│  Equipo.tsx re-renders       │
│  with new employee in list   │
└──────────────────────────────┘
```

---

## 🔐 FLUJO DE AUTENTICACIÓN

```
┌──────────────┐
│   Usuario    │
│  (Login)     │
└──────┬───────┘
       │
       │ 1. Enter email & password
       ▼
┌──────────────────────────┐
│  Login Form Component    │
└──────┬───────────────────┘
       │
       │ 2. handleLogin()
       ▼
┌──────────────────────────┐
│  useAuth() hook          │
│  login.mutateAsync()     │
└──────┬───────────────────┘
       │
       │ 3. authService.login(email, password)
       ▼
┌──────────────────────────────────┐
│  Supabase Auth                   │
│  - Verify credentials            │
│  - Generate JWT token            │
│  - Create session                │
└──────┬───────────────────────────┘
       │
       │ 4. Return user + access_token
       ▼
┌──────────────────────────────────┐
│  React Query Cache               │
│  - Store user in ['auth','user'] │
└──────┬───────────────────────────┘
       │
       │ 5. Trigger onAuthStateChange
       ▼
┌──────────────────────────────────┐
│  AppContext.tsx                  │
│  - Set currentUser               │
│  - Set currentCompany            │
│  - Determine userRole            │
└──────┬───────────────────────────┘
       │
       │ 6. Redirect to dashboard
       ▼
┌──────────────────────────────────┐
│  Protected Routes                │
│  - Show dashboard                │
│  - All API calls now include JWT │
└──────────────────────────────────┘
```

---

## 📅 FLUJO DE PLANIFICACIÓN HORARIA

```
┌──────────────┐
│   Gerente    │
└──────┬───────┘
       │
       │ 1. Open "Planificación Horaria"
       ▼
┌────────────────────────────────────┐
│  PlanificacionHorariaGeneralMejorada.tsx │
└──────┬─────────────────────────────┘
       │
       │ 2. useSchedules(companyId, year, week)
       ▼
┌────────────────────────────────────┐
│  schedulesService.getByWeek()      │
│  - Fetch from database             │
└──────┬─────────────────────────────┘
       │
       │ 3. Return existing schedules
       ▼
┌────────────────────────────────────┐
│  UI: Show calendar grid            │
│  - Days of week (columns)          │
│  - Employees (rows)                │
│  - Existing shifts displayed       │
└──────┬─────────────────────────────┘
       │
       │ 4. Click on cell to add shift
       ▼
┌────────────────────────────────────┐
│  AddShiftModal opens               │
│  - Select start/end time           │
│  - Calculate hours                 │
└──────┬─────────────────────────────┘
       │
       │ 5. Save shift (local state)
       ▼
┌────────────────────────────────────┐
│  Local state updated               │
│  - Mark hasChanges = true          │
│  - Show "Guardar Borrador" button  │
└──────┬─────────────────────────────┘
       │
       │ 6. Click "Guardar Borrador"
       ▼
┌────────────────────────────────────┐
│  useCreateSchedulesBulk()          │
│  - Send ALL schedules to DB        │
│  - Status: 'borrador'              │
└──────┬─────────────────────────────┘
       │
       │ 7. Saved successfully
       ▼
┌────────────────────────────────────┐
│  UI: Show success toast            │
│  - hasChanges = false              │
│  - lastSaved = now                 │
└──────┬─────────────────────────────┘
       │
       │ 8. Click "Publicar Horarios"
       ▼
┌────────────────────────────────────┐
│  usePublishSchedules()             │
│  - Update status to 'publicado'    │
│  - Send notification to employees  │
└──────┬─────────────────────────────┘
       │
       │ 9. Published!
       ▼
┌────────────────────────────────────┐
│  Employees can now view schedules  │
│  in their "Calendario" section     │
└────────────────────────────────────┘
```

---

## 💬 FLUJO DE CHAT EN TIEMPO REAL

```
┌──────────────┐                    ┌──────────────┐
│  Usuario A   │                    │  Usuario B   │
└──────┬───────┘                    └──────┬───────┘
       │                                   │
       │ 1. Open chat channel              │
       ▼                                   ▼
┌────────────────────┐            ┌────────────────────┐
│  ChatsGerente.tsx  │            │  ChatsTrabajador   │
└──────┬─────────────┘            └──────┬─────────────┘
       │                                   │
       │ 2. useMessages(channelId)         │
       ▼                                   ▼
┌────────────────────────────────────────────────────┐
│  chatsService.getMessages(channelId)               │
│  - Fetch last 50 messages                          │
└──────┬─────────────────────────────────────────────┘
       │
       │ 3. Return messages
       ▼
┌────────────────────────────────────────────────────┐
│  UI: Display messages                              │
└──────┬─────────────────────────────────────────────┘
       │
       │ 4. Subscribe to Realtime (in useEffect)
       ▼
┌────────────────────────────────────────────────────┐
│  supabase.channel(`chat-${channelId}`)             │
│  .on('postgres_changes', ...)                      │
│  .subscribe()                                      │
└──────┬─────────────────────────────────────────────┘
       │
       │ Usuario A types and sends message
       ▼
┌────────────────────┐
│  useSendMessage()  │
└──────┬─────────────┘
       │
       │ 5. chatsService.sendMessage(channelId, message)
       ▼
┌────────────────────────────────────────────────────┐
│  Supabase PostgreSQL                               │
│  INSERT into chats_messages                        │
└──────┬─────────────────────────────────────────────┘
       │
       │ 6. Trigger postgres_changes event
       ▼
┌────────────────────────────────────────────────────┐
│  Supabase Realtime broadcasts to all subscribers   │
└──────┬──────────────────────────────────┬──────────┘
       │                                   │
       │ 7. Receive event                  │ 7. Receive event
       ▼                                   ▼
┌────────────────────┐            ┌────────────────────┐
│  Usuario A         │            │  Usuario B         │
│  - Update cache    │            │  - Update cache    │
│  - Show message    │            │  - Show message    │
│  - Play sound?     │            │  - Play sound?     │
│  - Notification    │            │  - Notification    │
└────────────────────┘            └────────────────────┘
```

---

## 📁 FLUJO DE SUBIDA DE DOCUMENTOS

```
┌──────────────┐
│   Usuario    │
└──────┬───────┘
       │
       │ 1. Click "Subir Documento"
       ▼
┌──────────────────────────┐
│  File Input Dialog       │
└──────┬───────────────────┘
       │
       │ 2. Select file
       ▼
┌──────────────────────────┐
│  Validate file           │
│  - Size < 5MB?           │
│  - Type allowed?         │
└──────┬───────────────────┘
       │
       │ 3. If valid, upload
       ▼
┌──────────────────────────┐
│  storageService.upload() │
│  (Service Layer)         │
└──────┬───────────────────┘
       │
       │ 4. supabase.storage.from('documents').upload()
       ▼
┌──────────────────────────────┐
│  Supabase Storage            │
│  - Store file in bucket      │
│  - Generate path             │
└──────┬───────────────────────┘
       │
       │ 5. Return file path
       ▼
┌──────────────────────────────┐
│  documentsService.create()   │
│  - Save metadata to DB       │
│  - file_url = path           │
└──────┬───────────────────────┘
       │
       │ 6. Document record created
       ▼
┌──────────────────────────────┐
│  React Query Cache           │
│  - Invalidate ['documents']  │
└──────┬───────────────────────┘
       │
       │ 7. UI refreshes
       ▼
┌──────────────────────────────┐
│  Document appears in list    │
└──────────────────────────────┘
```

---

## 🔒 ROW LEVEL SECURITY (RLS)

### Ejemplo: Política para tabla `employees`

```sql
-- Policy 1: Gerentes pueden ver empleados de sus empresas
CREATE POLICY "gerentes_view_employees"
ON employees FOR SELECT
USING (
  company_id IN (
    SELECT uc.company_id 
    FROM user_companies uc
    WHERE uc.user_id = auth.uid() 
    AND uc.role IN ('gerente', 'admin')
  )
);

-- Policy 2: Trabajadores solo ven su propia información
CREATE POLICY "trabajadores_view_self"
ON employees FOR SELECT
USING (
  email = auth.email()
);

-- Policy 3: Solo gerentes pueden crear/editar empleados
CREATE POLICY "gerentes_manage_employees"
ON employees FOR ALL
USING (
  company_id IN (
    SELECT uc.company_id 
    FROM user_companies uc
    WHERE uc.user_id = auth.uid() 
    AND uc.role = 'gerente'
  )
);
```

### Flujo de verificación RLS

```
┌──────────────┐
│   Request    │
│  (with JWT)  │
└──────┬───────┘
       │
       │ 1. Extract user_id from JWT (auth.uid())
       ▼
┌──────────────────────────┐
│  PostgreSQL RLS Engine   │
└──────┬───────────────────┘
       │
       │ 2. Check USING clause
       │    - Is user_id in user_companies?
       │    - Does role = 'gerente'?
       │    - Does company_id match?
       ▼
┌──────────────────────────┐
│  Decision                │
│  ✅ Allow  OR  ❌ Deny   │
└──────┬───────────────────┘
       │
       │ If ✅ Allow
       ▼
┌──────────────────────────┐
│  Return filtered data    │
│  (only allowed rows)     │
└──────────────────────────┘
```

---

## 📊 ESTADO Y CACHE CON REACT QUERY

```
┌─────────────────────────────────────────────────────────┐
│                   React Query Cache                     │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │ ['employees','1']│  │ ['schedules',    │            │
│  │                  │  │  '1','2026','2'] │            │
│  │ Status: success  │  │                  │            │
│  │ Data: [...]      │  │ Status: success  │            │
│  │ StaleTime: 5min  │  │ Data: [...]      │            │
│  └──────────────────┘  └──────────────────┘            │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │ ['auth','user']  │  │ ['vacations',    │            │
│  │                  │  │  'pending']      │            │
│  │ Status: success  │  │                  │            │
│  │ Data: {...}      │  │ Status: loading  │            │
│  │ StaleTime: 5min  │  │ Data: undefined  │            │
│  └──────────────────┘  └──────────────────┘            │
└─────────────────────────────────────────────────────────┘
                │
                │ Automatic background refetch
                │ when stale
                ▼
┌─────────────────────────────────────────────────────────┐
│              Supabase API Calls                         │
└─────────────────────────────────────────────────────────┘
```

### Invalidación en cascada

```
Mutation: createEmployee()
    │
    ├─> Invalidate ['employees', companyId]
    │   └─> Triggers refetch of employee list
    │
    ├─> Invalidate ['dashboard', 'stats']
    │   └─> Update dashboard KPIs
    │
    └─> Invalidate ['notifications']
        └─> Show new notification
```

---

## 🎭 PERMISOS Y ROLES

```
┌─────────────────────────────────────────────────────┐
│                 Permission Matrix                   │
├─────────────────┬────────────┬────────────┬─────────┤
│     Action      │   Admin    │  Gerente   │ Trabaj. │
├─────────────────┼────────────┼────────────┼─────────┤
│ View Employees  │     ✅     │     ✅     │    ❌   │
│ Create Employee │     ✅     │     ✅     │    ❌   │
│ Edit Employee   │     ✅     │     ✅     │    ❌   │
│ Delete Employee │     ✅     │     ✅     │    ❌   │
│ View Schedules  │     ✅     │     ✅     │    ✅   │
│ Edit Schedules  │     ✅     │     ✅     │    ❌   │
│ Publish Scheds  │     ✅     │     ✅     │    ❌   │
│ Approve Vacats  │     ✅     │     ✅     │    ❌   │
│ Request Vacats  │     ✅     │     ✅     │    ✅   │
│ Approve Expense │     ✅     │     ✅     │    ❌   │
│ Submit Expense  │     ✅     │     ✅     │    ✅   │
│ View Financials │     ✅     │     ✅     │    ❌   │
│ Check In/Out    │     ✅     │     ✅     │    ✅   │
│ Adjust Fichaje  │     ✅     │     ✅     │    ❌   │
└─────────────────┴────────────┴────────────┴─────────┘
```

---

## 🔄 SINCRONIZACIÓN MULTI-DISPOSITIVO

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Desktop    │         │   Tablet     │         │    Mobile    │
│   Browser    │         │   Browser    │         │   Browser    │
└──────┬───────┘         └──────┬───────┘         └──────┬───────┘
       │                        │                        │
       │ User edits schedule    │                        │
       │ on desktop             │                        │
       ▼                        │                        │
┌────────────────┐              │                        │
│  Save to DB    │              │                        │
└──────┬─────────┘              │                        │
       │                        │                        │
       │ Trigger invalidation   │                        │
       ▼                        ▼                        ▼
┌──────────────────────────────────────────────────────────┐
│           Supabase Realtime (WebSocket)                  │
│         broadcasts "data changed" event                  │
└──────┬───────────────────────────────┬─────────┬─────────┘
       │                               │         │
       │ React Query detects           │         │
       │ window focus                  │         │
       ▼                               ▼         ▼
┌──────────────┐         ┌──────────────┐   ┌──────────────┐
│  Desktop     │         │   Tablet     │   │    Mobile    │
│  Refetches   │         │  Refetches   │   │   Refetches  │
│  ✅ Synced   │         │  ✅ Synced   │   │  ✅ Synced   │
└──────────────┘         └──────────────┘   └──────────────┘
```

---

## 📱 RESPONSIVE FLOW

```
┌─────────────────────────────────────────────────────────┐
│                    Window Resize                        │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  useResponsive() hook                                   │
│  - Detect width                                         │
│  - Set isMobile, isTablet, isDesktop                    │
└──────┬──────────────────────────────────────────────────┘
       │
       ├─────────────────────┬─────────────────────┐
       │                     │                     │
       ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐     ┌──────────────┐
│   Mobile     │    │   Tablet     │     │   Desktop    │
│   ≤768px     │    │  768-1024px  │     │   ≥1024px    │
└──────┬───────┘    └──────┬───────┘     └──────┬───────┘
       │                   │                     │
       ▼                   ▼                     ▼
┌──────────────┐    ┌──────────────┐     ┌──────────────┐
│ MobileDrawer │    │ Collapsed    │     │ Full Sidebar │
│ (Hamburger)  │    │ Sidebar      │     │              │
└──────────────┘    └──────────────┘     └──────────────┘
       │                   │                     │
       ▼                   ▼                     ▼
┌──────────────┐    ┌──────────────┐     ┌──────────────┐
│ PlanificHor  │    │ PlanificHor  │     │ PlanificHor  │
│ Mobile       │    │ Mobile       │     │ Mejorada     │
└──────────────┘    └──────────────┘     └──────────────┘
```

---

## 🎯 OPTIMIZACIÓN DE QUERIES

### Estrategia de Prefetch

```
User lands on dashboard
    │
    ├─> Prefetch ['employees'] (likely next page)
    ├─> Prefetch ['schedules', currentWeek]
    └─> Prefetch ['notifications']
    
User navigates to Equipo
    │
    └─> Data already in cache! ⚡ Instant load
```

### Paginación y Lazy Loading

```
Initial load: First 20 employees
    │
    ▼
User scrolls down
    │
    ├─> Detect scroll position
    └─> If near bottom, load next 20
        │
        ▼
    Append to existing data (infinite scroll)
```

---

## ✅ CHECKLIST DE VALIDACIÓN

Usa este checklist para verificar que todo funciona:

```
[ ] Login funcional
    ├─ [ ] Redirect a dashboard después de login
    ├─ [ ] JWT token se incluye en requests
    └─ [ ] Logout limpia el cache

[ ] Empleados CRUD
    ├─ [ ] Lista carga correctamente
    ├─ [ ] Crear empleado funciona
    ├─ [ ] Editar empleado guarda cambios
    ├─ [ ] Eliminar empleado funciona
    └─ [ ] RLS previene acceso no autorizado

[ ] Horarios
    ├─ [ ] Carga horarios de la semana
    ├─ [ ] Crear turno funciona
    ├─ [ ] Editar turno funciona
    ├─ [ ] Eliminar turno funciona
    ├─ [ ] Publicar horarios cambia status
    └─ [ ] Trabajador solo ve sus horarios

[ ] Vacaciones
    ├─ [ ] Solicitar vacaciones funciona
    ├─ [ ] Aprobar/rechazar funciona
    ├─ [ ] Filtros funcionan
    └─ [ ] Notificaciones se envían

[ ] Gastos
    ├─ [ ] Crear gasto funciona
    ├─ [ ] Subir recibo a Storage funciona
    ├─ [ ] Aprobar/rechazar funciona
    └─ [ ] Visualizar recibo funciona

[ ] Fichajes
    ├─ [ ] Check-in funciona
    ├─ [ ] Check-out calcula horas
    ├─ [ ] Ajuste manual funciona
    └─ [ ] Historial se muestra

[ ] Chats
    ├─ [ ] Enviar mensaje funciona
    ├─ [ ] Realtime funciona
    ├─ [ ] Adjuntar archivo funciona
    └─ [ ] Mensajes se persisten

[ ] Documentos
    ├─ [ ] Subir documento funciona
    ├─ [ ] Listar documentos funciona
    ├─ [ ] Descargar documento funciona
    └─ [ ] Eliminar documento funciona

[ ] Responsive
    ├─ [ ] Móvil funciona correctamente
    ├─ [ ] Tablet funciona correctamente
    ├─ [ ] Desktop funciona correctamente
    └─ [ ] Transiciones suaves entre breakpoints

[ ] Performance
    ├─ [ ] Carga inicial <2s
    ├─ [ ] Navegación fluida
    ├─ [ ] Cache funciona (react-query devtools)
    └─ [ ] No memory leaks
```

---

**Con esta guía visual tienes una comprensión completa de cómo fluyen los datos en UDAR 360** 🎯

**Última actualización:** 11 de enero de 2026
