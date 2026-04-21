// ─── Scrapyard Vehicle Types ────────────────────────────────────────────────

export type ScrapyardFuelType = 'diesel' | 'gasolina' | 'hibrido' | 'electrico' | 'glp' | 'otro';
export type ScrapyardOriginType = 'particular' | 'aseguradora' | 'empresa' | 'subasta' | 'retirada_municipal' | 'otro';
export type ScrapyardAcquisitionType = 'compra' | 'retirada' | 'donacion' | 'abandono';
export type ScrapyardBajaStatus = 'pendiente' | 'solicitada' | 'en_tramite' | 'completada' | 'no_aplica';
export type ScrapyardVehicleStatus = 'recibido' | 'en_revision' | 'en_despiece' | 'despiezado' | 'compactado' | 'vendido_entero';
export type ScrapyardDocType = 'ficha_tecnica' | 'permiso_circulacion' | 'contrato' | 'certificado_baja' | 'foto_documento' | 'otro';
export type ScrapyardHistoryType = 'entrada' | 'cambio_estado' | 'movimiento' | 'documento' | 'foto' | 'edicion' | 'baja' | 'despiece';
export type ScrapyardPaymentMethod = 'efectivo' | 'transferencia' | 'compensacion';

export interface ScrapyardDocument {
  id: string;
  nombre: string;
  tipo: ScrapyardDocType;
  url: string;
  fechaSubida: string;
  subidoPor: string;
}

export interface ScrapyardHistoryEntry {
  id: string;
  fecha: string;
  tipo: ScrapyardHistoryType;
  descripcion: string;
  usuario: string;
  detalle?: Record<string, unknown>;
}

export interface ScrapyardVehicle {
  id: string;
  _rev?: string;
  type?: string;
  user_id?: string;
  business_id?: string;

  matricula: string;
  bastidor: string;
  marca: string;
  modelo: string;
  version?: string;
  anio: number;
  km: number;
  combustible: ScrapyardFuelType;
  color?: string;
  puertas?: number;
  potencia?: number;
  transmision?: 'manual' | 'automatico' | 'semiauto';
  tipoCarroceria?: string;

  tipoProcedencia: ScrapyardOriginType;
  tipoAdquisicion: ScrapyardAcquisitionType;
  propietarioNombre: string;
  propietarioDocumento?: string;
  propietarioTelefono?: string;
  propietarioEmail?: string;
  proveedorId?: string;

  fechaEntrada: string;
  costeCompra: number;
  costeTransporte?: number;
  formaPago?: ScrapyardPaymentMethod;

  documentos: ScrapyardDocument[];
  documentacionCompleta: boolean;
  fichaTecnica: boolean;
  permisoCirculacion: boolean;
  contratoCompraventa: boolean;
  certificadoBaja: boolean;

  estadoBaja: ScrapyardBajaStatus;
  fechaBaja?: string;
  centroItvBaja?: string;
  tipoBaja?: 'temporal' | 'definitiva';

  estado: ScrapyardVehicleStatus;

  ubicacion?: string;
  zonaId?: string;
  plazaId?: string;

  fotos: string[];
  fotoPortada?: string;

  observaciones?: string;
  historial: ScrapyardHistoryEntry[];

  creadoPor: string;
  creadoPorNombre: string;
  fechaCreacion: string;
  ultimaModificacion: string;
  modificadoPor?: string;
}

// ─── Alert Types ────────────────────────────────────────────────────────────

export type ScrapyardAlertSeverity = 'critical' | 'warning' | 'info';

export interface ScrapyardAlert {
  id: string;
  vehicleId: string;
  matricula: string;
  marcaModelo: string;
  tipo: string;
  mensaje: string;
  severity: ScrapyardAlertSeverity;
  dismissed?: boolean;
}

// ─── Permission keys ────────────────────────────────────────────────────────

