import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Layout } from '../../components/saas/Layout';
import { SAAS__StageBadge, OperationStage } from '../../components/design-system/SAAS__StageBadge';
import { SAAS__StatusBadge, OperationStatus } from '../../components/design-system/SAAS__StatusBadge';
import { SAAS__ChangeStageModal } from '../../components/design-system/SAAS__ChangeStageModal';
import { SAAS__AssignResponsibleModal } from '../../components/design-system/SAAS__AssignResponsibleModal';
import { ArrowLeft, ArrowRight, User, MapPin, Car, FileText, Users, Clock } from 'lucide-react';

interface TimelineEvent {
  id: string;
  stage: OperationStage;
  date: string;
  user: string;
  notes?: string;
}

export function OperationDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [showChangeStage, setShowChangeStage] = useState(false);
  const [showAssignResponsible, setShowAssignResponsible] = useState(false);

  // Mock operation data
  const operation = {
    id: id || 'OP-0001',
    type: 'venta' as const,
    vehicle: 'BMW X3 2020',
    vehicleId: 'veh-001',
    client: 'Carlos Martínez',
    clientId: 'cli-001',
    stage: 'negociacion' as OperationStage,
    status: 'in_progress' as OperationStatus,
    responsible: 'Juan García',
    location: 'Zona A-12',
    createdDate: '2024-03-01',
    estimatedCloseDate: '2024-03-15',
  };

  const timeline: TimelineEvent[] = [
    { 
      id: '1', 
      stage: 'captacion', 
      date: '2024-03-01 10:00', 
      user: 'Juan García',
      notes: 'Cliente contactado vía web'
    },
    { 
      id: '2', 
      stage: 'revision', 
      date: '2024-03-02 14:30', 
      user: 'María López',
      notes: 'Revisión técnica completada'
    },
    { 
      id: '3', 
      stage: 'puesta_punto', 
      date: '2024-03-04 09:15', 
      user: 'Carlos Ruiz',
      notes: 'Limpieza y preparación'
    },
    { 
      id: '4', 
      stage: 'publicacion', 
      date: '2024-03-05 11:00', 
      user: 'Juan García',
      notes: 'Publicado en portales'
    },
    { 
      id: '5', 
      stage: 'negociacion', 
      date: '2024-03-07 16:20', 
      user: 'Juan García',
      notes: 'Cliente muestra interés, pendiente test drive'
    },
  ];

  const handleChangeStage = (newStage: OperationStage) => {
    console.log('Change stage to:', newStage);
    setShowChangeStage(false);
  };

  const handleAssignResponsible = (responsible: string) => {
    console.log('Assign to:', responsible);
    setShowAssignResponsible(false);
  };

  return (
    <Layout title={operation.id} subtitle={`Operación de ${operation.type}`}>
      <div className="space-y-6">
        {/* Back button */}
        <button
          onClick={() => navigate('/saas/operations')}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a operaciones
        </button>

        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{operation.id}</h1>
                <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
                  operation.type === 'compra' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'bg-green-100 text-green-700'
                }`}>
                  {operation.type === 'compra' ? '⬇ Compra' : '⬆ Venta'}
                </span>
              </div>
              <div className="flex items-center gap-4 text-gray-600 dark:text-gray-400">
                <div className="flex items-center gap-2">
                  <Car className="w-4 h-4" />
                  <span>{operation.vehicle}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>{operation.client}</span>
                </div>
              </div>
            </div>
            <SAAS__StatusBadge status={operation.status} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Fecha creación</div>
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {new Date(operation.createdDate).toLocaleDateString('es-ES')}
              </div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Cierre estimado</div>
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {new Date(operation.estimatedCloseDate).toLocaleDateString('es-ES')}
              </div>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="text-xs text-blue-600 mb-1">Etapa actual</div>
              <SAAS__StageBadge stage={operation.stage} />
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <div className="text-xs text-purple-600 mb-1">Ubicación</div>
              <div className="font-semibold text-purple-900">{operation.location}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Stage & Responsible */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Gestión</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Current stage */}
                <div className="p-4 bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-blue-900">Etapa actual</div>
                    <button
                      onClick={() => setShowChangeStage(true)}
                      className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
                      title="Cambiar etapa"
                    >
                      <ArrowRight className="w-4 h-4 text-blue-600" />
                    </button>
                  </div>
                  <SAAS__StageBadge stage={operation.stage} />
                  <button
                    onClick={() => setShowChangeStage(true)}
                    className="mt-3 w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Cambiar etapa
                  </button>
                </div>

                {/* Responsible */}
                <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-purple-900">Responsable</div>
                    <User className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                      {operation.responsible.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="font-semibold text-purple-900">{operation.responsible}</div>
                  </div>
                  <button
                    onClick={() => setShowAssignResponsible(true)}
                    className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Reasignar
                  </button>
                </div>
              </div>
            </div>

            {/* Location snapshot */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-amber-600" />
                  Ubicación actual
                </h2>
                <button
                  onClick={() => navigate('/saas/locations')}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  Ver en mapa →
                </button>
              </div>
              <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-amber-600 rounded-lg flex items-center justify-center">
                    <span className="text-white text-lg font-bold">A12</span>
                  </div>
                  <div>
                    <div className="font-semibold text-amber-900">Plaza {operation.location}</div>
                    <div className="text-sm text-amber-700">Zona A - Fila 1</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center gap-2 mb-6">
                <Clock className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Timeline de cambios</h2>
              </div>

              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />

                <div className="space-y-6">
                  {timeline.map((event, idx) => (
                    <div key={event.id} className="relative pl-14">
                      {/* Timeline dot */}
                      <div className={`absolute left-4 top-2 w-4 h-4 rounded-full border-4 border-white ${
                        idx === timeline.length - 1 ? 'bg-blue-600' : 'bg-gray-400'
                      }`} />

                      <div className={`p-4 border-2 rounded-xl ${
                        idx === timeline.length - 1 
                          ? 'bg-blue-50 border-blue-200' 
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                      }`}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <SAAS__StageBadge stage={event.stage} />
                          <span className="text-xs text-gray-500 dark:text-gray-400">{event.date}</span>
                        </div>
                        {event.notes && (
                          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{event.notes}</p>
                        )}
                        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                          <User className="w-3 h-3" />
                          <span>{event.user}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right column - Shortcuts */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Accesos rápidos</h2>
              
              <div className="space-y-3">
                <button
                  onClick={() => navigate(`/saas/vehicles/${operation.vehicleId}`)}
                  className="w-full p-4 border-2 border-gray-200 dark:border-gray-700 hover:border-green-500 hover:bg-green-50 rounded-xl transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <Car className="w-5 h-5 text-green-600" />
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">Ficha vehículo</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{operation.vehicle}</div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => navigate(`/saas/clients/${operation.clientId}`)}
                  className="w-full p-4 border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 hover:bg-blue-50 rounded-xl transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-blue-600" />
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">Ficha cliente</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{operation.client}</div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => navigate('/saas/documents')}
                  className="w-full p-4 border-2 border-gray-200 dark:border-gray-700 hover:border-purple-500 hover:bg-purple-50 rounded-xl transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-purple-600" />
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">Documentos</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Ver todos los docs</div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => navigate('/saas/locations')}
                  className="w-full p-4 border-2 border-gray-200 dark:border-gray-700 hover:border-amber-500 hover:bg-amber-50 rounded-xl transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-amber-600" />
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">Ubicación</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Ver en mapa</div>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Estadísticas</h2>
              
              <div className="space-y-3">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-xs text-blue-600 mb-1">Tiempo en etapa</div>
                  <div className="text-2xl font-bold text-blue-900">3 días</div>
                </div>
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="text-xs text-green-600 mb-1">Progreso</div>
                  <div className="text-2xl font-bold text-green-900">50%</div>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="text-xs text-amber-600 mb-1">Días restantes</div>
                  <div className="text-2xl font-bold text-amber-900">8 días</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SAAS__ChangeStageModal
        isOpen={showChangeStage}
        onClose={() => setShowChangeStage(false)}
        onConfirm={handleChangeStage}
        currentStage={operation.stage}
      />

      <SAAS__AssignResponsibleModal
        isOpen={showAssignResponsible}
        onClose={() => setShowAssignResponsible(false)}
        onConfirm={handleAssignResponsible}
        currentResponsible={operation.responsible}
      />
    </Layout>
  );
}
