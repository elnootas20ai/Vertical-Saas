import React, { useReducer, useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Car, FileText, Camera, MapPin, Check, ChevronLeft, ChevronRight, Save, AlertTriangle,
  X, Upload, Trash2, Star, GripVertical, Fuel, Settings2, Gauge, DoorOpen,
  Palette, Hash, Calendar, DollarSign, User, Building2, Eye, ArrowLeft,
  CircleAlert, CircleCheck, Info, Loader2,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { checkVehicleDuplicatesRequest, type DuplicateInfo } from '../../lib/vehicleApi';
import type { Vehicle } from '../../context/AppContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VehicleEntryState {
  registrationPlate: string;
  brand: string;
  model: string;
  version: string;
  year: string;
  color: string;
  vin: string;
  mileage: string;
  fuelType: string;
  transmission: string;
  power: string;
  doors: string;
  bodyType: string;
  origin: string;
  supplierName: string;
  supplierTaxId: string;
  supplierPhone: string;
  purchasePrice: string;
  salePrice: string;
  purchaseDate: string;
  ivaIncluded: boolean;
  auctionName: string;
  lotNumber: string;
  tradeInRef: string;
  otherOriginDetail: string;
  images: string[];
  location: string;
  workCenterId: string;
  status: string;
  notes: string;
}

type EntryAction =
  | { type: 'SET_FIELD'; field: keyof VehicleEntryState; value: string | boolean | string[] }
  | { type: 'ADD_IMAGES'; urls: string[] }
  | { type: 'REMOVE_IMAGE'; index: number }
  | { type: 'REORDER_IMAGES'; from: number; to: number }
  | { type: 'RESET' };

const INITIAL_STATE: VehicleEntryState = {
  registrationPlate: '',
  brand: '',
  model: '',
  version: '',
  year: '',
  color: '',
  vin: '',
  mileage: '',
  fuelType: '',
  transmission: '',
  power: '',
  doors: '',
  bodyType: '',
  origin: '',
  supplierName: '',
  supplierTaxId: '',
  supplierPhone: '',
  purchasePrice: '',
  salePrice: '',
  purchaseDate: new Date().toISOString().slice(0, 10),
  ivaIncluded: true,
  auctionName: '',
  lotNumber: '',
  tradeInRef: '',
  otherOriginDetail: '',
  images: [],
  location: '',
  workCenterId: '',
  status: 'available',
  notes: '',
};

function entryReducer(state: VehicleEntryState, action: EntryAction): VehicleEntryState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'ADD_IMAGES':
      return { ...state, images: [...state.images, ...action.urls].slice(0, 30) };
    case 'REMOVE_IMAGE':
      return { ...state, images: state.images.filter((_, i) => i !== action.index) };
    case 'REORDER_IMAGES': {
      const imgs = [...state.images];
      const [moved] = imgs.splice(action.from, 1);
      imgs.splice(action.to, 0, moved);
      return { ...state, images: imgs };
    }
    case 'RESET':
      return INITIAL_STATE;
    default:
      return state;
  }
}

const STEPS = [
  { id: 'identification', icon: Car, label: 'Identificación' },
  { id: 'technical', icon: Settings2, label: 'Datos técnicos' },
  { id: 'origin', icon: DollarSign, label: 'Origen y coste' },
  { id: 'photos', icon: Camera, label: 'Fotos' },
  { id: 'documents', icon: FileText, label: 'Documentación' },
  { id: 'review', icon: Check, label: 'Revisión' },
] as const;

const FUEL_OPTIONS = [
  { value: 'gasolina', label: 'Gasolina' },
  { value: 'diesel', label: 'Diésel' },
  { value: 'hibrido', label: 'Híbrido' },
  { value: 'electrico', label: 'Eléctrico' },
  { value: 'glp', label: 'GLP' },
  { value: 'otro', label: 'Otro' },
];

const TRANSMISSION_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'automatico', label: 'Automático' },
  { value: 'semiauto', label: 'Semiautomático' },
];

const BODY_OPTIONS = [
  { value: 'sedan', label: 'Berlina' },
  { value: 'suv', label: 'SUV' },
  { value: 'familiar', label: 'Familiar' },
  { value: 'coupe', label: 'Coupé' },
  { value: 'cabrio', label: 'Cabrio' },
  { value: 'furgon', label: 'Furgoneta' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'otro', label: 'Otro' },
];

