# ✅ CHECKLIST DEL PROGRAMADOR - UDAR 360

**Sprint de Integración Backend**  
**Tiempo estimado:** 15-20 días

---

## 🎯 FASE 1: SETUP INICIAL (Días 1-2)

### Día 1: Configuración Supabase
- [ ] Crear cuenta en Supabase (https://supabase.com)
- [ ] Crear nuevo proyecto
- [ ] Copiar URL y Anon Key del proyecto
- [ ] Crear archivo `.env.local` en la raíz:
  ```env
  VITE_SUPABASE_URL=https://xxx.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  ```
- [ ] Instalar dependencias:
  ```bash
  npm install @supabase/supabase-js@latest
  npm install @tanstack/react-query@latest
  npm install date-fns
  ```

### Día 2: Cliente Supabase y React Query
- [ ] Crear archivo `/src/lib/supabase.ts`:
  ```typescript
  import { createClient } from '@supabase/supabase-js'
  
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  
  export const supabase = createClient(supabaseUrl, supabaseAnonKey)
  ```

- [ ] Crear archivo `/src/lib/queryClient.ts`:
  ```typescript
  import { QueryClient } from '@tanstack/react-query'
  
  export const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutos
        retry: 1,
      },
    },
  })
  ```

- [ ] Modificar `/src/app/App.tsx` para incluir QueryClientProvider:
  ```typescript
  import { QueryClientProvider } from '@tanstack/react-query'
  import { queryClient } from '../lib/queryClient'
  
  // Wrap con QueryClientProvider
  ```

---

## 🗄️ FASE 2: BASE DE DATOS (Días 3-5)

### Día 3: Tablas Core
- [ ] En Supabase Dashboard → SQL Editor
- [ ] Ejecutar SQL para crear tablas (ver `GUIA_INTEGRACION_BACKEND.md`):
  - [ ] `users`
  - [ ] `companies`
  - [ ] `user_companies`
  - [ ] `employees` ⚠️ CRÍTICO

### Día 4: Tablas de Funcionalidades
- [ ] Ejecutar SQL para:
  - [ ] `schedules`
  - [ ] `vacations`
  - [ ] `expenses`
  - [ ] `fichajes`
  - [ ] `documents`

### Día 5: RLS Policies y Storage
- [ ] Configurar Row Level Security (RLS) en todas las tablas
- [ ] Crear policies para gerente/trabajador
- [ ] Crear buckets en Storage:
  - [ ] `documents` (privado)
  - [ ] `avatars` (público)
  - [ ] `receipts` (privado)
- [ ] Configurar policies de Storage

**Checkpoint:** Verificar que todas las tablas existen en Supabase Dashboard

---

## 🔐 FASE 3: AUTENTICACIÓN (Días 6-7)

### Día 6: Implementar Auth
- [ ] Crear `/src/services/auth.service.ts`
- [ ] Crear `/src/hooks/useAuth.ts`
- [ ] Modificar `/src/app/context/AppContext.tsx` para usar Supabase Auth
- [ ] Implementar:
  - [ ] Login con email/password
  - [ ] Logout
  - [ ] Get current user
  - [ ] Refresh token

### Día 7: Protección de Rutas
- [ ] Crear componente `ProtectedRoute`
- [ ] Verificar autenticación en cada navegación
- [ ] Redireccionar a login si no está autenticado
- [ ] Testing manual de login/logout

**Checkpoint:** Login funcional con usuario de prueba

---

## 🔌 FASE 4: MÓDULO EMPLEADOS (Días 8-9)

### Día 8: Service y Hooks
- [ ] Crear `/src/services/employees.service.ts`
  - [ ] `getAll(companyId)`
  - [ ] `getById(id)`
  - [ ] `create(employee)`
  - [ ] `update(id, updates)`
  - [ ] `delete(id)`

- [ ] Crear `/src/hooks/useEmployees.ts`
  - [ ] `useEmployees(companyId)`
  - [ ] `useEmployee(id)`
  - [ ] `useCreateEmployee()`
  - [ ] `useUpdateEmployee()`
  - [ ] `useDeleteEmployee()`

### Día 9: Integración UI
- [ ] Modificar `/src/app/components/sections/Equipo.tsx`
  - [ ] Reemplazar `mockEmployees` con `useEmployees()`
  - [ ] Agregar loading state
  - [ ] Agregar error handling

- [ ] Modificar `/src/app/components/equipo/AddEmployeeModal.tsx`
  - [ ] Usar `useCreateEmployee()` en el submit

- [ ] Modificar `/src/app/components/equipo/EditEmployeeModal.tsx`
  - [ ] Usar `useUpdateEmployee()` en el submit

- [ ] Modificar `/src/app/components/equipo/EmployeeDetailPanel.tsx`
  - [ ] Cargar datos con `useEmployee(id)`

**Checkpoint:** CRUD de empleados funcionando completamente

---

## 📅 FASE 5: MÓDULO HORARIOS (Días 10-11)

### Día 10: Service y Hooks
- [ ] Crear `/src/services/schedules.service.ts`
  - [ ] `getByWeek(companyId, year, weekNumber)`
  - [ ] `create(schedule)`
  - [ ] `createBulk(schedules[])`
  - [ ] `update(id, updates)`
  - [ ] `delete(id)`
  - [ ] `publish(year, weekNumber)`

- [ ] Crear `/src/hooks/useSchedules.ts`
  - [ ] `useSchedules(companyId, year, week)`
  - [ ] `useCreateSchedule()`
  - [ ] `useUpdateSchedule()`
  - [ ] `useDeleteSchedule()`
  - [ ] `usePublishSchedules()`

### Día 11: Integración UI
- [ ] Modificar `/src/app/components/equipo/SchedulesViewPRO.tsx`
  - [ ] Cargar horarios con `useSchedules()`
  - [ ] Implementar guardado de turnos

- [ ] Modificar `/src/app/components/equipo/PlanificacionHorariaGeneralMejorada.tsx`
  - [ ] Conectar con backend
  - [ ] Implementar publicar horarios

- [ ] Modificar `/src/app/components/equipo/PlanificacionHorariaMobile.tsx`
  - [ ] Sincronizar con versión desktop

**Checkpoint:** Planificación horaria guardando en BD

---

## 🏖️ FASE 6: MÓDULO VACACIONES (Día 12)

- [ ] Crear `/src/services/vacations.service.ts`
  - [ ] `getAll(filters)`
  - [ ] `create(vacation)`
  - [ ] `approve(id, comments)`
  - [ ] `reject(id, reason)`

- [ ] Crear `/src/hooks/useVacations.ts`
  - [ ] `useVacations(employeeId, status)`
  - [ ] `useCreateVacation()`
  - [ ] `useApproveVacation()`
  - [ ] `useRejectVacation()`

- [ ] Modificar `/src/app/components/equipo/VacationsViewOptimized.tsx`
  - [ ] Conectar con backend
  - [ ] Implementar aprobaciones

**Checkpoint:** Solicitudes de vacaciones funcionando

---

## 💰 FASE 7: MÓDULO GASTOS (Día 13)

- [ ] Crear `/src/services/expenses.service.ts`
  - [ ] `getAll(filters)`
  - [ ] `create(expense)`
  - [ ] `uploadReceipt(file)` → Supabase Storage
  - [ ] `approve(id, comments)`
  - [ ] `reject(id, reason)`

- [ ] Crear `/src/hooks/useExpenses.ts`
  - [ ] `useExpenses(employeeId, status)`
  - [ ] `useCreateExpense()`
  - [ ] `useUploadReceipt()`
  - [ ] `useApproveExpense()`

- [ ] Modificar `/src/app/components/equipo/ExpensesViewOptimized.tsx`
  - [ ] Conectar con backend
  - [ ] Implementar upload de recibos
  - [ ] Implementar aprobaciones

**Checkpoint:** Gestión de gastos con recibos funcionando

---

## ⏱️ FASE 8: MÓDULO FICHAJES (Día 14)

- [ ] Crear `/src/services/fichajes.service.ts`
  - [ ] `getAll(filters)`
  - [ ] `checkIn(employeeId, location)`
  - [ ] `checkOut(fichajeId, location)`
  - [ ] `adjustManual(fichajeId, adjustment)`
  - [ ] `getActive(employeeId)`

- [ ] Crear `/src/hooks/useFichajes.ts`
  - [ ] `useFichajes(employeeId, dateRange)`
  - [ ] `useCheckIn()`
  - [ ] `useCheckOut()`
  - [ ] `useAdjustFichaje()`

- [ ] Modificar `/src/app/components/equipo/FichajesView.tsx`
  - [ ] Conectar con backend

- [ ] Modificar `/src/app/components/sections/trabajador/Fichaje.tsx`
  - [ ] Implementar check-in/check-out real

**Checkpoint:** Sistema de fichaje funcionando

---

## 💬 FASE 9: MÓDULO CHATS (Día 15)

- [ ] Crear `/src/services/chats.service.ts`
  - [ ] `getChannels(companyId)`
  - [ ] `createChannel(channel)`
  - [ ] `getMessages(channelId)`
  - [ ] `sendMessage(channelId, message)`
  - [ ] `uploadAttachment(file)`

- [ ] Crear `/src/hooks/useChats.ts`
  - [ ] `useChannels(companyId)`
  - [ ] `useMessages(channelId)` + Supabase Realtime
  - [ ] `useSendMessage()`

- [ ] Modificar `/src/app/components/sections/gerente/ChatsGerente.tsx`
  - [ ] Conectar con backend
  - [ ] Implementar Realtime

- [ ] Modificar `/src/app/components/sections/trabajador/Chats.tsx`
  - [ ] Conectar con backend
  - [ ] Implementar Realtime

**Checkpoint:** Chat en tiempo real funcionando

---

## 📄 FASE 10: MÓDULO DOCUMENTOS (Día 16)

- [ ] Crear `/src/services/documents.service.ts`
  - [ ] `getAll(filters)`
  - [ ] `upload(file, metadata)`
  - [ ] `download(id)`
  - [ ] `delete(id)`

- [ ] Crear `/src/hooks/useDocuments.ts`
  - [ ] `useDocuments(companyId, employeeId)`
  - [ ] `useUploadDocument()`
  - [ ] `useDeleteDocument()`

- [ ] Modificar `/src/app/components/sections/Documentacion.tsx`
  - [ ] Conectar con Storage
  - [ ] Implementar upload/download

**Checkpoint:** Gestión de documentos funcionando

---

## 🔔 FASE 11: NOTIFICACIONES Y EXTRAS (Día 17)

- [ ] Crear tabla `notifications` si no existe
- [ ] Crear `/src/services/notifications.service.ts`
- [ ] Implementar notificaciones en tiempo real
- [ ] Agregar badge de notificaciones no leídas en Header

---

## 🧪 FASE 12: TESTING & QA (Días 18-19)

### Día 18: Testing Funcional
- [ ] Probar cada módulo end-to-end
- [ ] Verificar permisos (gerente vs trabajador)
- [ ] Probar responsive (móvil/tablet/desktop)
- [ ] Probar flujos completos:
  - [ ] Crear empleado → Asignar horario → Aprobar vacaciones
  - [ ] Fichaje → Ajuste manual → Ver historial
  - [ ] Crear gasto → Subir recibo → Aprobar
  - [ ] Enviar mensaje → Recibir en tiempo real

### Día 19: Bug Fixing
- [ ] Corregir bugs encontrados
- [ ] Optimizar queries lentas
- [ ] Agregar índices adicionales si es necesario
- [ ] Probar edge cases

**Checkpoint:** Aplicación estable sin bugs críticos

---

## 🚀 FASE 13: DEPLOYMENT (Día 20)

- [ ] Configurar variables de entorno en producción
- [ ] Deploy frontend (Vercel/Netlify)
- [ ] Verificar conexión con Supabase en producción
- [ ] Configurar backups automáticos en Supabase
- [ ] Configurar monitoreo (Sentry, LogRocket, etc.)
- [ ] Documentar proceso de deploy

**Checkpoint:** Aplicación en producción funcionando

---

## 📊 MÉTRICAS DE ÉXITO

Al finalizar, deberías tener:
- ✅ **100% de funcionalidades** conectadas a backend
- ✅ **Autenticación** funcional con RLS
- ✅ **Realtime** funcionando en chats
- ✅ **Storage** funcionando para documentos
- ✅ **0 bugs críticos**
- ✅ **Responsive** en todos los dispositivos
- ✅ **Performance** <2s para cargas iniciales

---

## 🆘 RECURSOS DE AYUDA

### Documentación
- **Supabase:** https://supabase.com/docs
- **React Query:** https://tanstack.com/query/latest
- **TypeScript:** https://www.typescriptlang.org/docs/

### Archivos Clave del Proyecto
- **Tipos:** `/src/app/types.ts`
- **Mock Data:** `/src/app/data/mockData.ts`
- **Contexto:** `/src/app/context/AppContext.tsx`
- **Guía Completa:** `/GUIA_INTEGRACION_BACKEND.md`

### Comandos Útiles
```bash
# Desarrollo local
npm run dev

# Build de producción
npm run build

# Preview del build
npm run preview

# Generar tipos de Supabase
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/database.types.ts
```

---

## 📝 NOTAS IMPORTANTES

1. **No modifiques los componentes UI existentes** a menos que sea estrictamente necesario. Ya están optimizados y funcionando.

2. **Usa React Query** para todas las llamadas a la API. No uses fetch directamente en componentes.

3. **Sigue la estructura de carpetas** propuesta en la guía.

4. **Implementa error handling** en todos los servicios.

5. **Agrega loading states** en todos los componentes que cargan datos.

6. **Testea en móvil** después de cada fase crítica.

7. **Haz commits frecuentes** con mensajes descriptivos:
   ```
   feat: implementar servicio de empleados
   fix: corregir bug en aprobación de vacaciones
   refactor: optimizar queries de horarios
   ```

---

## ✅ VALIDACIÓN FINAL

Antes de considerar el proyecto completo, verifica:

- [ ] Un gerente puede crear, editar y eliminar empleados
- [ ] Un gerente puede planificar horarios y publicarlos
- [ ] Un trabajador puede ver sus horarios pero no editarlos
- [ ] Las solicitudes de vacaciones requieren aprobación
- [ ] Los gastos con recibo se suben correctamente
- [ ] El fichaje funciona con geolocalización (si aplica)
- [ ] Los chats actualizan en tiempo real
- [ ] Los documentos se suben y descargan correctamente
- [ ] Los permisos RLS funcionan correctamente
- [ ] La app es responsive en móvil, tablet y desktop
- [ ] No hay errores en la consola del navegador
- [ ] Las transiciones y animaciones funcionan
- [ ] El cambio entre empresas funciona correctamente

---

**¡Éxito en la integración!** 🚀

Si tienes dudas, revisa primero `GUIA_INTEGRACION_BACKEND.md` y luego los componentes UI existentes para entender cómo deben funcionar.

**Última actualización:** 11 de enero de 2026
