import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useApp } from './AppContext';
import { useAuth } from './AuthContext';
import { useBusiness } from './BusinessContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StepStatus = 'pending' | 'in_progress' | 'completed';

export interface OnboardingSubStep {
  id: string;
  label: string;
  completed: boolean;
}

export interface OnboardingStep {
  id: string;
  number: number;
  label: string;
  description: string;
  route: string;
  icon: string;
  status: StepStatus;
  subSteps: OnboardingSubStep[];
  completedSubSteps: number;
  totalSubSteps: number;
}

interface ActivationChecklistContextType {
  steps: OnboardingStep[];
  completionPct: number;
  completedSteps: number;
  totalSteps: number;
  isVisible: boolean;
  isDismissed: boolean;
  currentStepIndex: number;
  dismiss: () => void;
  restore: () => void;
  loadSampleData: () => void;
  isLoadingSample: boolean;
}

const ActivationChecklistContext = createContext<ActivationChecklistContextType | undefined>(undefined);

const DISMISSED_KEY = 'udar_activation_dismissed';
const IN_PROGRESS_KEY = 'udar_onboarding_in_progress_step';

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ActivationChecklistProvider({ children }: { children: ReactNode }) {
  const { vehicles, clients, leads, sales, documents } = useApp();
  const { listUsers } = useAuth();
  const { currentBusiness } = useBusiness();
  const [teamCount, setTeamCount] = useState(0);
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISSED_KEY) === 'true'; } catch { return false; }
  });

  useEffect(() => {
    listUsers()
      .then(members => setTeamCount(members.length))
      .catch(() => setTeamCount(0));
  }, [listUsers]);

  const biz = currentBusiness;

  // Primitive flags for stable useMemo dependencies
  const hasCompanyName = Boolean(biz?.name && biz.name.trim().length > 0);
  const hasTaxData = Boolean(biz?.taxId && biz.taxId.trim().length > 0);
  const hasAddress = Boolean(biz?.address && biz.address.trim().length > 0);
  const hasBranches = Boolean(biz?.branches && biz.branches.length > 0);
  const hasPhone = Boolean(biz?.phone && biz.phone.trim().length > 0);
  const hasClients = clients.length > 0;
  const hasLeads = leads.length > 0;
  const hasMultipleClients = clients.length >= 3;
  const hasProducts = vehicles.length > 0;
  const hasMultipleProducts = vehicles.length >= 3;
  const hasProductWithPrice = vehicles.some(v => (v.salePrice ?? 0) > 0);
  const hasStockWithCost = vehicles.some(v => v.purchasePrice > 0);
  const hasStockWithLocation = vehicles.some(v => Boolean(v.location || v.workCenterId));
  const hasTeam = teamCount > 1;
  const hasDocuments = documents.length > 0;
  const hasSales = sales.length > 0;

  const steps: OnboardingStep[] = useMemo(() => {
    let activeStepKey: string | null = null;
    try { activeStepKey = localStorage.getItem(IN_PROGRESS_KEY); } catch { /* noop */ }

    const defs: Array<Omit<OnboardingStep, 'status' | 'completedSubSteps' | 'totalSubSteps'>> = [
      { id: 'configure_business', number: 1, label: 'Configura tu negocio', description: 'Completa la información básica de tu empresa para poder operar', route: '/saas/configuracion', icon: 'building', subSteps: [
        { id: 'company_name', label: 'Nombre comercial', completed: hasCompanyName },
        { id: 'tax_data', label: 'Datos fiscales (CIF/NIF)', completed: hasTaxData },
        { id: 'address', label: 'Dirección / ubicación', completed: hasAddress },
        { id: 'contact', label: 'Teléfono de contacto', completed: hasPhone },
        { id: 'branches', label: 'Sedes o centros de trabajo', completed: hasBranches },
      ] },
      { id: 'upload_clients', number: 2, label: 'Sube tus clientes', description: 'Importa o crea tus clientes para empezar a trabajar', route: '/saas/clients', icon: 'users', subSteps: [
        { id: 'first_client', label: 'Crear o importar primer cliente', completed: hasClients || hasLeads },
        { id: 'multiple_clients', label: 'Tener al menos 3 clientes', completed: hasMultipleClients },
      ] },
      { id: 'create_catalog', number: 3, label: 'Crea tu catálogo', description: 'Da de alta tus productos o servicios con precios', route: '/saas/catalog', icon: 'package', subSteps: [
        { id: 'first_product', label: 'Crear primer producto o servicio', completed: hasProducts },
        { id: 'product_price', label: 'Asignar precio de venta', completed: hasProductWithPrice },
        { id: 'multiple_products', label: 'Tener al menos 3 artículos', completed: hasMultipleProducts },
      ] },
      { id: 'load_stock', number: 4, label: 'Carga tu stock inicial', description: 'Registra tus existencias actuales con costes y ubicación', route: '/saas/catalog', icon: 'warehouse', subSteps: [
        { id: 'stock_items', label: 'Registrar existencias iniciales', completed: hasProducts },
        { id: 'stock_cost', label: 'Indicar coste de compra', completed: hasStockWithCost },
        { id: 'stock_location', label: 'Asignar ubicación / almacén', completed: hasStockWithLocation },
      ] },
      { id: 'configure_operations', number: 5, label: 'Configura tu operativa', description: 'Define equipo, plantillas y numeración de documentos', route: '/saas/settings/numeracion', icon: 'settings', subSteps: [
        { id: 'team', label: 'Invitar a un miembro del equipo', completed: hasTeam },
        { id: 'documents', label: 'Crear una plantilla de documento', completed: hasDocuments },
      ] },
      { id: 'first_operation', number: 6, label: 'Realiza tu primera operación', description: 'Crea tu primera venta para validar que todo funciona', route: '/saas/sales', icon: 'rocket', subSteps: [
        { id: 'first_client_sel', label: 'Crear o seleccionar un cliente', completed: hasClients || hasLeads },
        { id: 'first_sale', label: 'Registrar primera venta u operación', completed: hasSales },
      ] },
    ];

    return defs.map(def => {
      const completedSub = def.subSteps.filter(s => s.completed).length;
      const allDone = def.subSteps.length > 0 && completedSub === def.subSteps.length;
      const inProgress = completedSub > 0 && !allDone;

      let status: StepStatus = 'pending';
      if (allDone) {
        status = 'completed';
      } else if (inProgress || activeStepKey === def.id) {
        status = 'in_progress';
      }

      return {
        ...def,
        status,
        completedSubSteps: completedSub,
        totalSubSteps: def.subSteps.length,
      };
    });
  }, [
    hasCompanyName, hasTaxData, hasAddress, hasBranches, hasPhone,
    hasClients, hasLeads, hasMultipleClients,
    hasProducts, hasMultipleProducts, hasProductWithPrice,
    hasStockWithCost, hasStockWithLocation,
    hasTeam, hasDocuments, hasSales,
  ]);

  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const totalSteps = steps.length;
  const completionPct = Math.round((completedSteps / totalSteps) * 100);

  const currentStepIndex = useMemo(() => {
    const idx = steps.findIndex(s => s.status !== 'completed');
    return idx === -1 ? steps.length - 1 : idx;
  }, [steps]);

  useEffect(() => {
    if (completionPct === 100) {
      setIsDismissed(true);
      try { localStorage.setItem(DISMISSED_KEY, 'true'); } catch { /* noop */ }
    }
  }, [completionPct]);

  const dismiss = useCallback(() => {
    setIsDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, 'true'); } catch { /* noop */ }
  }, []);

  const restore = useCallback(() => {
    setIsDismissed(false);
    try { localStorage.removeItem(DISMISSED_KEY); } catch { /* noop */ }
  }, []);

  const loadSampleData = useCallback(() => {
    setIsLoadingSample(true);
    setTimeout(() => setIsLoadingSample(false), 1500);
  }, []);

  const isVisible = !isDismissed && completionPct < 100;

  return (
    <ActivationChecklistContext.Provider
      value={{ steps, completionPct, completedSteps, totalSteps, isVisible, isDismissed, currentStepIndex, dismiss, restore, loadSampleData, isLoadingSample }}
    >
      {children}
    </ActivationChecklistContext.Provider>
  );
}

export function useActivationChecklist() {
  const ctx = useContext(ActivationChecklistContext);
  if (!ctx) {
    return {
      steps: [],
      completionPct: 0,
      completedSteps: 0,
      totalSteps: 0,
      isVisible: false,
      isDismissed: true,
      currentStepIndex: 0,
      dismiss: () => {},
      restore: () => {},
      loadSampleData: () => {},
      isLoadingSample: false,
    };
  }
  return ctx;
}