const ORIGIN_OPTIONS = [
  { value: 'particular', label: 'Particular' },
  { value: 'empresa', label: 'Empresa / Proveedor' },
  { value: 'subasta', label: 'Subasta' },
  { value: 'permuta', label: 'Permuta' },
  { value: 'otro', label: 'Otro' },
];

const STATUS_OPTIONS = [
  { value: 'available', label: 'En stock', color: 'bg-emerald-500' },
  { value: 'workshop', label: 'En taller', color: 'bg-amber-500' },
  { value: 'reserved', label: 'Reservado', color: 'bg-violet-500' },
];

const DOC_TYPES = [
  { type: 'ficha_tecnica', label: 'Ficha técnica', recommended: true },
  { type: 'permiso_circulacion', label: 'Permiso de circulación', recommended: true },
  { type: 'itv', label: 'ITV vigente', recommended: false },
  { type: 'seguro', label: 'Seguro', recommended: false },
  { type: 'contrato_compraventa', label: 'Contrato de compraventa', recommended: false },
  { type: 'factura_compra', label: 'Factura de compra', recommended: false },
  { type: 'informe_historial', label: 'Informe de historial', recommended: false },
  { type: 'otro', label: 'Otro', recommended: false },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isValidVin(vin: string): boolean {
  if (!vin) return true;
  const cleaned = vin.replace(/\s/g, '').toUpperCase();
  if (cleaned.length !== 17) return false;
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(cleaned);
}

function formatMileage(val: string): string {
  const num = parseInt(val.replace(/\D/g, ''), 10);
  if (Number.isNaN(num)) return '';
  return num.toLocaleString('es-ES');
}

function parseMileage(val: string): string {
  return val.replace(/\D/g, '');
}

// ─── Field components ────────────────────────────────────────────────────────

function Field({ label, required, error, children, hint }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
      {error && <p className="text-xs text-red-500 flex items-center gap-1"><CircleAlert className="w-3 h-3" />{error}</p>}
    </div>
  );
}

const inputClass = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition';
const selectClass = inputClass;

// ─── Step: Identification ────────────────────────────────────────────────────