export const SCRAPYARD_PERMISSIONS = [
  { key: 'scrapyard.entry.full', label: 'Entrada completa', description: 'Registrar, revisar y validar entradas' },
  { key: 'scrapyard.entry.basic', label: 'Entrada básica', description: 'Registrar entrada básica y fotos' },
  { key: 'scrapyard.entry.validate', label: 'Validar entradas', description: 'Aprobar/rechazar entradas registradas' },
  { key: 'scrapyard.docs.manage', label: 'Gestionar documentación', description: 'Subir, editar y eliminar documentos' },
  { key: 'scrapyard.location.manage', label: 'Gestionar ubicaciones', description: 'Asignar y mover vehículos' },
  { key: 'scrapyard.baja.manage', label: 'Gestionar bajas', description: 'Tramitar bajas de vehículos' },
  { key: 'scrapyard.delete', label: 'Eliminar vehículos', description: 'Eliminar registros de vehículos' },
] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

export const SCRAPYARD_ESTADOS: { value: ScrapyardVehicleStatus; label: string; color: string }[] = [
  { value: 'recibido', label: 'Recibido', color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
  { value: 'en_revision', label: 'En revisión', color: 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300' },
  { value: 'en_despiece', label: 'En despiece', color: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
  { value: 'despiezado', label: 'Despiezado', color: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' },
  { value: 'compactado', label: 'Compactado', color: 'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400' },
  { value: 'vendido_entero', label: 'Vendido entero', color: 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' },
];

export const SCRAPYARD_BAJA_ESTADOS: { value: ScrapyardBajaStatus; label: string; color: string }[] = [
  { value: 'pendiente', label: 'Pendiente', color: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
  { value: 'solicitada', label: 'Solicitada', color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
  { value: 'en_tramite', label: 'En trámite', color: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' },
  { value: 'completada', label: 'Completada', color: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' },
  { value: 'no_aplica', label: 'No aplica', color: 'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400' },
];

export const SCRAPYARD_PROCEDENCIAS: { value: ScrapyardOriginType; label: string; emoji: string }[] = [
  { value: 'particular', label: 'Particular', emoji: '👤' },
  { value: 'aseguradora', label: 'Aseguradora', emoji: '🛡️' },
  { value: 'empresa', label: 'Empresa', emoji: '🏢' },
  { value: 'subasta', label: 'Subasta', emoji: '⚖️' },
  { value: 'retirada_municipal', label: 'Retirada municipal', emoji: '🏛️' },
  { value: 'otro', label: 'Otro', emoji: '📋' },
];

export const SCRAPYARD_COMBUSTIBLES: { value: ScrapyardFuelType; label: string }[] = [
  { value: 'diesel', label: 'Diésel' },
  { value: 'gasolina', label: 'Gasolina' },
  { value: 'hibrido', label: 'Híbrido' },
  { value: 'electrico', label: 'Eléctrico' },
  { value: 'glp', label: 'GLP' },
  { value: 'otro', label: 'Otro' },
];

export const MARCAS_COMUNES = [
  'Abarth','Alfa Romeo','Audi','BMW','Chevrolet','Chrysler','Citroën','Cupra','Dacia','Daewoo',
  'Daihatsu','Fiat','Ford','Honda','Hyundai','Infiniti','Isuzu','Iveco','Jaguar','Jeep',
  'Kia','Lancia','Land Rover','Lexus','MAN','Mazda','Mercedes-Benz','MG','Mini','Mitsubishi',
  'Nissan','Opel','Peugeot','Porsche','Renault','Rover','Saab','Seat','Skoda','Smart',
  'SsangYong','Subaru','Suzuki','Tata','Tesla','Toyota','Volkswagen','Volvo',
];

export function emptyScrapyardVehicle(): Omit<ScrapyardVehicle, 'id'> {
  const now = new Date().toISOString();
  return {
    matricula: '',
    bastidor: '',
    marca: '',
    modelo: '',
    anio: new Date().getFullYear(),
    km: 0,
    combustible: 'diesel',
    tipoProcedencia: 'particular',
    tipoAdquisicion: 'compra',
    propietarioNombre: '',
    fechaEntrada: now.slice(0, 10),
    costeCompra: 0,
    documentos: [],
    documentacionCompleta: false,
    fichaTecnica: false,
    permisoCirculacion: false,
    contratoCompraventa: false,
    certificadoBaja: false,
    estadoBaja: 'pendiente',
    estado: 'recibido',
    fotos: [],
    historial: [],
    creadoPor: '',
    creadoPorNombre: '',
    fechaCreacion: now,
    ultimaModificacion: now,
  };
}
