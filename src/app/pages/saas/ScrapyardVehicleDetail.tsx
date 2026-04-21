import { useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useScrapyard } from '../../context/ScrapyardContext';
import { v4 as uuidv4 } from 'uuid';
import {
  SCRAPYARD_ESTADOS, SCRAPYARD_BAJA_ESTADOS, SCRAPYARD_PROCEDENCIAS, SCRAPYARD_COMBUSTIBLES,
  type ScrapyardVehicleStatus, type ScrapyardBajaStatus, type ScrapyardHistoryEntry,
} from '../../lib/scrapyardTypes';
import {
  ArrowLeft, Car, MapPin, FileText, Wrench, Camera, Clock, Edit3, Save, X,
  Trash2, ChevronRight, Check, AlertTriangle, Upload, ZoomIn,
  Gauge, Fuel, Palette, Fingerprint, Calendar, DollarSign, User,
  Package, History, Settings2, Move, FileCheck, FileX, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

type Tab = 'datos' | 'documentacion' | 'fotos' | 'ubicacion' | 'historial' | 'despiece' | 'baja';

const TABS: { id: Tab; label: string; icon: typeof Car }[] = [
  { id: 'datos', label: 'Datos', icon: Car },
  { id: 'documentacion', label: 'Documentos', icon: FileText },
  { id: 'fotos', label: 'Fotos', icon: Camera },
  { id: 'ubicacion', label: 'Ubicacion', icon: MapPin },
  { id: 'historial', label: 'Historial', icon: History },
  { id: 'despiece', label: 'Despiece', icon: Wrench },
  { id: 'baja', label: 'Baja', icon: FileCheck },
];

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
      <span className="text-sm text-gray-500 dark:text-gray-400 shrink-0">{label}</span>
      <span className={`text-sm text-gray-900 dark:text-gray-100 text-right ${mono ? 'font-mono' : ''}`}>{value || '-'}</span>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: typeof Car; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
        <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">{title}</h3>
      </div>
      <div className="px-5 py-3">{children}</div>
    </div>
  );
}

