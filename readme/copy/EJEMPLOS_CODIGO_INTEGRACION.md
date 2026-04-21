# 💻 EJEMPLOS DE CÓDIGO - INTEGRACIÓN BACKEND

**Ejemplos prácticos y copy-paste ready para acelerar el desarrollo**

---

## 📂 ESTRUCTURA DE CARPETAS A CREAR

```bash
# Ejecutar en la raíz del proyecto:
mkdir -p src/lib
mkdir -p src/services
mkdir -p src/hooks/api
mkdir -p src/types/api
mkdir -p src/utils
```

---

## 1️⃣ SETUP INICIAL

### `/src/lib/supabase.ts`
```typescript
import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las variables de entorno de Supabase');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
```

### `/src/lib/queryClient.ts`
```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutos
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
```

### Modificar `/src/app/App.tsx`
```typescript
import { AppProvider } from './context/AppContext';
import { LayoutResponsive } from './components/layout/LayoutResponsive';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from '../lib/queryClient';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <LayoutResponsive />
      </AppProvider>
      {/* Solo en desarrollo */}
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
```

---

## 2️⃣ AUTENTICACIÓN

### `/src/services/auth.service.ts`
```typescript
import { supabase } from '../lib/supabase';
import { User } from '../types';

export const authService = {
  /**
   * Login con email y contraseña
   */
  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  },

  /**
   * Logout
   */
  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  /**
   * Obtener usuario actual
   */
  async getCurrentUser(): Promise<User | null> {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) return null;

    // Obtener datos completos del usuario desde la tabla users
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*, user_companies(company_id, role, companies(*))')
      .eq('id', user.id)
      .single();

    if (userError) throw userError;

    // Transformar a formato User
    return {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      avatar: userData.avatar,
      role: userData.user_companies[0]?.role || 'trabajador',
      companies: userData.user_companies.map((uc: any) => uc.companies),
    };
  },

  /**
   * Registrar nuevo usuario
   */
  async register(email: string, password: string, name: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
        },
      },
    });

    if (error) throw error;
    return data;
  },

  /**
   * Escuchar cambios de autenticación
   */
  onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback);
  },
};
```

### `/src/hooks/useAuth.ts`
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authService } from '../services/auth.service';
import { useEffect } from 'react';

export function useAuth() {
  const queryClient = useQueryClient();

  // Query para obtener usuario actual
  const { data: user, isLoading } = useQuery({
    queryKey: ['auth', 'user'],
    queryFn: () => authService.getCurrentUser(),
    retry: false,
  });

  // Mutation para login
  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authService.login(email, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });
    },
  });

  // Mutation para logout
  const logoutMutation = useMutation({
    mutationFn: () => authService.logout(),
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'user'], null);
      queryClient.clear();
    },
  });

  // Escuchar cambios de autenticación
  useEffect(() => {
    const { data: { subscription } } = authService.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });
      } else if (event === 'SIGNED_OUT') {
        queryClient.setQueryData(['auth', 'user'], null);
      }
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
  };
}
```

### Modificar `/src/app/context/AppContext.tsx`
```typescript
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Company, User, UserRole } from '../types';
import { useAuth } from '../../hooks/useAuth';

interface AppContextType {
  currentUser: User | null;
  currentCompany: Company | null;
  viewMode: 'single' | 'global';
  currentSection: string;
  userRole: UserRole;
  setCurrentCompany: (company: Company | null) => void;
  setViewMode: (mode: 'single' | 'global') => void;
  setCurrentSection: (section: string) => void;
  switchUserRole: (role: UserRole) => void;
  isLoading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [viewMode, setViewMode] = useState<'single' | 'global'>('single');
  const [currentSection, setCurrentSection] = useState<string>('dashboard');

  // Determinar rol del usuario basado en la empresa actual
  const userRole = currentCompany && user?.companies
    ? (user.companies.find(c => c.id === currentCompany.id) as any)?.role || 'trabajador'
    : 'trabajador';

  // Establecer empresa inicial cuando el usuario carga
  useEffect(() => {
    if (user && user.companies.length > 0 && !currentCompany) {
      setCurrentCompany(user.companies[0]);
    }
  }, [user, currentCompany]);

