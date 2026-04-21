# 🔌 GUÍA DE INTEGRACIÓN BACKEND - UDAR 360

**Fecha:** 11 de enero de 2026  
**Versión:** 1.0  
**Para:** Programador Backend/Fullstack

---

## 📋 ÍNDICE

1. [Introducción](#introducción)
2. [Arquitectura Actual](#arquitectura-actual)
3. [Esquema de Base de Datos](#esquema-de-base-de-datos)
4. [API Endpoints Requeridos](#api-endpoints-requeridos)
5. [Funcionalidades por Módulo](#funcionalidades-por-módulo)
6. [Autenticación y Autorización](#autenticación-y-autorización)
7. [Casos de Uso Prioritarios](#casos-de-uso-prioritarios)
8. [Migraciones de Datos](#migraciones-de-datos)
9. [Testing](#testing)
10. [Checklist de Implementación](#checklist-de-implementación)

---

## 📖 INTRODUCCIÓN

### Estado Actual
El proyecto UDAR 360 está **100% funcional** con datos mockeados. Todos los componentes UI, flujos de navegación, responsive design y funcionalidades están implementados y probados.

### Objetivo
Conectar la aplicación frontend con un backend real (Supabase recomendado) manteniendo la misma experiencia de usuario y funcionalidades.

### Tecnologías Recomendadas
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Realtime)
- **ORM:** Supabase Client / Prisma (opcional)
- **Auth:** Supabase Auth con Row Level Security (RLS)
- **Storage:** Supabase Storage para documentos e imágenes
- **Realtime:** Supabase Realtime para chats y notificaciones

---

## 🏗️ ARQUITECTURA ACTUAL

### Estructura de Archivos Clave

```
/src/app/
├── types.ts                    # ⚠️ TIPOS PRINCIPALES - REVISAR PRIMERO
├── data/mockData.ts            # ⚠️ DATOS MOCK - ESTRUCTURA DE REFERENCIA
├── context/AppContext.tsx      # ⚠️ CONTEXTO GLOBAL - REEMPLAZAR LÓGICA
├── hooks/
│   ├── useResponsive.ts
│   └── useRegionalPrefs.ts
└── components/
    ├── layout/                 # Layout y navegación
    ├── sections/               # Páginas principales
    │   ├── gerente/           # Vistas del gerente
    │   └── trabajador/        # Vistas del trabajador
    ├── equipo/                # Componentes de RRHH
    ├── ui/                    # Componentes reutilizables
    └── modals/                # Modales
```

### Flujo de Datos Actual

```
mockData.ts → AppContext → Componentes → UI
     ↓
  [REEMPLAZAR CON]
     ↓
Supabase → API Layer → React Query/SWR → AppContext → Componentes → UI
```

---

## 🗄️ ESQUEMA DE BASE DE DATOS

### Diagrama ER Simplificado

```
┌──────────────┐         ┌──────────────┐
│   users      │────┬────│  companies   │
│              │    │    │              │
│ - id         │    │    │ - id         │
│ - email      │    │    │ - name       │
│ - name       │    │    │ - vertical   │
│ - role       │    │    │ - color      │
│ - avatar     │    │    │ - logo       │
└──────────────┘    │    └──────────────┘
                    │            │
                    │            │
         ┌──────────┴─────┐      │
         │                │      │
         │  user_companies│      │
         │                │      │
         │ - user_id      │      │
         │ - company_id   │──────┘
         │ - role         │
         └────────────────┘
                 │
                 │
         ┌───────┴────────┐
         │   employees    │
         │                │
         │ - id           │
         │ - company_id   │
         │ - name         │
         │ - email        │
         │ - role         │
         │ - status       │
         │ - [40+ campos] │
         └────────────────┘
                 │
         ┌───────┴────────┬───────────────┬─────────────┐
         │                │               │             │
    ┌────┴─────┐    ┌─────┴──────┐  ┌────┴──────┐ ┌───┴────┐
    │schedules │    │ vacations  │  │ expenses  │ │fichajes│
    └──────────┘    └────────────┘  └───────────┘ └────────┘
```

### Tablas Principales

#### 1. **users** (Usuarios del sistema)
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 2. **companies** (Empresas/Verticales)
```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  vertical TEXT NOT NULL CHECK (vertical IN ('delivery', 'taller', 'construccion')),
  color TEXT NOT NULL,
  logo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 3. **user_companies** (Relación usuarios-empresas con roles)
```sql
CREATE TABLE user_companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('gerente', 'trabajador', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, company_id)
);
```

#### 4. **employees** (Empleados/Trabajadores) ⚠️ TABLA CRÍTICA
```sql
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Datos básicos
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  professional_email TEXT,
  role TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('activo', 'inactivo')),
  avatar TEXT,
  onboarding_status TEXT CHECK (onboarding_status IN ('invitado', 'pendiente_datos', 'pendiente_gestoria', 'activo', 'inactivo')),
  
  -- Datos personales
  dni TEXT,
  birth_date DATE,
  birth_place TEXT,
  nationality TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'España',
  phone TEXT,
  iban TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  
  -- Datos laborales
  contract_type TEXT,
  salary DECIMAL(10, 2),
  work_center TEXT,
  workday TEXT,
  weekly_hours INTEGER,
  professional_category TEXT,
  agreement TEXT,
  start_date DATE,
  
  -- Datos administrativos (Gestoría)
  nss TEXT, -- Número Seguridad Social
  cotization_group TEXT,
  contract_code TEXT,
  partiality_coefficient TEXT,
  ss_start_date DATE,
  mutua TEXT,
  ccc_empresa TEXT,
  irpf_percentage DECIMAL(5, 2),
  observations TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_employees_company ON employees(company_id);
CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_employees_onboarding ON employees(onboarding_status);
```

#### 5. **schedules** (Horarios/Planificación)
```sql
CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL, -- Semana del año (1-52)
  year INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Domingo, 6=Sábado
  shifts JSONB NOT NULL DEFAULT '[]', -- Array de turnos: [{ start: "09:00", end: "13:00", hours: 4 }]
  work_center TEXT,
  status TEXT DEFAULT 'borrador' CHECK (status IN ('borrador', 'publicado', 'archivado')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(employee_id, year, week_number, day_of_week)
);

CREATE INDEX idx_schedules_employee ON schedules(employee_id);
CREATE INDEX idx_schedules_week ON schedules(year, week_number);
CREATE INDEX idx_schedules_company ON schedules(company_id);
```

#### 6. **vacations** (Vacaciones y ausencias)
```sql
CREATE TABLE vacations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('vacation', 'personal', 'medical', 'other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reason TEXT,
  comments TEXT,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vacations_employee ON vacations(employee_id);
CREATE INDEX idx_vacations_status ON vacations(status);
CREATE INDEX idx_vacations_dates ON vacations(start_date, end_date);
```

#### 7. **expenses** (Gastos)
```sql
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('transporte', 'comida', 'alojamiento', 'material', 'otros')),
  description TEXT NOT NULL,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  receipt_url TEXT, -- URL del archivo en Supabase Storage
  comments TEXT,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  submitted_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expenses_employee ON expenses(employee_id);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_expenses_date ON expenses(date);
```

#### 8. **fichajes** (Registro de entradas/salidas)
```sql
CREATE TABLE fichajes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  check_in TIMESTAMPTZ NOT NULL,
  check_out TIMESTAMPTZ,
  total_hours DECIMAL(5, 2),
  work_center TEXT,
  location_check_in JSONB, -- { lat, lng, address }
  location_check_out JSONB,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'adjusted')),
  adjustment_reason TEXT, -- Si fue ajustado manualmente
  adjusted_by UUID REFERENCES users(id),
  adjusted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fichajes_employee ON fichajes(employee_id);
CREATE INDEX idx_fichajes_date ON fichajes(DATE(check_in));
CREATE INDEX idx_fichajes_status ON fichajes(status);
```

#### 9. **documents** (Documentos empresariales)
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id), -- NULL si es documento de empresa
  type TEXT NOT NULL CHECK (type IN ('factura', 'nomina', 'contrato', 'certificado', 'otros')),
  name TEXT NOT NULL,
  file_url TEXT NOT NULL, -- Supabase Storage URL
  date DATE NOT NULL,
  amount DECIMAL(10, 2),
  status TEXT CHECK (status IN ('pendiente', 'pagado', 'vencido')),
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documents_company ON documents(company_id);
CREATE INDEX idx_documents_employee ON documents(employee_id);
CREATE INDEX idx_documents_type ON documents(type);
```

#### 10. **employee_history** (Historial de cambios)
```sql
CREATE TABLE employee_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES users(id),
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  change_type TEXT NOT NULL CHECK (change_type IN ('personal', 'laboral', 'admin', 'contractual')),
  requires_approval BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_employee_history_employee ON employee_history(employee_id);
CREATE INDEX idx_employee_history_date ON employee_history(created_at);
```

#### 11. **chats_channels** (Canales de chat)
```sql
CREATE TABLE chats_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('rrhh', 'administracion', 'gerencia', 'mantenimiento', 'urgencias')),
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 12. **chats_messages** (Mensajes de chat)
```sql
CREATE TABLE chats_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID REFERENCES chats_channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  employee_id UUID REFERENCES employees(id), -- Si el mensaje es de un empleado
  message TEXT NOT NULL,
  attachments JSONB, -- Array de URLs de archivos
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chats_messages_channel ON chats_messages(channel_id);
CREATE INDEX idx_chats_messages_date ON chats_messages(created_at);
```

#### 13. **notifications** (Notificaciones)
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id),
  type TEXT NOT NULL CHECK (type IN ('info', 'warning', 'error', 'success')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  action_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read);
```

#### 14. **customers** (Clientes) - Solo vertical delivery
```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  total_orders INTEGER DEFAULT 0,
  total_spent DECIMAL(10, 2) DEFAULT 0,
  last_order DATE,
  status TEXT DEFAULT 'activo' CHECK (status IN ('activo', 'inactivo')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_company ON customers(company_id);
```

#### 15. **products** (Productos/Servicios)
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  stock INTEGER DEFAULT 0,
  status TEXT DEFAULT 'activo' CHECK (status IN ('activo', 'inactivo')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_company ON products(company_id);
CREATE INDEX idx_products_category ON products(category);
```

---

## 🔌 API ENDPOINTS REQUERIDOS

### Estructura Base
```
/api/v1/
├── auth/
│   ├── POST   /login
│   ├── POST   /logout
│   ├── POST   /register
│   ├── POST   /refresh-token
│   └── GET    /me
├── companies/
│   ├── GET    /
│   ├── GET    /:id
│   ├── POST   /
│   ├── PUT    /:id
│   └── DELETE /:id
├── employees/
│   ├── GET    /                          # Lista paginada
│   ├── GET    /:id
│   ├── POST   /
│   ├── PUT    /:id
│   ├── DELETE /:id
│   ├── GET    /:id/history
│   ├── POST   /:id/invite                # Invitar a onboarding
│   └── PUT    /:id/onboarding-status
├── schedules/
│   ├── GET    /                          # Filtrado por semana/año
│   ├── GET    /:id
│   ├── POST   /                          # Crear horario
│   ├── PUT    /:id
│   ├── DELETE /:id
│   ├── POST   /bulk                      # Crear múltiples turnos
│   ├── POST   /publish                   # Publicar horarios
│   └── GET    /employee/:employeeId
├── vacations/
│   ├── GET    /                          # Filtrado por estado/empleado
│   ├── GET    /:id
│   ├── POST   /
│   ├── PUT    /:id
│   ├── DELETE /:id
│   ├── POST   /:id/approve
│   └── POST   /:id/reject
├── expenses/
│   ├── GET    /                          # Filtrado por estado/empleado
│   ├── GET    /:id
│   ├── POST   /
│   ├── PUT    /:id
│   ├── DELETE /:id
│   ├── POST   /:id/approve
│   ├── POST   /:id/reject
│   └── POST   /upload-receipt            # Upload a Storage
├── fichajes/
│   ├── GET    /                          # Filtrado por fecha/empleado
│   ├── GET    /:id
│   ├── POST   /check-in
│   ├── POST   /check-out
│   ├── POST   /:id/adjust                # Ajuste manual
│   └── GET    /active                    # Fichajes abiertos
├── documents/
│   ├── GET    /
│   ├── GET    /:id
│   ├── POST   /upload
│   ├── DELETE /:id
│   └── GET    /download/:id
├── chats/
│   ├── GET    /channels
│   ├── POST   /channels
│   ├── GET    /channels/:id/messages
│   ├── POST   /channels/:id/messages
│   └── POST   /direct-message            # Mensaje directo
├── notifications/
│   ├── GET    /
│   ├── POST   /:id/mark-read
│   └── POST   /mark-all-read
└── dashboard/
    ├── GET    /stats                     # Estadísticas generales
    └── GET    /kpis                      # KPIs por vertical
```

### Ejemplos de Endpoints Detallados

#### GET /api/v1/employees
```typescript
// Request
GET /api/v1/employees?companyId=uuid&status=activo&page=1&limit=20

// Response
{
  "data": [
    {
      "id": "uuid",
      "name": "Juan Pérez",
      "email": "juan@example.com",
      "role": "Cocinero",
      "status": "activo",
      "avatar": "https://...",
      "onboardingStatus": "activo"
    }
  ],
  "meta": {
    "total": 45,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

#### POST /api/v1/schedules/bulk
```typescript
// Request
POST /api/v1/schedules/bulk
{
  "companyId": "uuid",
  "year": 2026,
  "weekNumber": 2,
  "schedules": [
    {
      "employeeId": "uuid",
      "dayOfWeek": 1, // Lunes
      "shifts": [
        { "start": "09:00", "end": "13:00", "hours": 4 },
        { "start": "16:00", "end": "20:00", "hours": 4 }
      ],
      "workCenter": "Centro Principal"
    }
  ],
  "status": "publicado"
}

// Response
{
  "success": true,
  "created": 35,
  "message": "Horarios publicados correctamente"
}
```

#### POST /api/v1/vacations/:id/approve
```typescript
// Request
POST /api/v1/vacations/uuid/approve
{
  "comments": "Aprobado. Disfruta tus vacaciones."
}

// Response
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "approved",
    "approvedBy": "uuid",
    "approvedAt": "2026-01-11T10:30:00Z"
  }
}
```

---

## 🔐 AUTENTICACIÓN Y AUTORIZACIÓN

### Sistema de Autenticación

#### Supabase Auth (Recomendado)
```typescript
// Login
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
})

// Logout
await supabase.auth.signOut()

// Get current user
const { data: { user } } = await supabase.auth.getUser()
```

### Row Level Security (RLS) Policies

#### Policies para `employees`
```sql
-- Gerentes pueden ver todos los empleados de sus empresas
CREATE POLICY "Gerentes ven empleados de su empresa"
ON employees FOR SELECT
USING (
  company_id IN (
    SELECT company_id 
    FROM user_companies 
    WHERE user_id = auth.uid() 
    AND role IN ('gerente', 'admin')
  )
);

-- Trabajadores solo ven su propia información
CREATE POLICY "Trabajadores ven su información"
ON employees FOR SELECT
USING (
  id IN (
    SELECT employee_id 
    FROM user_companies 
    WHERE user_id = auth.uid()
  )
);

-- Solo gerentes pueden crear/editar empleados
CREATE POLICY "Solo gerentes pueden editar empleados"
ON employees FOR ALL
USING (
  company_id IN (
    SELECT company_id 
    FROM user_companies 
    WHERE user_id = auth.uid() 
    AND role = 'gerente'
  )
);
```

#### Policies para `schedules`
```sql
-- Gerentes pueden ver/editar horarios de su empresa
CREATE POLICY "Gerentes gestionan horarios"
ON schedules FOR ALL
USING (
  company_id IN (
    SELECT company_id 
    FROM user_companies 
    WHERE user_id = auth.uid() 
    AND role = 'gerente'
  )
);

-- Trabajadores solo ven sus propios horarios
CREATE POLICY "Trabajadores ven sus horarios"
ON schedules FOR SELECT
USING (
  employee_id IN (
    SELECT id 
    FROM employees 
    WHERE email = auth.email()
  )
);
```

### Roles y Permisos

```typescript
// types.ts
export type Permission = 
  | 'view_employees'
  | 'edit_employees'
  | 'delete_employees'
  | 'view_schedules'
  | 'edit_schedules'
  | 'publish_schedules'
  | 'approve_vacations'
  | 'approve_expenses'
  | 'view_financials'
  | 'manage_company';

export const rolePermissions: Record<UserRole, Permission[]> = {
  admin: ['*'], // Todos los permisos
  gerente: [
    'view_employees',
    'edit_employees',
    'view_schedules',
    'edit_schedules',
    'publish_schedules',
    'approve_vacations',
    'approve_expenses',
    'view_financials'
  ],
  trabajador: [
    'view_schedules', // Solo sus propios horarios
  ]
};
```

---

## 🎯 FUNCIONALIDADES POR MÓDULO

### Módulo: EQUIPO (RRHH)

#### Funcionalidades Implementadas que Necesitan Backend

1. **Gestión de Empleados**
   - ✅ Crear empleado → `POST /api/v1/employees`
   - ✅ Editar empleado → `PUT /api/v1/employees/:id`
   - ✅ Eliminar empleado → `DELETE /api/v1/employees/:id`
   - ✅ Ver detalle empleado → `GET /api/v1/employees/:id`
   - ✅ Listar empleados → `GET /api/v1/employees`

2. **Horarios (SchedulesViewPRO + PlanificacionHoraria)**
   - ✅ Ver horarios semanal → `GET /api/v1/schedules?year=2026&week=2`
   - ✅ Crear turnos → `POST /api/v1/schedules`
   - ✅ Editar turnos → `PUT /api/v1/schedules/:id`
   - ✅ Eliminar turnos → `DELETE /api/v1/schedules/:id`
   - ✅ Publicar horarios → `POST /api/v1/schedules/publish`
   - ✅ Guardar borrador → `POST /api/v1/schedules (status: borrador)`

3. **Vacaciones**
   - ✅ Solicitar vacaciones → `POST /api/v1/vacations`
   - ✅ Aprobar/Rechazar → `POST /api/v1/vacations/:id/approve`
   - ✅ Ver historial → `GET /api/v1/vacations?employeeId=uuid`
   - ✅ Filtrar por estado → `GET /api/v1/vacations?status=pending`

4. **Gastos**
   - ✅ Crear gasto → `POST /api/v1/expenses`
   - ✅ Subir recibo → `POST /api/v1/expenses/upload-receipt` (Supabase Storage)
   - ✅ Aprobar/Rechazar → `POST /api/v1/expenses/:id/approve`
   - ✅ Filtrar por categoría/estado → `GET /api/v1/expenses?category=transporte`

5. **Fichajes**
   - ✅ Registrar entrada → `POST /api/v1/fichajes/check-in`
   - ✅ Registrar salida → `POST /api/v1/fichajes/check-out`
   - ✅ Ajuste manual → `POST /api/v1/fichajes/:id/adjust`
   - ✅ Ver historial → `GET /api/v1/fichajes?employeeId=uuid&date=2026-01-11`

6. **Onboarding**
   - ✅ Invitar empleado → `POST /api/v1/employees/:id/invite` (enviar email)
   - ✅ Actualizar estado → `PUT /api/v1/employees/:id/onboarding-status`
   - ✅ Ver progreso → `GET /api/v1/employees/:id`

7. **Historial de Cambios**
   - ✅ Ver historial → `GET /api/v1/employees/:id/history`
   - ✅ Registrar cambio → Auto en cada `PUT /api/v1/employees/:id`

### Módulo: CHATS

#### Funcionalidades que Necesitan Backend + Realtime

1. **Canales**
   - ✅ Crear canal → `POST /api/v1/chats/channels`
   - ✅ Listar canales → `GET /api/v1/chats/channels`
   - ✅ Ver mensajes → `GET /api/v1/chats/channels/:id/messages`

2. **Mensajes**
   - ✅ Enviar mensaje → `POST /api/v1/chats/channels/:id/messages`
   - ✅ Adjuntar archivo → Supabase Storage + JSONB en mensaje
   - ✅ Mensaje directo → `POST /api/v1/chats/direct-message`

3. **Realtime** (Supabase Realtime)
   ```typescript
   // Suscribirse a mensajes de un canal
   supabase
     .channel(`chat-${channelId}`)
     .on('postgres_changes', 
       { event: 'INSERT', schema: 'public', table: 'chats_messages' },
       (payload) => {
         // Nuevo mensaje recibido
         console.log(payload.new)
       }
     )
     .subscribe()
   ```

### Módulo: DOCUMENTACIÓN

#### Funcionalidades que Necesitan Supabase Storage

1. **Upload de Documentos**
   ```typescript
   // Subir archivo
   const { data, error } = await supabase.storage
     .from('documents')
     .upload(`${companyId}/${employeeId}/${filename}`, file)
   
   // Obtener URL pública
   const { data: { publicUrl } } = supabase.storage
     .from('documents')
     .getPublicUrl(data.path)
   ```

2. **Endpoints**
   - ✅ Subir documento → `POST /api/v1/documents/upload`
   - ✅ Listar documentos → `GET /api/v1/documents?employeeId=uuid`
   - ✅ Descargar → `GET /api/v1/documents/download/:id`
   - ✅ Eliminar → `DELETE /api/v1/documents/:id`

### Módulo: CALENDARIO

#### Funcionalidades

1. **Eventos**
   - ✅ Crear evento → `POST /api/v1/events`
   - ✅ Listar eventos → `GET /api/v1/events?startDate=2026-01-01&endDate=2026-01-31`
   - ✅ Ver horario → Integración con módulo de horarios

---

## 📦 MIGRACIONES DE DATOS

### Script de Migración Inicial

```sql
-- migration_001_initial_schema.sql

-- Crear extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Crear tablas en orden de dependencias
-- (Ver sección "Esquema de Base de Datos" arriba)

-- Crear índices
-- (Ver cada tabla arriba)

-- Crear RLS policies
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacations ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
-- ... etc

-- Insertar datos de prueba (opcional)
INSERT INTO companies (name, vertical, color) VALUES
  ('La Buena Mesa', 'delivery', '#FF6B35'),
  ('AutoTaller Pro', 'taller', '#1E88E5'),
  ('Construcciones Norte', 'construccion', '#FFA726');
```

### Migrar Datos Mock a Producción

```typescript
// scripts/migrate-mock-data.ts
import { mockEmployees } from '../src/app/data/mockData';
import { supabase } from './supabase-client';

async function migrateMockData() {
  for (const employee of mockEmployees) {
    const { data, error } = await supabase
      .from('employees')
      .insert({
        name: employee.name,
        email: employee.email,
        professional_email: employee.professionalEmail,
        role: employee.role,
        status: employee.status,
        company_id: employee.companyId,
        // ... mapear todos los campos
      });
    
    if (error) console.error('Error migrating employee:', error);
  }
}
```

---

## 🧪 TESTING

### Tests Recomendados

1. **Tests de Integración API**
   ```typescript
   describe('Employees API', () => {
     it('should create an employee', async () => {
       const response = await api.post('/employees', {
         name: 'Test Employee',
         email: 'test@example.com',
         // ...
       });
       expect(response.status).toBe(201);
     });

     it('should list employees with pagination', async () => {
       const response = await api.get('/employees?page=1&limit=10');
       expect(response.data.meta.total).toBeGreaterThan(0);
     });
   });
   ```

2. **Tests de RLS Policies**
   ```sql
   -- Verificar que gerente solo ve empleados de su empresa
   SET request.jwt.claim.sub = 'gerente-user-id';
   SELECT * FROM employees; -- Debe devolver solo empleados de empresas del gerente
   ```

3. **Tests de Realtime**
   ```typescript
   it('should receive realtime updates on new messages', (done) => {
     const channel = supabase.channel('test-chat');
     channel.on('postgres_changes', { /* ... */ }, (payload) => {
       expect(payload.new.message).toBe('Test message');
       done();
     });
   });
   ```

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

### FASE 1: Setup Inicial (1-2 días)
- [ ] Crear proyecto en Supabase
- [ ] Configurar variables de entorno
  ```env
  VITE_SUPABASE_URL=https://xxx.supabase.co
  VITE_SUPABASE_ANON_KEY=xxx
  ```
- [ ] Instalar dependencias
  ```bash
  npm install @supabase/supabase-js
  npm install @tanstack/react-query
  ```
- [ ] Crear cliente de Supabase
  ```typescript
  // src/lib/supabase.ts
  import { createClient } from '@supabase/supabase-js'
  
  export const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
  )
  ```

### FASE 2: Base de Datos (2-3 días)
- [ ] Ejecutar migrations iniciales
- [ ] Crear todas las tablas
- [ ] Configurar RLS policies
- [ ] Crear índices
- [ ] Migrar datos mock (opcional para testing)
- [ ] Configurar Storage buckets
  - [ ] Bucket `documents` (privado)
  - [ ] Bucket `avatars` (público)
  - [ ] Bucket `receipts` (privado)

### FASE 3: Autenticación (1-2 días)
- [ ] Implementar login/logout
- [ ] Integrar Supabase Auth con AppContext
- [ ] Configurar refresh token
- [ ] Implementar protección de rutas
- [ ] Testing de autenticación

### FASE 4: API Layer (3-5 días)
- [ ] Crear servicios para cada módulo
  ```typescript
  // src/services/employees.service.ts
  export const employeesService = {
    getAll: async (companyId: string) => { /* ... */ },
    getById: async (id: string) => { /* ... */ },
    create: async (data: CreateEmployeeDTO) => { /* ... */ },
    update: async (id: string, data: UpdateEmployeeDTO) => { /* ... */ },
    delete: async (id: string) => { /* ... */ },
  };
  ```
- [ ] Implementar React Query hooks
  ```typescript
  // src/hooks/useEmployees.ts
  export function useEmployees(companyId: string) {
    return useQuery({
      queryKey: ['employees', companyId],
      queryFn: () => employeesService.getAll(companyId),
    });
  }
  ```

### FASE 5: Integración por Módulos (5-7 días)
- [ ] **Empleados**
  - [ ] Reemplazar mockData con API
  - [ ] Implementar CRUD completo
  - [ ] Testing
- [ ] **Horarios**
  - [ ] Conectar planificación horaria
  - [ ] Implementar guardado de borradores
  - [ ] Publicar horarios
  - [ ] Testing
- [ ] **Vacaciones**
  - [ ] Conectar solicitudes
  - [ ] Implementar aprobaciones
  - [ ] Testing
- [ ] **Gastos**
  - [ ] Conectar formulario
  - [ ] Implementar upload de recibos
  - [ ] Implementar aprobaciones
  - [ ] Testing
- [ ] **Fichajes**
  - [ ] Conectar check-in/check-out
  - [ ] Implementar ajustes manuales
  - [ ] Testing
- [ ] **Chats**
  - [ ] Conectar canales
  - [ ] Implementar mensajes
  - [ ] Configurar Realtime
  - [ ] Testing
- [ ] **Documentos**
  - [ ] Implementar uploads
  - [ ] Configurar Storage
  - [ ] Testing

### FASE 6: Features Avanzadas (2-3 días)
- [ ] Implementar notificaciones realtime
- [ ] Implementar búsqueda y filtros avanzados
- [ ] Implementar paginación
- [ ] Optimizar queries (índices, caching)

### FASE 7: Testing & QA (2-3 días)
- [ ] Testing de integración completo
- [ ] Testing de permisos y RLS
- [ ] Testing de edge cases
- [ ] Performance testing
- [ ] Security audit

### FASE 8: Deployment (1 día)
- [ ] Configurar CI/CD
- [ ] Deploy a producción
- [ ] Monitoreo y logs
- [ ] Backups automáticos

---

## 📂 ESTRUCTURA DE ARCHIVOS RECOMENDADA

```
/src/
├── lib/
│   ├── supabase.ts              # Cliente de Supabase
│   └── queryClient.ts           # React Query config
├── services/                    # ⚠️ CREAR ESTA CARPETA
│   ├── auth.service.ts
│   ├── employees.service.ts
│   ├── schedules.service.ts
│   ├── vacations.service.ts
│   ├── expenses.service.ts
│   ├── fichajes.service.ts
│   ├── chats.service.ts
│   └── documents.service.ts
├── hooks/                       # ⚠️ AMPLIAR ESTA CARPETA
│   ├── useAuth.ts
│   ├── useEmployees.ts
│   ├── useSchedules.ts
│   ├── useVacations.ts
│   ├── useExpenses.ts
│   ├── useFichajes.ts
│   ├── useChats.ts
│   └── useDocuments.ts
├── types/
│   ├── index.ts                 # Tipos existentes
│   ├── database.types.ts        # ⚠️ CREAR - Tipos generados de Supabase
│   └── api.types.ts             # ⚠️ CREAR - DTOs y responses
└── utils/
    ├── api.ts                   # ⚠️ CREAR - Helpers de API
    └── permissions.ts           # ⚠️ CREAR - Lógica de permisos
```

---

## 🎓 EJEMPLO DE IMPLEMENTACIÓN

### Ejemplo Completo: Módulo de Empleados

#### 1. Service Layer
```typescript
// src/services/employees.service.ts
import { supabase } from '../lib/supabase';
import { Employee } from '../types';

export const employeesService = {
  async getAll(companyId: string): Promise<Employee[]> {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('company_id', companyId)
      .order('name');
    
    if (error) throw error;
    return data || [];
  },

  async getById(id: string): Promise<Employee> {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  },

  async create(employee: Partial<Employee>): Promise<Employee> {
    const { data, error } = await supabase
      .from('employees')
      .insert(employee)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<Employee>): Promise<Employee> {
    const { data, error } = await supabase
      .from('employees')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  },
};
```

#### 2. React Query Hook
```typescript
// src/hooks/useEmployees.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeesService } from '../services/employees.service';
import { Employee } from '../types';

export function useEmployees(companyId: string) {
  return useQuery({
    queryKey: ['employees', companyId],
    queryFn: () => employeesService.getAll(companyId),
    enabled: !!companyId,
  });
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: ['employee', id],
    queryFn: () => employeesService.getById(id),
    enabled: !!id,
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (employee: Partial<Employee>) => 
      employeesService.create(employee),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Employee> }) =>
      employeesService.update(id, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employee', variables.id] });
    },
  });
}

export function useDeleteEmployee() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => employeesService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}
```

#### 3. Integración en Componente
```typescript
// src/app/components/sections/Equipo.tsx (ANTES)
import { mockEmployees } from '../../data/mockData';

export function Equipo() {
  const employees = mockEmployees; // ❌ Mock data
  
  return (
    <div>
      {employees.map(emp => <EmployeeCard key={emp.id} employee={emp} />)}
    </div>
  );
}

// src/app/components/sections/Equipo.tsx (DESPUÉS)
import { useEmployees, useCreateEmployee } from '../../hooks/useEmployees';
import { useApp } from '../../context/AppContext';

export function Equipo() {
  const { currentCompany } = useApp();
  const { data: employees, isLoading, error } = useEmployees(currentCompany?.id || '');
  const createEmployee = useCreateEmployee();

  if (isLoading) return <div>Cargando...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return (
    <div>
      {employees?.map(emp => <EmployeeCard key={emp.id} employee={emp} />)}
    </div>
  );
}
```

---

## 🚀 SIGUIENTE PASOS INMEDIATOS

1. **Crear proyecto Supabase** → https://supabase.com
2. **Ejecutar migrations** → Copiar SQL de este documento
3. **Configurar `.env`** → Variables de entorno
4. **Instalar dependencias** → `@supabase/supabase-js` + `@tanstack/react-query`
5. **Implementar autenticación** → Login/Logout básico
6. **Empezar con módulo de empleados** → Es el más crítico

---

## 📞 CONTACTO Y SOPORTE

Si tienes dudas durante la implementación:
- Revisa la documentación de Supabase: https://supabase.com/docs
- Consulta los tipos en `/src/app/types.ts`
- Revisa los datos mock en `/src/app/data/mockData.ts`
- Los componentes UI ya están 100% listos, solo necesitan datos reales

---

**¡El frontend está 100% listo! Solo necesitas conectar el backend siguiendo esta guía.** 🎉

**Tiempo estimado total:** 15-20 días de desarrollo

**Última actualización:** 11 de enero de 2026
