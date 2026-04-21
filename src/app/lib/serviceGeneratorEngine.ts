import type { ServiceContract, ServiceScheduleSlot } from './serviceContractsApi';
import type { CleaningService } from './cleaningApi';
import {
  createCleaningServiceRequest,
  listCleaningServicesRequest,
} from './cleaningApi';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GenerationOptions {
  fromDate: string;
  toDate: string;
  skipExisting?: boolean;
}

export interface GenerationResult {
  generated: number;
  skipped: number;
  errors: string[];
  services: CleaningService[];
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const DAY_MAP: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const WEEKDAY_NUMS = [1, 2, 3, 4, 5];
const ALL_DAYS_NUMS = [0, 1, 2, 3, 4, 5, 6];

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getDayOfWeek(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getDay();
}

function getDayOfMonth(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getDate();
}

function eachDay(from: string, to: string): string[] {
  const result: string[] = [];
  let current = from;
  while (current <= to) {
    result.push(current);
    current = addDays(current, 1);
  }
  return result;
}

// ─── Schedule calculation ─────────────────────────────────────────────────────

function getScheduleDaysAsNumbers(slots: ServiceScheduleSlot[]): number[] {
  return [...new Set(slots.map(s => DAY_MAP[s.day]).filter(n => n !== undefined))];
}

function getSlotForDay(slots: ServiceScheduleSlot[], dayNum: number): ServiceScheduleSlot | undefined {
  const dayKey = Object.entries(DAY_MAP).find(([, v]) => v === dayNum)?.[0];
  return slots.find(s => s.day === dayKey);
}

export function getNextServiceDates(contract: ServiceContract, fromDate: string, toDate: string): string[] {
  const { frequency, scheduleDays, customFrequencyDays } = contract;
  const allDates = eachDay(fromDate, toDate);

  switch (frequency) {
    case 'daily':
      return allDates.filter(d => WEEKDAY_NUMS.includes(getDayOfWeek(d)));

    case 'daily_all':
      return allDates.filter(d => ALL_DAYS_NUMS.includes(getDayOfWeek(d)));

    case 'weekly_1':
    case 'weekly_2':
    case 'weekly_3':
    case 'weekly_4':
    case 'weekly_5': {
      if (!scheduleDays.length) return [];
      const allowedDays = getScheduleDaysAsNumbers(scheduleDays);
      return allDates.filter(d => allowedDays.includes(getDayOfWeek(d)));
    }

    case 'biweekly': {
      if (!scheduleDays.length) return [];
      const allowedDays = getScheduleDaysAsNumbers(scheduleDays);
      const startRef = new Date(contract.startDate || fromDate + 'T00:00:00');
      return allDates.filter(d => {
        if (!allowedDays.includes(getDayOfWeek(d))) return false;
        const diff = Math.floor((new Date(d + 'T00:00:00').getTime() - startRef.getTime()) / (7 * 24 * 60 * 60 * 1000));
        return diff % 2 === 0;
      });
    }

    case 'monthly': {
      if (!scheduleDays.length && !customFrequencyDays.length) return [];
      const targetDays = customFrequencyDays.length > 0
        ? customFrequencyDays
        : scheduleDays.map(s => DAY_MAP[s.day]);
      return allDates.filter(d => targetDays.includes(getDayOfMonth(d)));
    }

    case 'custom': {
      if (!customFrequencyDays.length) return [];
      return allDates.filter(d => customFrequencyDays.includes(getDayOfMonth(d)));
    }

    case 'on_demand':
      return [];

    default:
      return [];
  }
}

// ─── Default tasks by cleaning type ───────────────────────────────────────────

const DEFAULT_TASKS: Record<string, string[]> = {
  general: ['Barrer / aspirar suelos', 'Fregar suelos', 'Limpiar polvo', 'Limpiar baños', 'Limpiar cocina', 'Vaciar papeleras'],
  office: ['Aspirar moqueta', 'Limpiar escritorios', 'Limpiar baños', 'Vaciar papeleras', 'Limpiar cristales interiores', 'Desinfectar pomos y superficies'],
  industrial: ['Barrer nave', 'Fregar suelos industriales', 'Limpieza de maquinaria exterior', 'Desengrasado', 'Vaciar residuos', 'Desinfección general'],
  post_construction: ['Retirar escombros', 'Limpiar polvo de obra', 'Fregar suelos', 'Limpiar cristales', 'Limpiar baños', 'Repaso general'],
  windows: ['Cristales exteriores', 'Cristales interiores', 'Marcos y persianas', 'Repaso de manchas'],
  disinfection: ['Desinfección superficies', 'Desinfección baños', 'Desinfección cocina', 'Nebulización', 'Desinfección textiles'],
  deep: ['Limpieza profunda baños', 'Limpieza profunda cocina', 'Limpieza interior armarios', 'Limpieza detrás de muebles', 'Limpieza de electrodomésticos', 'Desinfección general'],
};

function buildDefaultTasks(cleaningType: string) {
  const labels = DEFAULT_TASKS[cleaningType] || DEFAULT_TASKS.general;
  return labels.map((label, i) => ({ id: `t${i}`, label, done: false }));
}

// ─── Price calculation ────────────────────────────────────────────────────────

function calculateServicePrice(contract: ServiceContract, totalServicesInPeriod: number): number {
  if (contract.pricingModel === 'per_service') return contract.pricePerService;
  if (contract.pricingModel === 'per_hour') return contract.pricePerHour * contract.contractedHoursPerVisit;
  if (contract.pricingModel === 'monthly' && totalServicesInPeriod > 0) {
    return Number((contract.monthlyPrice / totalServicesInPeriod).toFixed(2));
  }
  return 0;
}

// ─── Generator ────────────────────────────────────────────────────────────────

export async function generateServicesFromContract(
  userId: string,
  contract: ServiceContract,
  options: GenerationOptions,
): Promise<GenerationResult> {
  const { fromDate, toDate, skipExisting = true } = options;
  const result: GenerationResult = { generated: 0, skipped: 0, errors: [], services: [] };

  if (contract.contractStatus !== 'active') {
    result.errors.push(`Contrato ${contract.contractNumber} no está activo`);
    return result;
  }

  if (contract.frequency === 'on_demand') {
    result.errors.push(`Contrato ${contract.contractNumber} es bajo demanda, no genera servicios automáticos`);
    return result;
  }

  const dates = getNextServiceDates(contract, fromDate, toDate);
  if (!dates.length) return result;

  let existingServices: CleaningService[] = [];
  if (skipExisting) {
    try {
      existingServices = await listCleaningServicesRequest(userId);
    } catch {
      existingServices = [];
    }
  }

  const pricePerService = calculateServicePrice(contract, dates.length);

  for (const date of dates) {
    if (skipExisting) {
      const exists = existingServices.some(
        s => s.contractId === contract._id && s.date === date && s.status !== 'cancelled',
      );
      if (exists) {
        result.skipped++;
        continue;
      }
    }

    const slot = getSlotForDay(contract.scheduleDays, getDayOfWeek(date));
    const time = slot?.startTime || '';

    try {
      const service = await createCleaningServiceRequest(userId, {
        contractId: contract._id,
        contractNumber: contract.contractNumber,
        clientName: contract.clientName,
        clientPhone: contract.clientPhone,
        clientEmail: contract.clientEmail,
        address: contract.address,
        clientType: contract.clientType,
        date,
        time,
        duration: String(contract.contractedHoursPerVisit || ''),
        cleaningType: contract.cleaningType,
        assignedTo: contract.assignedWorkerId,
        assignedToName: contract.assignedWorkerName,
        status: contract.assignedWorkerId ? 'assigned' : 'pending',
        tasks: buildDefaultTasks(contract.cleaningType),
        price: pricePerService,
        notes: contract.clientInstructions,
      });
      result.generated++;
      result.services.push(service);
    } catch (err: any) {
      result.errors.push(`Error generando servicio ${date}: ${err.message}`);
    }
  }

  return result;
}

export async function generateWeeklyServices(
  userId: string,
  contract: ServiceContract,
): Promise<GenerationResult> {
  const today = new Date();
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + (8 - today.getDay()) % 7 || 7);
  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextMonday.getDate() + 6);

  return generateServicesFromContract(userId, contract, {
    fromDate: nextMonday.toISOString().slice(0, 10),
    toDate: nextSunday.toISOString().slice(0, 10),
    skipExisting: true,
  });
}

export async function generateMonthlyServices(
  userId: string,
  contract: ServiceContract,
): Promise<GenerationResult> {
  const today = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 2, 0);

  return generateServicesFromContract(userId, contract, {
    fromDate: nextMonth.toISOString().slice(0, 10),
    toDate: lastDay.toISOString().slice(0, 10),
    skipExisting: true,
  });
}