  const switchUserRole = (role: UserRole) => {
    // Esta función ya no es necesaria con auth real
    // El rol se determina por la relación user_companies
    console.log('switchUserRole no implementado con auth real');
  };

  return (
    <AppContext.Provider
      value={{
        currentUser: user || null,
        currentCompany,
        viewMode,
        currentSection,
        userRole,
        setCurrentCompany,
        setViewMode,
        setCurrentSection,
        switchUserRole,
        isLoading: authLoading,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp debe usarse dentro de AppProvider');
  }
  return context;
}
```

---

## 3️⃣ EMPLEADOS (EJEMPLO COMPLETO)

### `/src/services/employees.service.ts`
```typescript
import { supabase } from '../lib/supabase';
import { Employee } from '../types';

export const employeesService = {
  /**
   * Obtener todos los empleados de una empresa
   */
  async getAll(companyId: string): Promise<Employee[]> {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('company_id', companyId)
      .order('name');

    if (error) throw error;
    return data || [];
  },

  /**
   * Obtener un empleado por ID
   */
  async getById(id: string): Promise<Employee> {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Crear un nuevo empleado
   */
  async create(employee: Partial<Employee>): Promise<Employee> {
    const { data, error } = await supabase
      .from('employees')
      .insert({
        company_id: employee.companyId,
        name: employee.name,
        email: employee.email,
        professional_email: employee.professionalEmail,
        role: employee.role,
        status: employee.status || 'activo',
        onboarding_status: 'invitado',
        // Mapear el resto de campos según el schema
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Actualizar un empleado
   */
  async update(id: string, updates: Partial<Employee>): Promise<Employee> {
    // Registrar cambio en historial
    await this.recordHistory(id, updates);

    const { data, error } = await supabase
      .from('employees')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Eliminar un empleado
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Obtener historial de cambios de un empleado
   */
  async getHistory(employeeId: string) {
    const { data, error } = await supabase
      .from('employee_history')
      .select('*, changed_by:users(name), approved_by:users(name)')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  /**
   * Registrar cambio en historial (privado)
   */
  async recordHistory(employeeId: string, changes: Partial<Employee>) {
    const user = await supabase.auth.getUser();
    if (!user.data.user) return;

    const historyEntries = Object.entries(changes).map(([field, newValue]) => ({
      employee_id: employeeId,
      changed_by: user.data.user.id,
      field_name: field,
      new_value: String(newValue),
      change_type: this.getChangeType(field),
      requires_approval: this.requiresApproval(field),
    }));

    await supabase.from('employee_history').insert(historyEntries);
  },

  /**
   * Determinar tipo de cambio
   */
  getChangeType(field: string): 'personal' | 'laboral' | 'admin' | 'contractual' {
    const personalFields = ['name', 'email', 'phone', 'address', 'city'];
    const laboralFields = ['role', 'work_center', 'workday', 'weekly_hours'];
    const adminFields = ['nss', 'cotization_group', 'contract_code'];
    
    if (personalFields.includes(field)) return 'personal';
    if (laboralFields.includes(field)) return 'laboral';
    if (adminFields.includes(field)) return 'admin';
    return 'contractual';
  },

  /**
   * Determinar si un campo requiere aprobación
   */
  requiresApproval(field: string): boolean {
    const contractualFields = ['salary', 'contract_type', 'professional_category'];
    return contractualFields.includes(field);
  },
};
```

### `/src/hooks/api/useEmployees.ts`
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeesService } from '../../services/employees.service';
import { Employee } from '../../types';
import { toast } from 'sonner';

/**
 * Hook para obtener todos los empleados de una empresa
 */
export function useEmployees(companyId: string) {
  return useQuery({
    queryKey: ['employees', companyId],
    queryFn: () => employeesService.getAll(companyId),
    enabled: !!companyId,
  });
}

/**
 * Hook para obtener un empleado específico
 */
export function useEmployee(id: string) {
  return useQuery({
    queryKey: ['employee', id],
    queryFn: () => employeesService.getById(id),
    enabled: !!id,
  });
}

/**
 * Hook para crear un empleado
 */
export function useCreateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (employee: Partial<Employee>) =>
      employeesService.create(employee),
    onSuccess: (newEmployee) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success(`Empleado ${newEmployee.name} creado correctamente`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al crear empleado');
    },
  });
}

/**
 * Hook para actualizar un empleado
 */
export function useUpdateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Employee> }) =>
      employeesService.update(id, updates),
    onSuccess: (updatedEmployee) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employee', updatedEmployee.id] });
      toast.success('Empleado actualizado correctamente');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al actualizar empleado');
    },
  });
}

/**
 * Hook para eliminar un empleado
 */
export function useDeleteEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => employeesService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Empleado eliminado correctamente');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al eliminar empleado');
    },
  });
}

/**
 * Hook para obtener historial de cambios
 */
export function useEmployeeHistory(employeeId: string) {
  return useQuery({
    queryKey: ['employee-history', employeeId],
    queryFn: () => employeesService.getHistory(employeeId),
    enabled: !!employeeId,
  });
}
```

### Integración en Componente (ANTES vs DESPUÉS)

#### ANTES (con mockData)
```typescript
// /src/app/components/sections/Equipo.tsx
import { mockEmployees } from '../../data/mockData';

export function Equipo() {
  const employees = mockEmployees.filter(emp => emp.companyId === '1');
  
  return (
    <div>
      {employees.map(emp => (
        <EmployeeCard key={emp.id} employee={emp} />
      ))}
    </div>
  );
}
```

#### DESPUÉS (con backend)
```typescript
// /src/app/components/sections/Equipo.tsx
import { useEmployees, useDeleteEmployee } from '../../../hooks/api/useEmployees';
import { useApp } from '../../context/AppContext';

export function Equipo() {
  const { currentCompany } = useApp();
  const { data: employees, isLoading, error } = useEmployees(currentCompany?.id || '');
  const deleteEmployee = useDeleteEmployee();

  const handleDelete = async (id: string) => {
    if (confirm('¿Seguro que quieres eliminar este empleado?')) {
      await deleteEmployee.mutateAsync(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Cargando empleados...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">Error: {error.message}</div>
      </div>
    );
  }

  if (!employees || employees.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">No hay empleados</div>
      </div>
    );
  }
  
  return (
    <div>
      {employees.map(emp => (
        <EmployeeCard 
          key={emp.id} 
          employee={emp}
          onDelete={() => handleDelete(emp.id)}
        />
      ))}
    </div>
  );
}
```

---

## 4️⃣ HORARIOS (EJEMPLO COMPLETO)

### `/src/services/schedules.service.ts`
```typescript
import { supabase } from '../lib/supabase';

interface Schedule {
  id: string;
  companyId: string;
  employeeId: string;
  year: number;
  weekNumber: number;
  dayOfWeek: number;
  shifts: Array<{ start: string; end: string; hours: number }>;
  workCenter: string;
  status: 'borrador' | 'publicado' | 'archivado';
}

export const schedulesService = {
  /**
   * Obtener horarios de una semana específica
   */
  async getByWeek(companyId: string, year: number, weekNumber: number) {
    const { data, error } = await supabase
      .from('schedules')
      .select(`
        *,
        employee:employees(id, name, role, avatar)
      `)
      .eq('company_id', companyId)
      .eq('year', year)
      .eq('week_number', weekNumber)
      .order('day_of_week');

    if (error) throw error;
    return data;
  },

  /**
   * Crear múltiples turnos de una vez (bulk)
   */
  async createBulk(schedules: Partial<Schedule>[]) {
    const { data, error } = await supabase
      .from('schedules')
      .upsert(schedules, { 
        onConflict: 'employee_id,year,week_number,day_of_week' 
      })
      .select();

    if (error) throw error;
    return data;
  },

  /**
   * Actualizar un turno específico
   */
  async update(id: string, updates: Partial<Schedule>) {
    const { data, error } = await supabase
      .from('schedules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Eliminar un turno
   */
  async delete(id: string) {
    const { error } = await supabase
      .from('schedules')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Publicar horarios de una semana
   */
  async publish(companyId: string, year: number, weekNumber: number) {
    const { data, error } = await supabase
      .from('schedules')
      .update({ status: 'publicado' })
      .eq('company_id', companyId)
      .eq('year', year)
      .eq('week_number', weekNumber)
      .select();

    if (error) throw error;
    return data;
  },

  /**
   * Obtener horarios de un empleado específico
   */
  async getByEmployee(employeeId: string, year: number, weekNumber: number) {
    const { data, error } = await supabase
      .from('schedules')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('year', year)
      .eq('week_number', weekNumber)
      .order('day_of_week');

    if (error) throw error;
    return data;
  },
};
```

### `/src/hooks/api/useSchedules.ts`
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { schedulesService } from '../../services/schedules.service';
import { toast } from 'sonner';

export function useSchedules(companyId: string, year: number, weekNumber: number) {
  return useQuery({
    queryKey: ['schedules', companyId, year, weekNumber],
    queryFn: () => schedulesService.getByWeek(companyId, year, weekNumber),
    enabled: !!companyId && !!year && !!weekNumber,
  });
}

export function useCreateSchedulesBulk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (schedules: any[]) => schedulesService.createBulk(schedules),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      toast.success('Horarios guardados correctamente');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al guardar horarios');
    },
  });
}

export function usePublishSchedules() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ companyId, year, weekNumber }: { companyId: string; year: number; weekNumber: number }) =>
      schedulesService.publish(companyId, year, weekNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      toast.success('Horarios publicados correctamente');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al publicar horarios');
    },
  });
}
```

---

## 5️⃣ SUPABASE REALTIME (CHATS)

### `/src/services/chats.service.ts`
```typescript
import { supabase } from '../lib/supabase';