export function ScrapyardVehicleDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { getVehicle, updateVehicle, removeVehicle } = useScrapyard();
  const vehicle = getVehicle(id || '');
  const [activeTab, setActiveTab] = useState<Tab>('datos');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  if (!vehicle) {
    return (
      <Layout title="Vehiculo no encontrado">
        <div className="text-center py-20">
          <Car className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Vehiculo no encontrado</h2>
          <p className="text-gray-500 mb-6">El vehiculo solicitado no existe o ha sido eliminado.</p>
          <button onClick={() => navigate('/saas/scrapyard-vehicles')} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">Volver al listado</button>
        </div>
      </Layout>
    );
  }

  const estadoCfg = SCRAPYARD_ESTADOS.find(e => e.value === vehicle.estado);
  const bajaCfg = SCRAPYARD_BAJA_ESTADOS.find(b => b.value === vehicle.estadoBaja);
  const combustibleLabel = SCRAPYARD_COMBUSTIBLES.find(c => c.value === vehicle.combustible)?.label || vehicle.combustible;
  const procedenciaLabel = SCRAPYARD_PROCEDENCIAS.find(p => p.value === vehicle.tipoProcedencia)?.label || vehicle.tipoProcedencia;

  const startEdit = () => {
    setEditForm({
      observaciones: vehicle.observaciones || '',
      ubicacion: vehicle.ubicacion || '',
      color: vehicle.color || '',
      km: vehicle.km,
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    await updateVehicle(vehicle.id, {
      ...editForm,
      historial: [
        {
          id: uuidv4(),
          fecha: new Date().toISOString(),
          tipo: 'edicion' as const,
          descripcion: 'Datos del vehiculo actualizados',
          usuario: vehicle.creadoPorNombre || 'Sistema',
        },
        ...vehicle.historial,
      ],
    });
    setEditing(false);
    toast.success('Vehiculo actualizado');
  };

  const handleStatusChange = async (newStatus: ScrapyardVehicleStatus) => {
    const entry: ScrapyardHistoryEntry = {
      id: uuidv4(),
      fecha: new Date().toISOString(),
      tipo: 'cambio_estado',
      descripcion: `Estado cambiado a: ${SCRAPYARD_ESTADOS.find(e => e.value === newStatus)?.label || newStatus}`,
      usuario: vehicle.creadoPorNombre || 'Sistema',
    };
    await updateVehicle(vehicle.id, {
      estado: newStatus,
      historial: [entry, ...vehicle.historial],
    });
    toast.success('Estado actualizado');
  };

  const handleBajaChange = async (newBaja: ScrapyardBajaStatus) => {
    const entry: ScrapyardHistoryEntry = {
      id: uuidv4(),
      fecha: new Date().toISOString(),
      tipo: 'baja',
      descripcion: `Estado de baja cambiado a: ${SCRAPYARD_BAJA_ESTADOS.find(b => b.value === newBaja)?.label || newBaja}`,
      usuario: vehicle.creadoPorNombre || 'Sistema',
    };
    await updateVehicle(vehicle.id, {
      estadoBaja: newBaja,
      fechaBaja: newBaja === 'completada' ? new Date().toISOString().slice(0, 10) : vehicle.fechaBaja,
      historial: [entry, ...vehicle.historial],
    });
    toast.success('Estado de baja actualizado');
  };

  const handleDelete = async () => {
    await removeVehicle(vehicle.id);
    toast.success('Vehiculo eliminado');
    navigate('/saas/scrapyard-vehicles');
  };

  const handlePhotoUpload = (files: FileList | null) => {
    if (!files) return;
    const newPhotos: string[] = [];
    let loaded = 0;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          newPhotos.push(reader.result);
          loaded++;
          if (loaded === files.length) {
            const entry: ScrapyardHistoryEntry = {
              id: uuidv4(),
              fecha: new Date().toISOString(),
              tipo: 'foto',
              descripcion: `${newPhotos.length} foto(s) subida(s)`,
              usuario: vehicle.creadoPorNombre || 'Sistema',
            };
            updateVehicle(vehicle.id, {
              fotos: [...vehicle.fotos, ...newPhotos],
              fotoPortada: vehicle.fotoPortada || newPhotos[0],
              historial: [entry, ...vehicle.historial],
            });
            toast.success(`${newPhotos.length} foto(s) subida(s)`);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDocToggle = async (field: 'fichaTecnica' | 'permisoCirculacion' | 'contratoCompraventa' | 'certificadoBaja', val: boolean) => {
    const updated = { ...vehicle, [field]: val };
    const completa = updated.fichaTecnica && updated.permisoCirculacion && updated.contratoCompraventa;
    const entry: ScrapyardHistoryEntry = {
      id: uuidv4(),
      fecha: new Date().toISOString(),
      tipo: 'documento',
      descripcion: `Documento ${val ? 'registrado' : 'desmarcado'}: ${field}`,
      usuario: vehicle.creadoPorNombre || 'Sistema',
    };
    await updateVehicle(vehicle.id, {
      [field]: val,
      documentacionCompleta: completa,
      historial: [entry, ...vehicle.historial],
    });
  };

  const renderDatos = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <SectionCard title="Identificacion" icon={Car}>
        <InfoRow label="Matricula" value={vehicle.matricula} mono />
        <InfoRow label="Bastidor" value={vehicle.bastidor} mono />
        <InfoRow label="Marca" value={vehicle.marca} />
        <InfoRow label="Modelo" value={`${vehicle.modelo} ${vehicle.version || ''}`} />
        <InfoRow label="Anio" value={vehicle.anio} />
        <InfoRow label="Kilometros" value={`${vehicle.km.toLocaleString('es-ES')} km`} />
        <InfoRow label="Combustible" value={combustibleLabel} />
        <InfoRow label="Color" value={vehicle.color} />
        <InfoRow label="Potencia" value={vehicle.potencia ? `${vehicle.potencia} CV` : '-'} />
        <InfoRow label="Transmision" value={vehicle.transmision || '-'} />
      </SectionCard>

      <SectionCard title="Propietario / Proveedor" icon={User}>
        <InfoRow label="Nombre" value={vehicle.propietarioNombre} />
        <InfoRow label="Procedencia" value={procedenciaLabel} />
        <InfoRow label="Adquisicion" value={<span className="capitalize">{vehicle.tipoAdquisicion}</span>} />
        <InfoRow label="DNI/CIF" value={vehicle.propietarioDocumento} />
        <InfoRow label="Telefono" value={vehicle.propietarioTelefono} />
        <InfoRow label="Email" value={vehicle.propietarioEmail} />
      </SectionCard>

      <SectionCard title="Economia" icon={DollarSign}>
        <InfoRow label="Fecha entrada" value={vehicle.fechaEntrada} />
        <InfoRow label="Coste compra" value={`${vehicle.costeCompra.toLocaleString('es-ES')} EUR`} />
        <InfoRow label="Transporte" value={vehicle.costeTransporte ? `${vehicle.costeTransporte.toLocaleString('es-ES')} EUR` : '-'} />
        <InfoRow label="Coste total" value={
          <span className="font-bold">
            {((vehicle.costeCompra || 0) + (vehicle.costeTransporte || 0)).toLocaleString('es-ES')} EUR
          </span>
        } />
        <InfoRow label="Forma de pago" value={<span className="capitalize">{vehicle.formaPago || '-'}</span>} />
      </SectionCard>

      <SectionCard title="Observaciones" icon={FileText}>
        {editing ? (
          <textarea
            value={editForm.observaciones}
            onChange={e => setEditForm(p => ({ ...p, observaciones: e.target.value }))}
            rows={4}
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-none"
          />
        ) : (
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{vehicle.observaciones || 'Sin observaciones'}</p>
        )}
      </SectionCard>
    </div>
  );

  const renderDocumentacion = () => {
    const docs = [
      { key: 'fichaTecnica' as const, label: 'Ficha tecnica', icon: FileText },
      { key: 'permisoCirculacion' as const, label: 'Permiso de circulacion', icon: FileCheck },
      { key: 'contratoCompraventa' as const, label: 'Contrato compraventa', icon: FileText },
      { key: 'certificadoBaja' as const, label: 'Certificado de baja', icon: FileCheck },
    ];
    return (
      <div className="space-y-4">
        <div className={`p-4 rounded-xl border ${vehicle.documentacionCompleta
          ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
          : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {vehicle.documentacionCompleta ? <Check className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-amber-600" />}
              <p className="text-sm font-medium">
                {vehicle.documentacionCompleta ? 'Documentacion completa' : 'Documentacion incompleta'}
              </p>
            </div>
            <button
              onClick={() => navigate(`/saas/vertical/desguaces/documentacion?vehicleId=${vehicle.id}&tab=vehiculo`)}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              Ver expediente completo <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {docs.map(d => {
            const val = vehicle[d.key];
            return (
              <div
                key={d.key}
                onClick={() => handleDocToggle(d.key, !val)}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3 ${
                  val
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  val ? 'bg-emerald-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                }`}>
                  {val ? <Check className="w-4 h-4" /> : <d.icon className="w-4 h-4" />}
                </div>
                <div>
                  <p className={`text-sm font-medium ${val ? 'text-emerald-900 dark:text-emerald-200' : 'text-gray-700 dark:text-gray-300'}`}>{d.label}</p>
                  <p className="text-xs text-gray-500">{val ? 'Registrado' : 'Pendiente'}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderFotos = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">{vehicle.fotos.length} foto(s)</p>
        <button
          onClick={() => photoInputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
        >
          <Upload className="w-4 h-4" /> Subir fotos
        </button>
        <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handlePhotoUpload(e.target.files)} />
      </div>
      {vehicle.fotos.length === 0 ? (
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center">
          <Camera className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Sin fotos. Sube fotos del vehiculo.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {vehicle.fotos.map((foto, idx) => (
            <div
              key={idx}
              className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 cursor-pointer group"
              onClick={() => setLightboxUrl(foto)}
            >
              <img src={foto} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              {idx === 0 && vehicle.fotoPortada === foto && (
                <span className="absolute top-2 left-2 px-2 py-0.5 bg-blue-600 text-white text-xs font-medium rounded-full">Portada</span>
              )}
            </div>
          ))}
        </div>
      )}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
          <button className="absolute top-4 right-4 p-2 bg-white/10 rounded-full hover:bg-white/20" onClick={() => setLightboxUrl(null)}>
            <X className="w-6 h-6 text-white" />
          </button>
          <img src={lightboxUrl} alt="" className="max-w-full max-h-[90vh] rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );

  const renderUbicacion = () => (
    <div className="space-y-4">
      <SectionCard title="Ubicacion actual" icon={MapPin}>
        {vehicle.ubicacion ? (
          <div className="flex items-center gap-3 py-2">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
              <MapPin className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">{vehicle.ubicacion}</p>
              <p className="text-xs text-gray-500">Zona asignada</p>
            </div>
          </div>
        ) : (
          <div className="py-4 text-center">
            <MapPin className="w-8 h-8 text-amber-400 mx-auto mb-2" />
            <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">Sin ubicacion asignada</p>
          </div>
        )}
      </SectionCard>
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Historial de movimientos</h3>
        {vehicle.historial.filter(h => h.tipo === 'movimiento').length === 0 ? (
          <p className="text-sm text-gray-500">Sin movimientos registrados</p>
        ) : (
          <div className="space-y-2">
            {vehicle.historial.filter(h => h.tipo === 'movimiento').map(h => (
              <div key={h.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                <Move className="w-4 h-4 text-blue-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-gray-900 dark:text-gray-100">{h.descripcion}</p>
                  <p className="text-xs text-gray-500">{new Date(h.fecha).toLocaleString('es-ES')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderHistorial = () => (
    <div className="space-y-1">
      {vehicle.historial.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">Sin entradas en el historial</p>
      ) : (
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
          {vehicle.historial.map((entry, idx) => {
            const typeColor: Record<string, string> = {
              entrada: 'bg-blue-500', cambio_estado: 'bg-amber-500', movimiento: 'bg-purple-500',
              documento: 'bg-emerald-500', foto: 'bg-pink-500', edicion: 'bg-gray-500',
              baja: 'bg-red-500', despiece: 'bg-orange-500',
            };
            return (
              <div key={entry.id} className="relative flex gap-4 pl-3 py-3">
                <div className={`w-4 h-4 rounded-full ${typeColor[entry.tipo] || 'bg-gray-400'} shrink-0 mt-0.5 z-10 ring-4 ring-white dark:ring-gray-900`} />
                <div className="flex-1">
                  <p className="text-sm text-gray-900 dark:text-gray-100">{entry.descripcion}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    <span>{new Date(entry.fecha).toLocaleString('es-ES')}</span>
                    <span className="w-1 h-1 rounded-full bg-gray-300" />
                    <span>{entry.usuario}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderDespiece = () => (
    <div className="space-y-4">
      {vehicle.estado === 'recibido' || vehicle.estado === 'en_revision' ? (
        <div className="text-center py-8">
          <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 mb-4">El vehiculo debe estar en estado "En despiece" para gestionar piezas.</p>
          <button
            onClick={() => handleStatusChange('en_despiece')}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg font-medium"
          >
            Iniciar despiece
          </button>
        </div>
      ) : (
        <div>
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl mb-4">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Estado actual: <strong>{estadoCfg?.label}</strong>. Las piezas extraidas se gestionan desde el modulo de Piezas.
            </p>
          </div>
          <button
            onClick={() => navigate('/saas/scrapyard-parts')}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <Package className="w-4 h-4" /> Ir a Piezas
            <ChevronRight className="w-4 h-4 ml-auto" />
          </button>
        </div>
      )}
    </div>
  );

  const renderBaja = () => (
    <div className="space-y-4">
      <SectionCard title="Estado de baja" icon={FileCheck}>
        <div className="flex items-center gap-3 py-2 mb-4">
          <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${bajaCfg?.color || ''}`}>
            {bajaCfg?.label || vehicle.estadoBaja}
          </span>
          {vehicle.fechaBaja && (
            <span className="text-sm text-gray-500">Fecha: {vehicle.fechaBaja}</span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {SCRAPYARD_BAJA_ESTADOS.map(b => (
            <button
              key={b.value}
              onClick={() => handleBajaChange(b.value)}
              disabled={vehicle.estadoBaja === b.value}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                vehicle.estadoBaja === b.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Datos de baja" icon={Settings2}>
        <InfoRow label="Tipo de baja" value={<span className="capitalize">{vehicle.tipoBaja || 'No definido'}</span>} />
        <InfoRow label="Centro ITV" value={vehicle.centroItvBaja} />
        <InfoRow label="Fecha baja" value={vehicle.fechaBaja} />
        <InfoRow label="Certificado" value={vehicle.certificadoBaja ? 'Si' : 'No'} />
      </SectionCard>
    </div>
  );

  const tabContent: Record<Tab, () => React.ReactNode> = {
    datos: renderDatos,
    documentacion: renderDocumentacion,
    fotos: renderFotos,
    ubicacion: renderUbicacion,
    historial: renderHistorial,
    despiece: renderDespiece,
    baja: renderBaja,
  };

  return (
    <Layout title={`${vehicle.marca} ${vehicle.modelo}`}>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start gap-4">
          <button onClick={() => navigate('/saas/scrapyard-vehicles')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg mt-1">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{vehicle.marca} {vehicle.modelo}</h1>
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${estadoCfg?.color || ''}`}>
                {estadoCfg?.label || vehicle.estado}
              </span>
              {vehicle.estadoBaja !== 'no_aplica' && (
                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${bajaCfg?.color || ''}`}>
                  Baja: {bajaCfg?.label || vehicle.estadoBaja}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
              <span className="font-mono font-bold">{vehicle.matricula}</span>
              <span>{vehicle.anio}</span>
              <span>{vehicle.km.toLocaleString('es-ES')} km</span>
              <span>{combustibleLabel}</span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className="p-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                  <X className="w-4 h-4" />
                </button>
                <button onClick={saveEdit} className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                  <Save className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <button onClick={startEdit} className="p-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                  <Edit3 className="w-4 h-4" />
                </button>
                <select
                  value={vehicle.estado}
                  onChange={e => handleStatusChange(e.target.value as ScrapyardVehicleStatus)}
                  className="px-3 py-2 text-xs font-medium border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                >
                  {SCRAPYARD_ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
                <button onClick={() => setShowDeleteConfirm(true)} className="p-2 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700 pb-px">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div>{tabContent[activeTab]()}</div>

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowDeleteConfirm(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Eliminar vehiculo</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Se eliminara permanentemente <strong>{vehicle.matricula} - {vehicle.marca} {vehicle.modelo}</strong>. Esta accion no se puede deshacer.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg">Cancelar</button>
                <button onClick={handleDelete} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">Eliminar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
