import { useState } from 'react';
import { X, FileText, CheckCircle, AlertCircle, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useModalClose } from '../../hooks/useModalClose';

interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number;
  registrationPlate?: string;
  salePrice?: number;
}

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  dni?: string;
}

interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  variables: string[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (data: any) => void;
  vehicles: Vehicle[];
  clients: Client[];
}

const templates: Template[] = [
  {
    id: 'contrato-compraventa',
    name: 'Contrato de compraventa',
    category: 'contract',
    description: 'Contrato estándar para venta de vehículo usado',
    icon: '📄',
    variables: [
      '{cliente_nombre}',
      '{cliente_dni}',
      '{cliente_direccion}',
      '{vehiculo_marca}',
      '{vehiculo_modelo}',
      '{vehiculo_matricula}',
      '{vehiculo_precio}',
      '{fecha_actual}',
    ],
  },
  {
    id: 'contrato-reserva',
    name: 'Contrato de reserva',
    category: 'contract',
    description: 'Señal de reserva de vehículo',
    icon: '🔖',
    variables: [
      '{cliente_nombre}',
      '{cliente_dni}',
      '{vehiculo_marca}',
      '{vehiculo_modelo}',
      '{vehiculo_matricula}',
      '{importe_señal}',
      '{fecha_actual}',
    ],
  },
  {
    id: 'hoja-encargo-transferencia',
    name: 'Hoja de encargo - Transferencia',
    category: 'worksheet',
    description: 'Trámite de cambio de titularidad',
    icon: '📋',
    variables: [
      '{cliente_nombre}',
      '{cliente_dni}',
      '{vehiculo_marca}',
      '{vehiculo_modelo}',
      '{vehiculo_matricula}',
      '{fecha_actual}',
    ],
  },
  {
    id: 'hoja-encargo-baja',
    name: 'Hoja de encargo - Baja',
    category: 'worksheet',
    description: 'Trámite de baja definitiva o temporal',
    icon: '📋',
    variables: [
      '{cliente_nombre}',
      '{cliente_dni}',
      '{vehiculo_marca}',
      '{vehiculo_modelo}',
      '{vehiculo_matricula}',
      '{tipo_baja}',
      '{fecha_actual}',
    ],
  },
  {
    id: 'factura-venta',
    name: 'Factura de venta',
    category: 'invoice',
    description: 'Factura para venta de vehículo',
    icon: '🧾',
    variables: [
      '{cliente_nombre}',
      '{cliente_dni}',
      '{vehiculo_marca}',
      '{vehiculo_modelo}',
      '{vehiculo_precio}',
      '{numero_factura}',
      '{fecha_actual}',
    ],
  },
];