export const chatsService = {
  /**
   * Obtener canales de una empresa
   */
  async getChannels(companyId: string) {
    const { data, error } = await supabase
      .from('chats_channels')
      .select('*')
      .eq('company_id', companyId)
      .order('name');

    if (error) throw error;
    return data;
  },

  /**
   * Crear un canal
   */
  async createChannel(channel: any) {
    const { data, error } = await supabase
      .from('chats_channels')
      .insert(channel)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Obtener mensajes de un canal
   */
  async getMessages(channelId: string, limit = 50) {
    const { data, error } = await supabase
      .from('chats_messages')
      .select(`
        *,
        user:users(id, name, avatar),
        employee:employees(id, name, avatar)
      `)
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data.reverse(); // Orden cronológico
  },

  /**
   * Enviar un mensaje
   */
  async sendMessage(channelId: string, message: string, attachments?: string[]) {
    const user = await supabase.auth.getUser();
    
    const { data, error } = await supabase
      .from('chats_messages')
      .insert({
        channel_id: channelId,
        user_id: user.data.user?.id,
        message,
        attachments: attachments || null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Suscribirse a nuevos mensajes (Realtime)
   */
  subscribeToMessages(channelId: string, callback: (message: any) => void) {
    const channel = supabase
      .channel(`chat-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chats_messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          callback(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
```

### `/src/hooks/api/useChats.ts`
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chatsService } from '../../services/chats.service';
import { useEffect } from 'react';

export function useChannels(companyId: string) {
  return useQuery({
    queryKey: ['channels', companyId],
    queryFn: () => chatsService.getChannels(companyId),
    enabled: !!companyId,
  });
}

export function useMessages(channelId: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['messages', channelId],
    queryFn: () => chatsService.getMessages(channelId),
    enabled: !!channelId,
  });

  // Suscribirse a nuevos mensajes en tiempo real
  useEffect(() => {
    if (!channelId) return;

    const unsubscribe = chatsService.subscribeToMessages(channelId, (newMessage) => {
      queryClient.setQueryData(['messages', channelId], (old: any[] = []) => {
        // Evitar duplicados
        if (old.some(msg => msg.id === newMessage.id)) return old;
        return [...old, newMessage];
      });
    });

    return unsubscribe;
  }, [channelId, queryClient]);

  return query;
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ channelId, message, attachments }: { 
      channelId: string; 
      message: string; 
      attachments?: string[] 
    }) => chatsService.sendMessage(channelId, message, attachments),
    onSuccess: (_, variables) => {
      // No es necesario invalidar porque Realtime lo maneja
      // queryClient.invalidateQueries({ queryKey: ['messages', variables.channelId] });
    },
  });
}
```

---

## 6️⃣ UPLOAD DE ARCHIVOS (STORAGE)

### `/src/services/storage.service.ts`
```typescript
import { supabase } from '../lib/supabase';

