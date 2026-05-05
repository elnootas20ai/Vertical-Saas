import { useState, useEffect } from 'react';
import { X, FileText, CheckCircle, AlertCircle, Eye, Loader2, Receipt } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';
import {
  loadDocumentTemplates,
  getSeedDocumentTemplates,
  saveDocumentTemplates,
  type DocumentTemplate,
} from '../../lib/documentTemplates';
import {
  saveContractAndGenerateInvoice,
  buildTemplateVars,
  renderTemplateHtml,
  type ContractType,
} from '../../lib/contractsApi';

interface Client {
  id: string;
  name: string;
  dni: string;
  phone: string;
  email: string;
  address?: string;
  city?: string;
  postalCode?: string;
}

interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number;
  registrationPlate?: string;
  salePrice?: number;
}

interface ContractResult {
  contractId: string;
  invoiceNumber: string;
  renderedHtml: string;
  templateTitle: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  client: Client;
  vehicles: Vehicle[];
  userId: string;
  responsibleName?: string;
  companyName?: string;
  companyCif?: string;
  companyAddress?: string;
  onSubmit?: (result: ContractResult) => void;
}

interface TemplateOption {
  id: string;
  name: string;
  description: string;
  icon: string;
  contractTypes: ContractType[];
  templateScope: 'sales' | 'billing' | 'delivery' | 'global';
}

const CONTRACT_OPTIONS: TemplateOption[] = [
  {
    id: 'venta',
    name: 'Contrato de compraventa',
    description: 'Venta de vehículo al cliente',
    icon: '📤',
    contractTypes: ['venta'],
    templateScope: 'sales',
  },
  {
    id: 'reserva',
    name: 'Contrato de reserva',
    description: 'Señal de reserva de vehículo',
    icon: '🔖',
    contractTypes: ['reserva'],
    templateScope: 'sales',
  },
  {
    id: 'compra',
    name: 'Contrato de compra',
    description: 'Adquisición de vehículo de particular',
    icon: '📥',
    contractTypes: ['compra'],
    templateScope: 'sales',
  },
];

type Step = 'form' | 'preview' | 'done';

function ensureTemplatesExist(): DocumentTemplate[] {
  let templates = loadDocumentTemplates();
  if (!templates.length) {
    templates = getSeedDocumentTemplates();
    saveDocumentTemplates(templates);
  }
  return templates;
}

function getContractTemplate(templates: DocumentTemplate[], scope: 'sales' | 'billing'): DocumentTemplate | null {
  return (
    templates.find((t) => t.id === 'template-contract' && scope === 'sales') ||
    templates.find((t) => t.scope === scope) ||
    templates[0] ||
    null
  );
}

function getInvoiceTemplate(templates: DocumentTemplate[]): DocumentTemplate | null {
  return (
    templates.find((t) => t.id === 'template-invoice') ||
    templates.find((t) => t.scope === 'billing') ||
    null
  );
}