export function SAAS__GenerateFromTemplateModal({ isOpen, onClose, onGenerate, vehicles, clients }: Props) {
  const { addVehicle, addClient } = useApp();
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [additionalData, setAdditionalData] = useState({
    importeSeñal: '',
    tipoBaja: 'temporal',
    numeroFactura: '',
  });

  const [showNewVehicle, setShowNewVehicle] = useState(false);
  const [newVehicleData, setNewVehicleData] = useState({ registrationPlate: '', brand: '', model: '', year: new Date().getFullYear(), color: '', purchasePrice: 0 });
  const [creatingVehicle, setCreatingVehicle] = useState(false);
  const [vehicleError, setVehicleError] = useState('');

  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientData, setNewClientData] = useState({ name: '', email: '', phone: '', dni: '' });
  const [creatingClient, setCreatingClient] = useState(false);
  const [clientError, setClientError] = useState('');

  const handleCreateVehicle = async () => {
    if (!newVehicleData.brand || !newVehicleData.model) return;
    setCreatingVehicle(true);
    setVehicleError('');
    try {
      const created = await addVehicle({ ...newVehicleData, status: 'available' });
      if (created) {
        setSelectedVehicle(created.id);
        setShowNewVehicle(false);
        setNewVehicleData({ registrationPlate: '', brand: '', model: '', year: new Date().getFullYear(), color: '', purchasePrice: 0 });
      } else {
        setVehicleError('No se pudo crear el vehículo. Inténtalo de nuevo.');
      }
    } catch (err) {
      setVehicleError(err instanceof Error ? err.message : 'Error al crear el vehículo');
    } finally {
      setCreatingVehicle(false);
    }
  };

  const handleCreateClient = async () => {
    if (!newClientData.name) return;
    setCreatingClient(true);
    setClientError('');
    try {
      const created = await addClient({ ...newClientData, status: 'active' });
      if (created) {
        setSelectedClient(created.id);
        setShowNewClient(false);
        setNewClientData({ name: '', email: '', phone: '', dni: '' });
      } else {
        setClientError('No se pudo crear el cliente. Inténtalo de nuevo.');
      }
    } catch (err) {
      setClientError(err instanceof Error ? err.message : 'Error al crear el cliente');
    } finally {
      setCreatingClient(false);
    }
  };

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const template = templates.find(t => t.id === selectedTemplate);
  const vehicle = vehicles.find(v => v.id === selectedVehicle);
  const client = clients.find(c => c.id === selectedClient);

  const handleChange = (field: string, value: any) => {
    setAdditionalData(prev => ({ ...prev, [field]: value }));
  };

  const getFilledVariables = () => {
    if (!template) return [];

    const filled: Array<{ variable: string; value: string; isFilled: boolean }> = [];

    template.variables.forEach(variable => {
      let value = '';
      let isFilled = false;

      if (variable.includes('cliente_') && client) {
        if (variable === '{cliente_nombre}') { value = client.name; isFilled = true; }
        if (variable === '{cliente_dni}') { value = client.dni || 'Sin DNI'; isFilled = !!client.dni; }
        if (variable === '{cliente_direccion}') { value = (client as any).address || 'Sin dirección'; isFilled = !!(client as any).address; }
      }

      if (variable.includes('vehiculo_') && vehicle) {
        if (variable === '{vehiculo_marca}') { value = vehicle.brand; isFilled = true; }
        if (variable === '{vehiculo_modelo}') { value = vehicle.model; isFilled = true; }
        if (variable === '{vehiculo_matricula}') { value = vehicle.registrationPlate || 'Sin matrícula'; isFilled = !!vehicle.registrationPlate; }
        if (variable === '{vehiculo_precio}') { value = vehicle.salePrice ? `${vehicle.salePrice.toLocaleString()}€` : 'Sin precio'; isFilled = !!vehicle.salePrice; }
      }

      if (variable === '{fecha_actual}') { value = new Date().toLocaleDateString('es-ES'); isFilled = true; }
      if (variable === '{importe_señal}') { value = additionalData.importeSeñal || 'Pendiente'; isFilled = !!additionalData.importeSeñal; }
      if (variable === '{tipo_baja}') { value = additionalData.tipoBaja === 'temporal' ? 'Temporal' : 'Definitiva'; isFilled = true; }
      if (variable === '{numero_factura}') { value = additionalData.numeroFactura || 'Auto-generado'; isFilled = true; }

      filled.push({ variable, value, isFilled });
    });

    return filled;
  };

  const filledVariables = getFilledVariables();
  const missingVariables = filledVariables.filter(v => !v.isFilled);
  const canGenerate =
    Boolean(selectedTemplate && selectedVehicle && selectedClient) && missingVariables.length === 0;

  const handleSubmit = (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!canGenerate) return;
    onGenerate({
      templateId: selectedTemplate,
      vehicleId: selectedVehicle,
      clientId: selectedClient,
      ...additionalData,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Generar desde plantilla
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Step 1: Select Template */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">1. Selecciona plantilla</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {templates.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => setSelectedTemplate(tmpl.id)}
                  className={`p-4 border-2 rounded-xl transition-all text-left ${
                    selectedTemplate === tmpl.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="text-3xl mb-2">{tmpl.icon}</div>
                  <div className="font-bold text-gray-900 dark:text-gray-100 mb-1">{tmpl.name}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{tmpl.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Select Data */}
          {selectedTemplate && (
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">2. Selecciona datos</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Vehículo *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowNewVehicle(true)}
                      className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Añadir
                    </button>
                  </div>
                  <select
                    value={selectedVehicle}
                    onChange={(e) => setSelectedVehicle(e.target.value)}
                    className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Selecciona un vehículo...</option>
                    {vehicles.slice(0, 20).map((veh) => (
                      <option key={veh.id} value={veh.id}>
                        {veh.brand} {veh.model} {veh.year}
                        {veh.registrationPlate && ` - ${veh.registrationPlate}`}
                      </option>
                    ))}
                  </select>

                  {showNewVehicle && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
                      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                        <div className="border-b border-gray-200 dark:border-gray-700 px-5 py-3 flex items-center justify-between">
                          <h3 className="font-bold text-gray-900 dark:text-gray-100">Nuevo vehículo</h3>
                          <button type="button" onClick={() => setShowNewVehicle(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                            <X className="w-4 h-4 text-gray-500" />
                          </button>
                        </div>
                        <div className="p-5 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Marca *</label>
                              <input type="text" value={newVehicleData.brand} onChange={(e) => setNewVehicleData(p => ({ ...p, brand: e.target.value }))} placeholder="Ej: Seat" className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-blue-500 focus:outline-none" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Modelo *</label>
                              <input type="text" value={newVehicleData.model} onChange={(e) => setNewVehicleData(p => ({ ...p, model: e.target.value }))} placeholder="Ej: León" className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-blue-500 focus:outline-none" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Matrícula</label>
                              <input type="text" value={newVehicleData.registrationPlate} onChange={(e) => setNewVehicleData(p => ({ ...p, registrationPlate: e.target.value }))} placeholder="1234 ABC" className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-blue-500 focus:outline-none" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Año</label>
                              <input type="number" value={newVehicleData.year} onChange={(e) => setNewVehicleData(p => ({ ...p, year: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-blue-500 focus:outline-none" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Color</label>
                              <input type="text" value={newVehicleData.color} onChange={(e) => setNewVehicleData(p => ({ ...p, color: e.target.value }))} placeholder="Negro" className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-blue-500 focus:outline-none" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Precio compra</label>
                              <input type="number" value={newVehicleData.purchasePrice || ''} onChange={(e) => setNewVehicleData(p => ({ ...p, purchasePrice: parseFloat(e.target.value) || 0 }))} placeholder="0" className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-blue-500 focus:outline-none" />
                            </div>
                          </div>
                        </div>
                        {vehicleError && (
                          <div className="mx-5 mb-1 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-sm text-red-700">{vehicleError}</p>
                          </div>
                        )}
                        <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-3 flex gap-2">
                          <button type="button" onClick={() => { setShowNewVehicle(false); setVehicleError(''); }} className="flex-1 px-4 py-2 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg">
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={handleCreateVehicle}
                            disabled={!newVehicleData.brand || !newVehicleData.model || creatingVehicle}
                            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {creatingVehicle ? 'Creando...' : 'Crear y seleccionar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Cliente *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowNewClient(true)}
                      className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Añadir
                    </button>
                  </div>
                  <select
                    value={selectedClient}
                    onChange={(e) => setSelectedClient(e.target.value)}
                    className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Selecciona un cliente...</option>
                    {clients.slice(0, 20).map((cli) => (
                      <option key={cli.id} value={cli.id}>
                        {cli.name} - {cli.email}
                      </option>
                    ))}
                  </select>

                  {showNewClient && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
                      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                        <div className="border-b border-gray-200 dark:border-gray-700 px-5 py-3 flex items-center justify-between">
                          <h3 className="font-bold text-gray-900 dark:text-gray-100">Nuevo cliente</h3>
                          <button type="button" onClick={() => setShowNewClient(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                            <X className="w-4 h-4 text-gray-500" />
                          </button>
                        </div>
                        <div className="p-5 space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nombre *</label>
                            <input type="text" value={newClientData.name} onChange={(e) => setNewClientData(p => ({ ...p, name: e.target.value }))} placeholder="Nombre completo" className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-blue-500 focus:outline-none" />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
                              <input type="email" value={newClientData.email} onChange={(e) => setNewClientData(p => ({ ...p, email: e.target.value }))} placeholder="email@ejemplo.com" className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-blue-500 focus:outline-none" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Teléfono</label>
                              <input type="tel" value={newClientData.phone} onChange={(e) => setNewClientData(p => ({ ...p, phone: e.target.value }))} placeholder="600 000 000" className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-blue-500 focus:outline-none" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">DNI/NIF</label>
                            <input type="text" value={newClientData.dni} onChange={(e) => setNewClientData(p => ({ ...p, dni: e.target.value }))} placeholder="12345678A" className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-blue-500 focus:outline-none" />
                          </div>
                        </div>
                        {clientError && (
                          <div className="mx-5 mb-1 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-sm text-red-700">{clientError}</p>
                          </div>
                        )}
                        <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-3 flex gap-2">
                          <button type="button" onClick={() => { setShowNewClient(false); setClientError(''); }} className="flex-1 px-4 py-2 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg">
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={handleCreateClient}
                            disabled={!newClientData.name || creatingClient}
                            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {creatingClient ? 'Creando...' : 'Crear y seleccionar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Additional Data */}
          {selectedTemplate && selectedVehicle && selectedClient && template && (
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">3. Datos adicionales</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {template.id === 'contrato-reserva' && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Importe de la señal *
                    </label>
                    <input
                      type="text"
                      value={additionalData.importeSeñal}
                      onChange={(e) => handleChange('importeSeñal', e.target.value)}
                      placeholder="1.000€"
                      className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                )}

                {template.id === 'hoja-encargo-baja' && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Tipo de baja
                    </label>
                    <select
                      value={additionalData.tipoBaja}
                      onChange={(e) => handleChange('tipoBaja', e.target.value)}
                      className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
                    >
                      <option value="temporal">Baja temporal</option>
                      <option value="definitiva">Baja definitiva</option>
                    </select>
                  </div>
                )}

                {template.id === 'factura-venta' && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Número de factura (opcional)
                    </label>
                    <input
                      type="text"
                      value={additionalData.numeroFactura}
                      onChange={(e) => handleChange('numeroFactura', e.target.value)}
                      placeholder="Se generará automáticamente"
                      className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Preview */}
          {selectedTemplate && selectedVehicle && selectedClient && template && (
            <div className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl">
              <h3 className="font-bold text-green-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Vista previa del documento
              </h3>

              <div className="space-y-3 mb-4">
                <div className="text-sm text-green-800 font-semibold mb-2">Variables auto-rellenadas:</div>
                {filledVariables.filter(v => v.isFilled).map((v, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-mono text-xs text-green-700">{v.variable}</div>
                      <div className="text-sm text-green-900 font-semibold">{v.value}</div>
                    </div>
                  </div>
                ))}
              </div>

              {missingVariables.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-amber-900 mb-1">Variables pendientes</div>
                      <ul className="text-sm text-amber-700 space-y-1">
                        {missingVariables.map((v, idx) => (
                          <li key={idx}>• {v.variable}: {v.value}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>

          <div className="sticky bottom-0 z-10 flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4 flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.25)]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canGenerate}
              className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {canGenerate
                ? 'Generar documento'
                : !selectedTemplate
                  ? 'Selecciona una plantilla'
                  : !selectedVehicle || !selectedClient
                    ? 'Selecciona vehículo y cliente'
                    : 'Completa todos los campos'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}