export const storageService = {
  /**
   * Subir un archivo a un bucket específico
   */
  async upload(bucket: 'documents' | 'avatars' | 'receipts', file: File, path?: string) {
    const fileName = path || `${Date.now()}-${file.name}`;
    
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) throw error;

    // Obtener URL pública (solo para buckets públicos como avatars)
    if (bucket === 'avatars') {
      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path);
      
      return { path: data.path, url: publicUrl };
    }

    // Para buckets privados, retornar solo el path
    return { path: data.path, url: null };
  },

  /**
   * Obtener URL firmada (para buckets privados)
   */
  async getSignedUrl(bucket: string, path: string, expiresIn = 3600) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);

    if (error) throw error;
    return data.signedUrl;
  },

  /**
   * Eliminar un archivo
   */
  async delete(bucket: string, path: string) {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([path]);

    if (error) throw error;
  },
};
```

### Ejemplo de uso en componente
```typescript
import { useState } from 'react';
import { storageService } from '../../services/storage.service';
import { toast } from 'sonner';

export function UploadReceiptButton() {
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validar tamaño (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('El archivo no puede superar los 5MB');
      return;
    }

    // Validar tipo
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Solo se permiten imágenes (JPG, PNG) o PDF');
      return;
    }

    try {
      setUploading(true);
      const result = await storageService.upload('receipts', file);
      toast.success('Recibo subido correctamente');
      
      // Guardar el path en la base de datos
      // await expensesService.update(expenseId, { receipt_url: result.path });
      
    } catch (error: any) {
      toast.error(error.message || 'Error al subir el archivo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <label className="btn">
      {uploading ? 'Subiendo...' : 'Subir Recibo'}
      <input
        type="file"
        onChange={handleFileSelect}
        disabled={uploading}
        className="hidden"
        accept="image/jpeg,image/png,application/pdf"
      />
    </label>
  );
}
```

---

## 7️⃣ UTILIDADES Y HELPERS

### `/src/utils/api.ts`
```typescript
/**
 * Manejo de errores de Supabase
 */