export function SAAS__CreateContractModal({
  isOpen,
  onClose,
  client,
  vehicles,
  userId,
  responsibleName = 'Sin asignar',
  companyName = 'Ejemplo Automoción',
  companyCif = '',
  companyAddress = '',
  onSubmit,
}: Props) {
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');
  const [formData, setFormData] = useState({ price: '', paymentMethod: 'Transferencia', notes: '' });
  const [step, setStep] = useState<Step>('form');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [renderedContractHtml, setRenderedContractHtml] = useState('');
  const [renderedInvoiceHtml, setRenderedInvoiceHtml] = useState('');
  const [activePreview, setActivePreview] = useState<'contract' | 'invoice'>('contract');
  const [result, setResult] = useState<ContractResult | null>(null);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);

  useEffect(() => {
    if (isOpen) {
      setTemplates(ensureTemplatesExist());
      setStep('form');
      setError('');
      setResult(null);
      setRenderedContractHtml('');
      setRenderedInvoiceHtml('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedType('');
      setSelectedVehicle('');
      setFormData({ price: '', paymentMethod: 'Transferencia', notes: '' });
    }
  }, [isOpen]);

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const vehicle = vehicles.find((v) => v.id === selectedVehicle);
  const effectivePrice = formData.price
    ? Number(formData.price.replace(/[.,]/g, (m) => (m === '.' && formData.price.includes(',') ? '' : m === ',' ? '.' : '')))
    : vehicle?.salePrice || 0;

  const getMissingFields = () => {
    const missing: string[] = [];
    if (!client.dni) missing.push('DNI del cliente');
    if (!client.address) missing.push('Dirección del cliente');
    if (!selectedVehicle) missing.push('Vehículo');
    if (!effectivePrice) missing.push('Precio');
    return missing;
  };

  const missingFields = getMissingFields();
  const canGenerate = !!selectedType && missingFields.length === 0;

  const vehicleBrand = vehicle ? vehicle.brand : '';
  const vehicleModel = vehicle ? vehicle.model : '';
  const vehiclePlate = vehicle?.registrationPlate || '';

  const handlePreview = () => {
    if (!canGenerate || !vehicle) return;

    const vars = buildTemplateVars({
      companyName,
      companyCif,
      companyAddress,
      clientName: client.name,
      clientDni: client.dni,
      clientPhone: client.phone,
      vehicleBrand,
      vehicleModel,
      vehiclePlate,
      price: effectivePrice,
      responsible: responsibleName,
    });

    const contractTemplate = getContractTemplate(templates, 'sales');
    const invoiceTemplate = getInvoiceTemplate(templates);

    if (contractTemplate) {
      setRenderedContractHtml(renderTemplateHtml(contractTemplate.html, vars));
    } else {
      setRenderedContractHtml(`<p style="font-family:sans-serif;color:#374151;">
        <strong>Contrato de ${selectedType}</strong><br/>
        Cliente: ${client.name} · ${client.dni || '—'}<br/>
        Vehículo: ${vehicleBrand} ${vehicleModel} (${vehiclePlate})<br/>
        Precio: ${effectivePrice.toLocaleString('es-ES')} €<br/>
        Fecha: ${new Date().toLocaleDateString('es-ES')}
      </p>`);
    }

    if (invoiceTemplate) {
      setRenderedInvoiceHtml(renderTemplateHtml(invoiceTemplate.html, vars));
    }

    setStep('preview');
  };

  const handleSave = async () => {
    if (!vehicle) return;
    setIsSaving(true);
    setError('');

    try {
      const vars = buildTemplateVars({
        companyName,
        companyCif,
        companyAddress,
        clientName: client.name,
        clientDni: client.dni,
        clientPhone: client.phone,
        vehicleBrand,
        vehicleModel,
        vehiclePlate,
        price: effectivePrice,
        responsible: responsibleName,
      });

      const contractTemplate = getContractTemplate(templates, 'sales');
      const finalHtml = contractTemplate
        ? renderTemplateHtml(contractTemplate.html, vars)
        : renderedContractHtml;

      const { contract, invoice } = await saveContractAndGenerateInvoice({
        userId,
        contractPayload: {
          user_id: userId,
          contractType: selectedType as ContractType,
          clientId: client.id,
          clientName: client.name,
          clientDni: client.dni,
          clientPhone: client.phone,
          clientEmail: client.email,
          vehicleId: vehicle.id,
          vehicleName: `${vehicle.brand} ${vehicle.model} ${vehicle.year}`,
          vehiclePlate,
          vehicleBrand,
          vehicleModel,
          vehicleYear: vehicle.year,
          price: effectivePrice,
          paymentMethod: formData.paymentMethod,
          notes: formData.notes,
          templateId: contractTemplate?.id || 'default',
          renderedHtml: finalHtml,
          status: 'draft',
          responsible: responsibleName,
          companyName,
          companyCif,
          companyAddress,
        },
      });

      const contractResult: ContractResult = {
        contractId: contract.id,
        invoiceNumber: invoice?.number || '',
        renderedHtml: finalHtml,
        templateTitle: contractTemplate?.title || 'Contrato',
      };

      setResult(contractResult);
      setStep('done');
      onSubmit?.(contractResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el contrato');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = (html: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Documento</title>
  <style>
    body { margin: 32px 48px; font-family: Arial, sans-serif; color: #111827; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>${html}</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            {step === 'done' ? 'Contrato guardado' : step === 'preview' ? 'Vista previa del documento' : 'Crear contrato'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* ─── STEP: FORM ─── */}
          {step === 'form' && (
            <div className="p-6 space-y-6">
              {/* Client */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <h3 className="font-semibold text-blue-900 mb-3">Cliente seleccionado</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-blue-700">Nombre:</span>
                    <div className="font-semibold text-blue-900">{client.name}</div>
                  </div>
                  <div>
                    <span className="text-blue-700">DNI:</span>
                    <div className="font-semibold text-blue-900 font-mono">{client.dni || '—'}</div>
                  </div>
                  <div>
                    <span className="text-blue-700">Email:</span>
                    <div className="font-semibold text-blue-900">{client.email}</div>
                  </div>
                  <div>
                    <span className="text-blue-700">Teléfono:</span>
                    <div className="font-semibold text-blue-900">{client.phone}</div>
                  </div>
                </div>
              </div>

              {/* Step 1: Contract type */}
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">1. Tipo de contrato</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {CONTRACT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedType(opt.id)}
                      className={`p-4 border-2 rounded-xl transition-all text-left ${
                        selectedType === opt.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <div className="text-3xl mb-2">{opt.icon}</div>
                      <div className="font-bold text-gray-900 dark:text-gray-100 mb-1">{opt.name}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{opt.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 2: Vehicle */}
              {selectedType && (
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">2. Vehículo</h3>
                  <select
                    value={selectedVehicle}
                    onChange={(e) => setSelectedVehicle(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Selecciona un vehículo...</option>
                    {vehicles.slice(0, 30).map((veh) => (
                      <option key={veh.id} value={veh.id}>
                        {veh.brand} {veh.model} {veh.year}
                        {veh.registrationPlate && ` — ${veh.registrationPlate}`}
                        {veh.salePrice && ` — ${veh.salePrice.toLocaleString('es-ES')}€`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Step 3: Details */}
              {selectedType && selectedVehicle && (
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">3. Detalles económicos</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Precio de venta *
                      </label>
                      <input
                        type="text"
                        value={formData.price}
                        onChange={(e) => setFormData((prev) => ({ ...prev, price: e.target.value }))}
                        placeholder={vehicle?.salePrice ? `${vehicle.salePrice.toLocaleString('es-ES')}€` : 'Ej: 25000'}
                        className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Forma de pago</label>
                      <select
                        value={formData.paymentMethod}
                        onChange={(e) => setFormData((prev) => ({ ...prev, paymentMethod: e.target.value }))}
                        className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
                      >
                        <option value="Transferencia">Transferencia bancaria</option>
                        <option value="Efectivo">Efectivo</option>
                        <option value="Financiación">Financiación</option>
                        <option value="Mixto">Mixto</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Notas adicionales</label>
                      <textarea
                        value={formData.notes}
                        onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                        placeholder="Condiciones especiales, garantías, etc."
                        rows={3}
                        className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none resize-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Checklist */}
              {selectedType && selectedVehicle && (
                <div className={`p-5 rounded-xl border-2 ${canGenerate ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                  <h3 className={`font-bold mb-4 flex items-center gap-2 ${canGenerate ? 'text-green-900' : 'text-amber-900'}`}>
                    {canGenerate ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                    {canGenerate ? 'Listo para generar' : 'Campos pendientes'}
                  </h3>
                  {missingFields.length > 0 ? (
                    <ul className="text-sm text-amber-700 space-y-1">
                      {missingFields.map((field, i) => (
                        <li key={i}>• {field}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="space-y-2 text-sm text-green-700">
                      <div>✓ Cliente: {client.name} ({client.dni})</div>
                      <div>✓ Vehículo: {vehicle?.brand} {vehicle?.model} {vehicle?.year}</div>
                      <div>✓ Precio: {effectivePrice.toLocaleString('es-ES')} €</div>
                      <div>✓ Pago: {formData.paymentMethod}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── STEP: PREVIEW ─── */}
          {step === 'preview' && (
            <div className="p-6 space-y-4">
              {/* Tabs contrato / factura */}
              <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-1">
                <button
                  onClick={() => setActivePreview('contract')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-semibold transition-colors ${
                    activePreview === 'contract'
                      ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Contrato
                </button>
                {renderedInvoiceHtml && (
                  <button
                    onClick={() => setActivePreview('invoice')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-semibold transition-colors ${
                      activePreview === 'invoice'
                        ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    <Receipt className="w-4 h-4" />
                    Factura
                  </button>
                )}
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 min-h-[300px]">
                <div
                  className="prose max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: activePreview === 'contract' ? renderedContractHtml : renderedInvoiceHtml,
                  }}
                />
              </div>

              <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                Esta es la vista previa con la plantilla de Settings. Al guardar se creará el contrato y la factura en CouchDB.
              </p>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ─── STEP: DONE ─── */}
          {step === 'done' && result && (
            <div className="p-6 text-center space-y-6">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Contrato guardado</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm">El contrato y la factura se han generado correctamente.</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-left">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">Contrato</p>
                  <p className="font-mono text-sm text-blue-900 break-all">{result.contractId}</p>
                </div>
                {result.invoiceNumber && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">Factura</p>
                    <p className="font-semibold text-emerald-900">{result.invoiceNumber}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handlePrint(result.renderedHtml)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  Ver / Imprimir
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black text-white font-medium rounded-xl transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'done' && (
          <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3 flex-shrink-0">
            {step === 'form' ? (
              <>
                <button
                  onClick={onClose}
                  className="flex-1 px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handlePreview}
                  disabled={!canGenerate}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Eye className="w-4 h-4" />
                  {canGenerate ? 'Vista previa' : 'Completa los campos'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { setStep('form'); setError(''); }}
                  disabled={isSaving}
                  className="flex-1 px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors disabled:opacity-50"
                >
                  Volver
                </button>
                <button
                  onClick={() => handlePrint(activePreview === 'contract' ? renderedContractHtml : renderedInvoiceHtml)}
                  disabled={isSaving}
                  className="px-4 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" />
                      Guardar y generar factura
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
