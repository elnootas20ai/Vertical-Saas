import type { EventPlanningWorker, EventType, QuoteLine } from './eventsTypes';

export type ContractWizardStepId =
  | 'cliente'
  | 'evento'
  | 'presupuesto'
  | 'trabajadores'
  | 'confirmar';

export type ContractWizardLocalDraft = {
  step: ContractWizardStepId;
  clientId: string;
  cliente: string;
  clientEmail: string;
  clientTelefono: string;
  nombre: string;
  tipo: EventType;
  fecha: string;
  invitados: number;
  venueId: string;
  lugar: string;
  lineas: QuoteLine[];
  deposito: number;
  notas: string;
  workers: EventPlanningWorker[];
  productQtyById: Record<string, number>;
  draftEventId?: string;
  updatedAt: string;
};

const STEP_LABELS: Record<ContractWizardStepId, string> = {
  cliente: 'Cliente',
  evento: 'Evento',
  presupuesto: 'Presupuesto',
  trabajadores: 'Trabajadores',
  confirmar: 'Confirmar',
};

export function contractWizardDraftKey(businessId: string): string {
  return `vertial.events.contractWizard.draft:${businessId || 'default'}`;
}

export function readContractWizardDraft(businessId: string): ContractWizardLocalDraft | null {
  try {
    const raw = localStorage.getItem(contractWizardDraftKey(businessId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ContractWizardLocalDraft;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeContractWizardDraft(businessId: string, draft: ContractWizardLocalDraft): void {
  try {
    localStorage.setItem(contractWizardDraftKey(businessId), JSON.stringify(draft));
  } catch {
    /* quota / private mode */
  }
}

export function clearContractWizardDraft(businessId: string): void {
  try {
    localStorage.removeItem(contractWizardDraftKey(businessId));
  } catch {
    /* ignore */
  }
}

export function hasMeaningfulContractDraft(
  d: Pick<ContractWizardLocalDraft, 'cliente' | 'nombre' | 'fecha' | 'lugar' | 'lineas' | 'clientId'>,
): boolean {
  if (String(d.clientId || '').trim()) return true;
  if (String(d.cliente || '').trim()) return true;
  if (String(d.nombre || '').trim()) return true;
  if (String(d.fecha || '').trim()) return true;
  if (String(d.lugar || '').trim()) return true;
  return (d.lineas || []).some((l) => String(l.concepto || '').trim());
}

export type ContractWizardDraftPeek = {
  title: string;
  stepLabel: string;
  updatedAt: string;
};

/** Resumen para el hub: si hay borrador local útil, se puede continuar. */
export function peekContractWizardDraft(businessId: string): ContractWizardDraftPeek | null {
  const draft = readContractWizardDraft(businessId);
  if (!draft || !hasMeaningfulContractDraft(draft)) return null;
  const nombre = String(draft.nombre || '').trim();
  const cliente = String(draft.cliente || '').trim();
  const title = nombre || (cliente ? `Borrador · ${cliente}` : 'Borrador de contratación');
  const step = (STEP_LABELS[draft.step] ? draft.step : 'cliente') as ContractWizardStepId;
  return {
    title,
    stepLabel: STEP_LABELS[step],
    updatedAt: String(draft.updatedAt || ''),
  };
}