function StepIdentification({ state, dispatch, duplicates }: {
  state: VehicleEntryState;
  dispatch: React.Dispatch<EntryAction>;
  duplicates: { plate: DuplicateInfo | null; vin: DuplicateInfo | null };
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Marca" required error={!state.brand ? undefined : undefined}>
          <input className={inputClass} placeholder="Ej: BMW, Audi, Seat..." value={state.brand}
            onChange={e => dispatch({ type: 'SET_FIELD', field: 'brand', value: e.target.value })} />
        </Field>
        <Field label="Modelo" required>
          <input className={inputClass} placeholder="Ej: Serie 3, A4, León..." value={state.model}
            onChange={e => dispatch({ type: 'SET_FIELD', field: 'model', value: e.target.value })} />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Versión">
          <input className={inputClass} placeholder="Ej: 320d M Sport" value={state.version}
            onChange={e => dispatch({ type: 'SET_FIELD', field: 'version', value: e.target.value })} />
        </Field>
        <Field label="Año" required>
          <input className={inputClass} type="number" min="1900" max={new Date().getFullYear() + 1} placeholder="Ej: 2023"
            value={state.year} onChange={e => dispatch({ type: 'SET_FIELD', field: 'year', value: e.target.value })} />
        </Field>
        <Field label="Color">
          <input className={inputClass} placeholder="Ej: Negro, Blanco..." value={state.color}
            onChange={e => dispatch({ type: 'SET_FIELD', field: 'color', value: e.target.value })} />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Field label="Matrícula" required>
            <input className={`${inputClass} uppercase`} placeholder="Ej: 1234 ABC" value={state.registrationPlate}
              onChange={e => dispatch({ type: 'SET_FIELD', field: 'registrationPlate', value: e.target.value.toUpperCase() })} />
          </Field>
          {duplicates.plate && (
            <div className="mt-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="text-amber-700 dark:text-amber-300 font-medium">Matrícula ya registrada</p>
                <p className="text-amber-600 dark:text-amber-400">
                  {duplicates.plate.brand} {duplicates.plate.model} — {duplicates.plate.status}
                </p>
                <a href={`/saas/vehicles/${duplicates.plate.vehicleId}`} target="_blank" rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 text-xs hover:underline flex items-center gap-1 mt-1">
                  <Eye className="w-3 h-3" />Ver vehículo
                </a>
              </div>
            </div>
          )}
        </div>
        <div>
          <Field label="Bastidor (VIN)" hint="17 caracteres — se encuentra en la ficha técnica y en el parabrisas"
            error={state.vin && !isValidVin(state.vin) ? 'VIN debe tener 17 caracteres alfanuméricos (sin I, O, Q)' : undefined}>
            <input className={`${inputClass} uppercase font-mono tracking-wider`} placeholder="Ej: WBAPH5C55BA123456" maxLength={17}
              value={state.vin} onChange={e => dispatch({ type: 'SET_FIELD', field: 'vin', value: e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '') })} />
          </Field>
          {duplicates.vin && (
            <div className="mt-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 flex items-start gap-2">
              <CircleAlert className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="text-red-700 dark:text-red-300 font-medium">Bastidor ya registrado</p>
                <p className="text-red-600 dark:text-red-400">
                  {duplicates.vin.brand} {duplicates.vin.model} — {duplicates.vin.registrationPlate}
                </p>
                <a href={`/saas/vehicles/${duplicates.vin.vehicleId}`} target="_blank" rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 text-xs hover:underline flex items-center gap-1 mt-1">
                  <Eye className="w-3 h-3" />Ver vehículo
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step: Technical ─────────────────────────────────────────────────────────

function StepTechnical({ state, dispatch }: {
  state: VehicleEntryState; dispatch: React.Dispatch<EntryAction>;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Kilómetros" required>
          <div className="relative">
            <input className={`${inputClass} pr-10`} placeholder="Ej: 125.430"
              value={state.mileage ? formatMileage(state.mileage) : ''}
              onChange={e => dispatch({ type: 'SET_FIELD', field: 'mileage', value: parseMileage(e.target.value) })} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">km</span>
          </div>
        </Field>
        <Field label="Combustible" required>
          <select className={selectClass} value={state.fuelType}
            onChange={e => dispatch({ type: 'SET_FIELD', field: 'fuelType', value: e.target.value })}>
            <option value="">Seleccionar...</option>
            {FUEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Cambio" required>
          <select className={selectClass} value={state.transmission}
            onChange={e => dispatch({ type: 'SET_FIELD', field: 'transmission', value: e.target.value })}>
            <option value="">Seleccionar...</option>
            {TRANSMISSION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Potencia">
          <div className="relative">
            <input className={`${inputClass} pr-10`} type="number" min="0" placeholder="Ej: 150"
              value={state.power} onChange={e => dispatch({ type: 'SET_FIELD', field: 'power', value: e.target.value })} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">CV</span>
          </div>
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Puertas">
          <select className={selectClass} value={state.doors}
            onChange={e => dispatch({ type: 'SET_FIELD', field: 'doors', value: e.target.value })}>
            <option value="">Seleccionar...</option>
            {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n} puertas</option>)}
          </select>
        </Field>
        <Field label="Carrocería">
          <select className={selectClass} value={state.bodyType}
            onChange={e => dispatch({ type: 'SET_FIELD', field: 'bodyType', value: e.target.value })}>
            <option value="">Seleccionar...</option>
            {BODY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      </div>
    </div>
  );
}

// ─── Step: Origin & Cost ─────────────────────────────────────────────────────

function StepOriginCost({ state, dispatch }: {
  state: VehicleEntryState; dispatch: React.Dispatch<EntryAction>;
}) {
  const purchase = parseFloat(state.purchasePrice) || 0;
  const sale = parseFloat(state.salePrice) || 0;
  const margin = sale > 0 ? sale - purchase : null;
  const marginPct = purchase > 0 && margin !== null ? ((margin / purchase) * 100).toFixed(1) : null;

  return (
    <div className="space-y-6">
      <Field label="Origen del vehículo" required>
        <select className={selectClass} value={state.origin}
          onChange={e => dispatch({ type: 'SET_FIELD', field: 'origin', value: e.target.value })}>
          <option value="">Seleccionar...</option>
          {ORIGIN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>

      {state.origin === 'particular' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nombre del particular">
            <input className={inputClass} placeholder="Nombre y apellidos" value={state.supplierName}
              onChange={e => dispatch({ type: 'SET_FIELD', field: 'supplierName', value: e.target.value })} />
          </Field>
          <Field label="Teléfono">
            <input className={inputClass} type="tel" placeholder="Ej: 612 345 678" value={state.supplierPhone}
              onChange={e => dispatch({ type: 'SET_FIELD', field: 'supplierPhone', value: e.target.value })} />
          </Field>
        </div>
      )}

      {state.origin === 'empresa' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Nombre empresa / proveedor" required>
            <input className={inputClass} placeholder="Nombre de la empresa" value={state.supplierName}
              onChange={e => dispatch({ type: 'SET_FIELD', field: 'supplierName', value: e.target.value })} />
          </Field>
          <Field label="CIF / NIF">
            <input className={inputClass} placeholder="Ej: B12345678" value={state.supplierTaxId}
              onChange={e => dispatch({ type: 'SET_FIELD', field: 'supplierTaxId', value: e.target.value })} />
          </Field>
          <Field label="Teléfono">
            <input className={inputClass} type="tel" placeholder="Ej: 912 345 678" value={state.supplierPhone}
              onChange={e => dispatch({ type: 'SET_FIELD', field: 'supplierPhone', value: e.target.value })} />
          </Field>
        </div>
      )}

      {state.origin === 'subasta' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nombre de subasta">
            <input className={inputClass} placeholder="Ej: Autorola, BCA..." value={state.auctionName}
              onChange={e => dispatch({ type: 'SET_FIELD', field: 'auctionName', value: e.target.value })} />
          </Field>
          <Field label="Nº de lote">
            <input className={inputClass} placeholder="Nº lote" value={state.lotNumber}
              onChange={e => dispatch({ type: 'SET_FIELD', field: 'lotNumber', value: e.target.value })} />
          </Field>
        </div>
      )}

      {state.origin === 'permuta' && (
        <Field label="Vehículo entregado en permuta">
          <input className={inputClass} placeholder="Referencia del vehículo entregado" value={state.tradeInRef}
            onChange={e => dispatch({ type: 'SET_FIELD', field: 'tradeInRef', value: e.target.value })} />
        </Field>
      )}

      {state.origin === 'otro' && (
        <Field label="Especificar origen">
          <input className={inputClass} placeholder="Detalle del origen" value={state.otherOriginDetail}
            onChange={e => dispatch({ type: 'SET_FIELD', field: 'otherOriginDetail', value: e.target.value })} />
        </Field>
      )}

      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Datos económicos</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Precio de compra" required>
            <div className="relative">
              <input className={`${inputClass} pr-8`} type="number" min="0" step="0.01" placeholder="Ej: 12500"
                value={state.purchasePrice} onChange={e => dispatch({ type: 'SET_FIELD', field: 'purchasePrice', value: e.target.value })} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
            </div>
          </Field>
          <Field label="Fecha de entrada" required>
            <input className={inputClass} type="date" max={new Date().toISOString().slice(0, 10)}
              value={state.purchaseDate} onChange={e => dispatch({ type: 'SET_FIELD', field: 'purchaseDate', value: e.target.value })} />
          </Field>
          <Field label="Precio estimado de venta">
            <div className="relative">
              <input className={`${inputClass} pr-8`} type="number" min="0" step="0.01" placeholder="Ej: 15900"
                value={state.salePrice} onChange={e => dispatch({ type: 'SET_FIELD', field: 'salePrice', value: e.target.value })} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
            </div>
          </Field>
        </div>
        {margin !== null && (
          <div className={`mt-3 p-3 rounded-lg ${margin >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
            <p className={`text-sm font-medium ${margin >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
              Margen estimado: {margin.toLocaleString('es-ES', { minimumFractionDigits: 2 })} € ({marginPct}%)
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Orientativo. Se puede modificar desde la ficha del vehículo.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step: Photos ────────────────────────────────────────────────────────────

function StepPhotos({ state, dispatch }: {
  state: VehicleEntryState; dispatch: React.Dispatch<EntryAction>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    setProcessing(true);
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/i)) continue;
      if (file.size > 10 * 1024 * 1024) continue;
      try {
        const url = await new Promise<string>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const maxSide = 2048;
            let { width, height } = img;
            if (width > maxSide || height > maxSide) {
              const ratio = Math.min(maxSide / width, maxSide / height);
              width = Math.round(width * ratio);
              height = Math.round(height * ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          };
          img.onerror = reject;
          img.src = URL.createObjectURL(file);
        });
        urls.push(url);
      } catch { /* skip invalid */ }
    }
    if (urls.length) dispatch({ type: 'ADD_IMAGES', urls });
    setProcessing(false);
  }, [dispatch]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
  }, [processFiles]);

  return (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition"
      >
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
          onChange={e => e.target.files && processFiles(e.target.files)} />
        {processing ? (
          <Loader2 className="w-8 h-8 mx-auto text-blue-500 animate-spin" />
        ) : (
          <>
            <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Arrastra las fotos aquí o haz clic para seleccionar</p>
            <p className="text-xs text-gray-400 mt-1">JPEG, PNG, WEBP — Máx. 10MB por foto — Hasta 30 fotos</p>
          </>
        )}
      </div>

      {state.images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {state.images.map((url, i) => (
            <div key={i} className="relative group rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 aspect-[4/3]">
              <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
              {i === 0 && (
                <span className="absolute top-1.5 left-1.5 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <Star className="w-2.5 h-2.5" />Principal
                </span>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                <button
                  onClick={() => dispatch({ type: 'REMOVE_IMAGE', index: i })}
                  className="opacity-0 group-hover:opacity-100 transition bg-red-500 text-white p-1.5 rounded-full hover:bg-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {i > 0 && (
                <button
                  onClick={() => dispatch({ type: 'REORDER_IMAGES', from: i, to: 0 })}
                  className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition bg-white/90 dark:bg-gray-900/90 text-gray-700 dark:text-gray-300 p-1 rounded text-[10px] font-medium hover:bg-white"
                >
                  <Star className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">{state.images.length}/30 fotos — La primera será la portada</p>
    </div>
  );
}

// ─── Step: Documents ─────────────────────────────────────────────────────────

interface DocFile { type: string; name: string; dataUrl: string; mimeType: string; size: number; }

function StepDocuments({ docs, setDocs }: {
  docs: DocFile[]; setDocs: React.Dispatch<React.SetStateAction<DocFile[]>>;
}) {
  const handleUpload = useCallback((docType: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,image/jpeg,image/png,image/webp';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file || file.size > 20 * 1024 * 1024) return;
      const reader = new FileReader();
      reader.onload = () => {
        setDocs(prev => [...prev.filter(d => d.type !== docType), {
          type: docType,
          name: file.name,
          dataUrl: reader.result as string,
          mimeType: file.type,
          size: file.size,
        }]);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [setDocs]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Sube la documentación del vehículo. Los documentos marcados con ⭐ son recomendados.
      </p>
      <div className="space-y-2">
        {DOC_TYPES.map(dt => {
          const uploaded = docs.find(d => d.type === dt.type);
          return (
            <div key={dt.type} className={`flex items-center justify-between p-3 rounded-lg border transition ${
              uploaded
                ? 'border-emerald-200 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/20'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
            }`}>
              <div className="flex items-center gap-3 min-w-0">
                {uploaded ? (
                  <CircleCheck className="w-5 h-5 text-emerald-500 shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                    {dt.recommended && <span className="text-amber-500 mr-1">⭐</span>}
                    {dt.label}
                  </p>
                  {uploaded && (
                    <p className="text-xs text-gray-400 truncate">{uploaded.name} — {(uploaded.size / 1024).toFixed(0)} KB</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {uploaded && (
                  <button onClick={() => setDocs(prev => prev.filter(d => d.type !== dt.type))}
                    className="p-1 text-gray-400 hover:text-red-500 transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => handleUpload(dt.type)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 transition"
                >
                  {uploaded ? 'Cambiar' : 'Subir'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 text-center mt-2">{docs.length}/{DOC_TYPES.length} documentos subidos — PDF, JPEG, PNG, WEBP (máx. 20MB)</p>
    </div>
  );
}

// ─── Step: Review ────────────────────────────────────────────────────────────

function StepReview({ state, dispatch, docs, duplicates }: {
  state: VehicleEntryState;
  dispatch: React.Dispatch<EntryAction>;
  docs: DocFile[];
  duplicates: { plate: DuplicateInfo | null; vin: DuplicateInfo | null };
}) {
  const { locations } = useApp();

  const errors: string[] = [];
  if (!state.brand) errors.push('Marca');
  if (!state.model) errors.push('Modelo');
  if (!state.registrationPlate) errors.push('Matrícula');
  if (!state.year) errors.push('Año');
  if (!state.mileage) errors.push('Kilómetros');
  if (!state.fuelType) errors.push('Combustible');
  if (!state.transmission) errors.push('Cambio');
  if (!state.origin) errors.push('Origen');
  if (!state.purchasePrice || parseFloat(state.purchasePrice) <= 0) errors.push('Precio de compra');
  if (!state.purchaseDate) errors.push('Fecha de entrada');
  if (state.origin === 'empresa' && !state.supplierName) errors.push('Nombre proveedor');

  const warnings: string[] = [];
  if (duplicates.plate) warnings.push('Matrícula duplicada detectada');
  if (duplicates.vin) warnings.push('Bastidor duplicado detectado');
  if (state.images.length === 0) warnings.push('Sin fotos adjuntas');
  if (docs.length === 0) warnings.push('Sin documentación');
  else {
    if (!docs.some(d => d.type === 'ficha_tecnica')) warnings.push('Falta ficha técnica');
    if (!docs.some(d => d.type === 'permiso_circulacion')) warnings.push('Falta permiso de circulación');
  }
  if (!state.vin) warnings.push('VIN no rellenado');
  if (!state.salePrice) warnings.push('Precio de venta no estimado');

  return (
    <div className="space-y-6">
      {errors.length > 0 && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700">
          <div className="flex items-center gap-2 mb-2">
            <CircleAlert className="w-4 h-4 text-red-500" />
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">Campos obligatorios sin rellenar</p>
          </div>
          <ul className="text-xs text-red-600 dark:text-red-400 list-disc list-inside space-y-0.5">
            {errors.map(e => <li key={e}>{e}</li>)}
          </ul>
        </div>
      )}

      {warnings.length > 0 && errors.length === 0 && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Advertencias</p>
          </div>
          <ul className="text-xs text-amber-600 dark:text-amber-400 list-disc list-inside space-y-0.5">
            {warnings.map(w => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}

      {errors.length === 0 && warnings.length === 0 && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 flex items-center gap-2">
          <CircleCheck className="w-5 h-5 text-emerald-500" />
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">El vehículo está listo para dar de alta</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-2">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Vehículo</h4>
          <p className="text-base font-bold text-gray-900 dark:text-white">{state.brand} {state.model} {state.version}</p>
          <div className="grid grid-cols-2 gap-1 text-xs text-gray-500">
            <span>Matrícula: <b className="text-gray-700 dark:text-gray-300">{state.registrationPlate || '—'}</b></span>
            <span>Año: <b className="text-gray-700 dark:text-gray-300">{state.year || '—'}</b></span>
            <span>Color: <b className="text-gray-700 dark:text-gray-300">{state.color || '—'}</b></span>
            <span>VIN: <b className="text-gray-700 dark:text-gray-300 font-mono text-[10px]">{state.vin || '—'}</b></span>
          </div>
        </div>
        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-2">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Técnico</h4>
          <div className="grid grid-cols-2 gap-1 text-xs text-gray-500">
            <span>Km: <b className="text-gray-700 dark:text-gray-300">{state.mileage ? formatMileage(state.mileage) : '—'}</b></span>
            <span>Combustible: <b className="text-gray-700 dark:text-gray-300">{FUEL_OPTIONS.find(o => o.value === state.fuelType)?.label || '—'}</b></span>
            <span>Cambio: <b className="text-gray-700 dark:text-gray-300">{TRANSMISSION_OPTIONS.find(o => o.value === state.transmission)?.label || '—'}</b></span>
            <span>Potencia: <b className="text-gray-700 dark:text-gray-300">{state.power ? `${state.power} CV` : '—'}</b></span>
          </div>
        </div>
        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-2">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Origen y coste</h4>
          <div className="grid grid-cols-2 gap-1 text-xs text-gray-500">
            <span>Origen: <b className="text-gray-700 dark:text-gray-300">{ORIGIN_OPTIONS.find(o => o.value === state.origin)?.label || '—'}</b></span>
            <span>Proveedor: <b className="text-gray-700 dark:text-gray-300">{state.supplierName || '—'}</b></span>
            <span>Compra: <b className="text-gray-700 dark:text-gray-300">{state.purchasePrice ? `${parseFloat(state.purchasePrice).toLocaleString('es-ES')} €` : '—'}</b></span>
            <span>Fecha: <b className="text-gray-700 dark:text-gray-300">{state.purchaseDate || '—'}</b></span>
          </div>
        </div>
        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-2">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Media y docs</h4>
          <div className="grid grid-cols-2 gap-1 text-xs text-gray-500">
            <span>Fotos: <b className="text-gray-700 dark:text-gray-300">{state.images.length}</b></span>
            <span>Documentos: <b className="text-gray-700 dark:text-gray-300">{docs.length}/{DOC_TYPES.length}</b></span>
          </div>
          {state.images.length > 0 && (
            <div className="flex gap-1 mt-1">
              {state.images.slice(0, 5).map((url, i) => (
                <div key={i} className="w-10 h-8 rounded overflow-hidden bg-gray-100">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
              {state.images.length > 5 && (
                <div className="w-10 h-8 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[10px] text-gray-500">
                  +{state.images.length - 5}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Location, Status, Notes */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Ubicación">
            <select className={selectClass} value={state.location}
              onChange={e => dispatch({ type: 'SET_FIELD', field: 'location', value: e.target.value })}>
              <option value="">Sin asignar</option>
              {(locations || []).map(loc => (
                <option key={loc.id} value={loc.name}>{loc.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Estado inicial" required>
            <select className={selectClass} value={state.status}
              onChange={e => dispatch({ type: 'SET_FIELD', field: 'status', value: e.target.value })}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <div />
        </div>
        <Field label="Observaciones">
          <textarea className={`${inputClass} resize-none`} rows={3} maxLength={2000}
            placeholder="Notas internas sobre el vehículo..."
            value={state.notes} onChange={e => dispatch({ type: 'SET_FIELD', field: 'notes', value: e.target.value })} />
          <p className="text-xs text-gray-400 text-right">{state.notes.length}/2000</p>
        </Field>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function VehicleEntryPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { addVehicle } = useApp();
  const { user: authUser } = useAuth();
  const [state, dispatch] = useReducer(entryReducer, INITIAL_STATE);
  const [currentStep, setCurrentStep] = useState(0);
  const [docs, setDocs] = useState<DocFile[]>([]);
  const [duplicates, setDuplicates] = useState<{ plate: DuplicateInfo | null; vin: DuplicateInfo | null }>({ plate: null, vin: null });
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const dupCheckTimer = useRef<ReturnType<typeof setTimeout>>();

  // Duplicate check with debounce
  useEffect(() => {
    if (!authUser?.user_id) return;
    if (!state.registrationPlate && !state.vin) {
      setDuplicates({ plate: null, vin: null });
      return;
    }
    clearTimeout(dupCheckTimer.current);
    dupCheckTimer.current = setTimeout(async () => {
      try {
        const result = await checkVehicleDuplicatesRequest(authUser.user_id, {
          registrationPlate: state.registrationPlate || undefined,
          vin: state.vin || undefined,
        });
        setDuplicates({ plate: result.plate, vin: result.vin });
      } catch { /* silent */ }
    }, 500);
    return () => clearTimeout(dupCheckTimer.current);
  }, [state.registrationPlate, state.vin, authUser?.user_id]);

  // Load draft from localStorage
  useEffect(() => {
    try {
      const draft = localStorage.getItem(`vehicle-entry-draft:${authUser?.user_id}`);
      if (draft) {
        const parsed = JSON.parse(draft);
        Object.entries(parsed).forEach(([key, value]) => {
          if (key in INITIAL_STATE) {
            dispatch({ type: 'SET_FIELD', field: key as keyof VehicleEntryState, value: value as string });
          }
        });
      }
    } catch { /* ignore */ }
  }, [authUser?.user_id]);

  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(`vehicle-entry-draft:${authUser?.user_id}`, JSON.stringify(state));
    } catch { /* ignore */ }
  }, [state, authUser?.user_id]);

  const hasErrors = !state.brand || !state.model || !state.registrationPlate || !state.year ||
    !state.mileage || !state.fuelType || !state.transmission || !state.origin ||
    !state.purchasePrice || parseFloat(state.purchasePrice) <= 0 || !state.purchaseDate ||
    (state.origin === 'empresa' && !state.supplierName);

  const handleSubmit = async () => {
    if (hasErrors) return;
    setSaving(true);
    try {
      const vehicle: Partial<Vehicle> = {
        registrationPlate: state.registrationPlate,
        brand: state.brand,
        model: state.model,
        version: state.version || undefined,
        year: parseInt(state.year, 10),
        color: state.color,
        vin: state.vin || undefined,
        mileage: parseInt(state.mileage, 10) || undefined,
        fuelType: state.fuelType as Vehicle['fuelType'],
        transmission: state.transmission as Vehicle['transmission'],
        power: state.power ? parseInt(state.power, 10) : undefined,
        doors: state.doors ? parseInt(state.doors, 10) : undefined,
        bodyType: state.bodyType as Vehicle['bodyType'],
        origin: state.origin as Vehicle['origin'],
        supplierName: state.supplierName || undefined,
        purchasePrice: parseFloat(state.purchasePrice),
        salePrice: state.salePrice ? parseFloat(state.salePrice) : undefined,
        purchaseDate: state.purchaseDate,
        status: state.status as Vehicle['status'],
        location: state.location || undefined,
        images: state.images,
        notes: state.notes || undefined,
      };

      const result = await addVehicle(vehicle as Omit<Vehicle, 'id' | 'createdAt' | 'daysInStock'>);
      localStorage.removeItem(`vehicle-entry-draft:${authUser?.user_id}`);
      if (result?.id) {
        navigate(`/saas/vehicles/${result.id}`);
      } else {
        navigate('/saas/vehicles');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al dar de alta el vehículo';
      alert(message);
    } finally {
      setSaving(false);
      setShowConfirm(false);
    }
  };

  const stepContent = [
    <StepIdentification key="id" state={state} dispatch={dispatch} duplicates={duplicates} />,
    <StepTechnical key="tech" state={state} dispatch={dispatch} />,
    <StepOriginCost key="origin" state={state} dispatch={dispatch} />,
    <StepPhotos key="photos" state={state} dispatch={dispatch} />,
    <StepDocuments key="docs" docs={docs} setDocs={setDocs} />,
    <StepReview key="review" state={state} dispatch={dispatch} docs={docs} duplicates={duplicates} />,
  ];

  const stepValidation = [
    Boolean(state.brand && state.model && state.registrationPlate && state.year),
    Boolean(state.mileage && state.fuelType && state.transmission),
    Boolean(state.origin && state.purchasePrice && parseFloat(state.purchasePrice) > 0 && state.purchaseDate),
    true,
    true,
    !hasErrors,
  ];

  return (
    <Layout title="Entrada de vehículo">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/saas/vehicles')} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition">
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Entrada de vehículo</h1>
              <p className="text-xs text-gray-400">Vehículos › Nueva entrada</p>
            </div>
          </div>
          <button onClick={saveDraft}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition">
            <Save className="w-3.5 h-3.5" />Guardar borrador
          </button>
        </div>
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Stepper */}
          <div className="lg:w-60 shrink-0">
            <div className="lg:sticky lg:top-20">
              {/* Mobile: horizontal */}
              <div className="flex lg:hidden gap-1 overflow-x-auto pb-2">
                {STEPS.map((step, i) => {
                  const Icon = step.icon;
                  const valid = stepValidation[i];
                  const active = i === currentStep;
                  return (
                    <button key={step.id} onClick={() => setCurrentStep(i)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                        active
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                          : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      {valid && i < currentStep ? (
                        <CircleCheck className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Icon className="w-4 h-4" />
                      )}
                      <span className="hidden sm:inline">{step.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Desktop: vertical */}
              <nav className="hidden lg:flex flex-col gap-1">
                {STEPS.map((step, i) => {
                  const Icon = step.icon;
                  const valid = stepValidation[i];
                  const active = i === currentStep;
                  return (
                    <button key={step.id} onClick={() => setCurrentStep(i)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition text-left ${
                        active
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${
                        active ? 'bg-blue-100 dark:bg-blue-800' : valid && i < currentStep ? 'bg-emerald-100 dark:bg-emerald-800' : 'bg-gray-100 dark:bg-gray-700'
                      }`}>
                        {valid && i < currentStep ? (
                          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Icon className={`w-4 h-4 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`} />
                        )}
                      </div>
                      <div>
                        <p className={active ? '' : ''}>{step.label}</p>
                        <p className="text-[10px] text-gray-400 font-normal">Paso {i + 1} de {STEPS.length}</p>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 min-h-[400px]">
              <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">{STEPS[currentStep].label}</h2>
              <p className="text-xs text-gray-400 mb-6">Paso {currentStep + 1} de {STEPS.length}</p>
              {stepContent[currentStep]}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="sticky bottom-0 z-30 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ChevronLeft className="w-4 h-4" />Anterior
          </button>

          <div className="flex items-center gap-2">
            {currentStep < STEPS.length - 1 ? (
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
              >
                Siguiente<ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => setShowConfirm(true)}
                disabled={hasErrors || saving}
                className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Dar de alta
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <Car className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Confirmar alta</h3>
                <p className="text-xs text-gray-400">¿Dar de alta este vehículo?</p>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-sm space-y-1">
              <p className="font-semibold text-gray-900 dark:text-white">{state.brand} {state.model} {state.version}</p>
              <p className="text-gray-500">Matrícula: {state.registrationPlate} — Año: {state.year}</p>
              <p className="text-gray-500">Precio compra: {parseFloat(state.purchasePrice).toLocaleString('es-ES')} €</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition">
                Cancelar
              </button>
              <button onClick={handleSubmit} disabled={saving}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm disabled:opacity-50 transition flex items-center justify-center gap-1.5">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