export function handleSupabaseError(error: any): string {
  if (error.code === 'PGRST116') {
    return 'No se encontró el registro';
  }
  
  if (error.code === '23505') {
    return 'Ya existe un registro con estos datos';
  }
  
  if (error.code === '23503') {
    return 'No se puede eliminar porque tiene datos relacionados';
  }
  
  return error.message || 'Ha ocurrido un error';
}

/**
 * Formatear datos para la API
 */
export function mapEmployeeToAPI(employee: any) {
  return {
    company_id: employee.companyId,
    name: employee.name,
    email: employee.email,
    professional_email: employee.professionalEmail,
    role: employee.role,
    status: employee.status,
    onboarding_status: employee.onboardingStatus,
    dni: employee.dni,
    birth_date: employee.birthDate,
    // ... etc
  };
}

/**
 * Formatear datos desde la API
 */
export function mapEmployeeFromAPI(data: any): Employee {
  return {
    id: data.id,
    companyId: data.company_id,
    name: data.name,
    email: data.email,
    professionalEmail: data.professional_email,
    role: data.role,
    status: data.status,
    onboardingStatus: data.onboarding_status,
    dni: data.dni,
    birthDate: data.birth_date,
    // ... etc
  };
}
```

---

## 8️⃣ TESTING

### Ejemplo de test con React Query
```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEmployees } from '../useEmployees';

describe('useEmployees', () => {
  it('should fetch employees', async () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: any) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useEmployees('company-id'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeDefined();
  });
});
```

---

## ✅ VALIDACIÓN FINAL

### Script de verificación (ejecutar en consola del navegador)
```javascript
// Verificar que Supabase está conectado
console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL);

// Verificar autenticación
const { data } = await supabase.auth.getUser();
console.log('Usuario actual:', data.user);

// Verificar query a empleados
const { data: employees } = await supabase.from('employees').select('*').limit(1);
console.log('Empleados:', employees);

// Verificar Storage
const buckets = await supabase.storage.listBuckets();
console.log('Buckets:', buckets);
```

---

**¡Con estos ejemplos tienes todo lo necesario para empezar la integración!** 🚀

Recuerda:
1. Copia los archivos exactamente como están
2. Ajusta los tipos según tu schema de Supabase
3. Prueba cada módulo antes de pasar al siguiente
4. Usa React Query DevTools para debuggear

**Última actualización:** 11 de enero de 2026
