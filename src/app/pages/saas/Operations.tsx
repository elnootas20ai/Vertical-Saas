import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Layout } from '../../components/saas/Layout';
import { Tabs } from '../../components/saas/Tabs';
import { useApp } from '../../context/AppContext';
import { SAAS__StageBadge, OperationStage } from '../../components/design-system/SAAS__StageBadge';
import { SAAS__StatusBadge, OperationStatus } from '../../components/design-system/SAAS__StatusBadge';
import { SAAS__OperationsCreateModal } from '../../components/design-system/SAAS__OperationsCreateModal';
import { SAAS__ChangeStageModal } from '../../components/design-system/SAAS__ChangeStageModal';
import { SAAS__AssignResponsibleModal } from '../../components/design-system/SAAS__AssignResponsibleModal';
import { Plus, Eye, FileText, ArrowRight, CheckSquare, DollarSign, AlertCircle, History, User } from 'lucide-react';
import { useWorkCenters } from '../../hooks/useWorkCenters';

interface Operation {
  id: string;
  type: 'compra' | 'venta';
  vehicle: string;
  vehicleId: string;
  client: string;
  clientId: string;
  stage: OperationStage;
  status: OperationStatus;
  responsible: string;
  location: string;
  date: string;
}

interface Task {
  id: string;
  operationId: string;
  title: string;
  status: 'pending' | 'completed';
  dueDate: string;
  responsible: string;
}

interface Expense {
  id: string;
  operationId: string;
  concept: string;
  amount: number;
  date: string;
  category: string;
}

interface Incident {
  id: string;
  operationId: string;
  title: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved';
  date: string;
}

interface HistoryEntry {
  id: string;
  operationId: string;
  action: string;
  user: string;
  date: string;
}

export function Operations() {
  const navigate = useNavigate();
  const { vehicles, clients } = useApp();
  const { activeWorkCenters, hasWorkCenters } = useWorkCenters();
  const [activeTab, setActiveTab] = useState('operations');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showChangeStage, setShowChangeStage] = useState<string | null>(null);
  const [showAssignResponsible, setShowAssignResponsible] = useState<string | null>(null);
  const [filterWorkCenter, setFilterWorkCenter] = useState<string>('all');

  // Mock operations data
  const operations = useMemo<Operation[]>(() => {
    return vehicles.slice(0, 15).map((vehicle, idx) => ({
      id: `OP-${String(idx + 1).padStart(4, '0')}`,
      type: idx % 3 === 0 ? 'compra' : 'venta',
      vehicle: `${vehicle.brand} ${vehicle.model}`,
      vehicleId: vehicle.id,
      client: clients[idx % clients.length].name,
      clientId: clients[idx % clients.length].id,
      stage: (['captacion', 'revision', 'puesta_punto', 'publicacion', 'negociacion', 'reserva', 'financiacion', 'documentacion', 'entrega', 'postventa'] as OperationStage[])[idx % 10],
      status: (['pending', 'in_progress', 'delayed', 'completed'] as OperationStatus[])[idx % 4],
      responsible: ['Juan García', 'María López', 'Carlos Ruiz'][idx % 3],
      location: ['Zona A-12', 'Zona B-05', 'Zona C-08', 'Sin asignar'][idx % 4],
      date: new Date(2024, 2, idx + 1).toISOString(),
    }));
  }, [vehicles, clients]);

  const filteredOperations = useMemo(() => {
    return operations.filter((item) => {
      if (filterWorkCenter !== 'all' && (item as any).workCenterId !== filterWorkCenter) return false;
      return true;
    });
  }, [operations, filterWorkCenter]);

  // Mock tasks
  const tasks = useMemo<Task[]>(() => [
    { id: 'T-001', operationId: 'OP-0001', title: 'Revisar documentación cliente', status: 'pending', dueDate: '2024-03-10', responsible: 'Juan García' },
    { id: 'T-002', operationId: 'OP-0001', title: 'Programar revisión técnica', status: 'completed', dueDate: '2024-03-08', responsible: 'María López' },
    { id: 'T-003', operationId: 'OP-0002', title: 'Subir fotos a portal', status: 'pending', dueDate: '2024-03-12', responsible: 'Carlos Ruiz' },
    { id: 'T-004', operationId: 'OP-0003', title: 'Confirmar financiación', status: 'pending', dueDate: '2024-03-09', responsible: 'Juan García' },
    { id: 'T-005', operationId: 'OP-0004', title: 'Preparar contrato', status: 'completed', dueDate: '2024-03-07', responsible: 'María López' },
  ], []);

  // Mock expenses
  const expenses = useMemo<Expense[]>(() => [
    { id: 'E-001', operationId: 'OP-0001', concept: 'Revisión técnica', amount: 150, date: '2024-03-05', category: 'Taller' },
    { id: 'E-002', operationId: 'OP-0001', concept: 'Limpieza profesional', amount: 80, date: '2024-03-06', category: 'Preparación' },
    { id: 'E-003', operationId: 'OP-0002', concept: 'Publicidad portal', amount: 120, date: '2024-03-04', category: 'Marketing' },
    { id: 'E-004', operationId: 'OP-0003', concept: 'Gestoría transferencia', amount: 200, date: '2024-03-03', category: 'Gestoría' },
    { id: 'E-005', operationId: 'OP-0004', concept: 'Reparación frenos', amount: 350, date: '2024-03-02', category: 'Taller' },
  ], []);

  // Mock incidents
  const incidents = useMemo<Incident[]>(() => [
    { id: 'I-001', operationId: 'OP-0001', title: 'Retraso en documentación DGT', severity: 'medium', status: 'open', date: '2024-03-07' },
    { id: 'I-002', operationId: 'OP-0002', title: 'Cliente solicita descuento adicional', severity: 'low', status: 'resolved', date: '2024-03-06' },
    { id: 'I-003', operationId: 'OP-0003', title: 'Problema en financiación', severity: 'high', status: 'open', date: '2024-03-05' },
    { id: 'I-004', operationId: 'OP-0004', title: 'Vehículo necesita reparación adicional', severity: 'medium', status: 'resolved', date: '2024-03-04' },
  ], []);

  // Mock history
  const history = useMemo<HistoryEntry[]>(() => [
    { id: 'H-001', operationId: 'OP-0001', action: 'Operación creada', user: 'Juan García', date: '2024-03-01 10:00' },
    { id: 'H-002', operationId: 'OP-0001', action: 'Cambio de etapa: Captación → Revisión', user: 'Juan García', date: '2024-03-02 14:30' },
    { id: 'H-003', operationId: 'OP-0001', action: 'Asignado a María López', user: 'Juan García', date: '2024-03-03 09:15' },
    { id: 'H-004', operationId: 'OP-0001', action: 'Gasto añadido: Revisión técnica (150€)', user: 'María López', date: '2024-03-05 11:20' },
    { id: 'H-005', operationId: 'OP-0001', action: 'Incidencia reportada: Retraso documentación', user: 'María López', date: '2024-03-07 16:45' },
  ], []);

  const tabsConfig = [
    { id: 'operations', label: 'Operaciones', icon: <FileText className="w-4 h-4" /> },
    { id: 'tasks', label: 'Tareas', count: tasks.filter(t => t.status === 'pending').length, icon: <CheckSquare className="w-4 h-4" /> },
    { id: 'expenses', label: 'Gastos', icon: <DollarSign className="w-4 h-4" /> },
    { id: 'incidents', label: 'Incidencias', count: incidents.filter(i => i.status === 'open').length, icon: <AlertCircle className="w-4 h-4" /> },
    { id: 'history', label: 'Historial', icon: <History className="w-4 h-4" /> },
  ];

  const handleCreateOperation = (data: any) => {
    console.log('Create operation:', data);
    setShowCreateModal(false);
  };

  const handleChangeStage = (operationId: string, newStage: OperationStage) => {
    console.log('Change stage:', operationId, newStage);
    setShowChangeStage(null);
  };

  const handleAssignResponsible = (operationId: string, responsible: string) => {
    console.log('Assign responsible:', operationId, responsible);
    setShowAssignResponsible(null);
  };

  const renderOperationsTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {operations.length} operaciones activas
          </div>
          {hasWorkCenters && (
            <select
              className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none"
              value={filterWorkCenter}
              onChange={e => setFilterWorkCenter(e.target.value)}
            >
              <option value="all">Todos los centros</option>
              {activeWorkCenters.map((wc) => (
                <option key={wc.id} value={wc.id}>{wc.name}</option>
              ))}
            </select>
          )}
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl flex items-center gap-2 font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nueva operación
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Operación</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Cliente/Origen</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Etapa</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Estado</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Responsable</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Ubicación</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredOperations.map((operation) => (
              <tr key={operation.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <td className="px-4 py-4">
                  <div className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">{operation.id}</div>
                </td>
                <td className="px-4 py-4">
                  <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{operation.vehicle}</div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                      operation.type === 'compra' 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {operation.type === 'compra' ? '⬇ Compra' : '⬆ Venta'}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="text-sm text-gray-900 dark:text-gray-100">{operation.client}</div>
                </td>
                <td className="px-4 py-4">
                  <SAAS__StageBadge stage={operation.stage} />
                </td>
                <td className="px-4 py-4">
                  <SAAS__StatusBadge status={operation.status} />
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <span className="text-sm text-gray-900 dark:text-gray-100">{operation.responsible}</span>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="text-sm text-gray-700 dark:text-gray-300">{operation.location}</div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => navigate(`/saas/operations/${operation.id}`)}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      title="Ver detalle"
                    >
                      <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    </button>
                    <button
                      onClick={() => navigate(`/saas/documents`)}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      title="Documentos"
                    >
                      <FileText className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    </button>
                    <button
                      onClick={() => setShowChangeStage(operation.id)}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      title="Cambiar etapa"
                    >
                      <ArrowRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderTasksTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {tasks.filter(t => t.status === 'pending').length} tareas pendientes
        </div>
        <button className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl flex items-center gap-2 font-medium transition-colors">
          <Plus className="w-5 h-5" />
          Nueva tarea
        </button>
      </div>

      <div className="space-y-3">
        {tasks.map((task) => (
          <div key={task.id} className={`p-4 bg-white dark:bg-gray-800 border-2 rounded-xl transition-all ${
            task.status === 'completed' ? 'border-green-200 bg-green-50' : 'border-gray-200 dark:border-gray-700'
          }`}>
            <div className="flex items-start gap-3">
              <input 
                type="checkbox" 
                checked={task.status === 'completed'}
                className="mt-1"
                readOnly
              />
              <div className="flex-1">
                <div className={`font-semibold mb-1 ${task.status === 'completed' ? 'line-through text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                  {task.title}
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                  <span>📋 {task.operationId}</span>
                  <span>👤 {task.responsible}</span>
                  <span>📅 {new Date(task.dueDate).toLocaleDateString('es-ES')}</span>
                </div>
              </div>
              {task.status === 'pending' && (
                <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">
                  Pendiente
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderExpensesTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Total: {expenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString('es-ES')}€
        </div>
        <button className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl flex items-center gap-2 font-medium transition-colors">
          <Plus className="w-5 h-5" />
          Añadir gasto
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Operación</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Concepto</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Categoría</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Importe</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {expenses.map((expense) => (
              <tr key={expense.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <td className="px-4 py-4">
                  <div className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">{expense.operationId}</div>
                </td>
                <td className="px-4 py-4">
                  <div className="text-sm text-gray-900 dark:text-gray-100">{expense.concept}</div>
                </td>
                <td className="px-4 py-4">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                    {expense.category}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <div className="font-bold text-red-700">{expense.amount.toLocaleString('es-ES')}€</div>
                </td>
                <td className="px-4 py-4">
                  <div className="text-sm text-gray-700 dark:text-gray-300">{new Date(expense.date).toLocaleDateString('es-ES')}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderIncidentsTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {incidents.filter(i => i.status === 'open').length} incidencias abiertas
        </div>
        <button className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl flex items-center gap-2 font-medium transition-colors">
          <Plus className="w-5 h-5" />
          Reportar incidencia
        </button>
      </div>

      <div className="space-y-3">
        {incidents.map((incident) => (
          <div key={incident.id} className={`p-4 bg-white dark:bg-gray-800 border-2 rounded-xl ${
            incident.severity === 'high' ? 'border-red-300 bg-red-50' :
            incident.severity === 'medium' ? 'border-amber-300 bg-amber-50' :
            'border-blue-300 bg-blue-50'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                    incident.severity === 'high' ? 'bg-red-100 text-red-700' :
                    incident.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {incident.severity === 'high' ? '🔴 Alta' : incident.severity === 'medium' ? '🟡 Media' : '🟢 Baja'}
                  </span>
                  <span className="font-mono text-sm text-gray-600 dark:text-gray-400">{incident.operationId}</span>
                </div>
                <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{incident.title}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  📅 {new Date(incident.date).toLocaleDateString('es-ES')}
                </div>
              </div>
              <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
                incident.status === 'open' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
              }`}>
                {incident.status === 'open' ? 'Abierta' : 'Resuelta'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderHistoryTab = () => (
    <div className="space-y-6">
      <div className="text-sm text-gray-600 dark:text-gray-400">
        {history.length} eventos registrados
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />

        <div className="space-y-6">
          {history.map((entry, idx) => (
            <div key={entry.id} className="relative pl-14">
              {/* Timeline dot */}
              <div className="absolute left-4 top-2 w-4 h-4 bg-blue-600 rounded-full border-4 border-white dark:border-gray-900" />

              <div className="p-4 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
                <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{entry.action}</div>
                <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                  <span>📋 {entry.operationId}</span>
                  <span>👤 {entry.user}</span>
                  <span>📅 {entry.date}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <Layout title="Operaciones" subtitle="Gestión de operativa y expedientes">
      <div className="space-y-6">
        <Tabs
          tabs={tabsConfig}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        {activeTab === 'operations' && renderOperationsTab()}
        {activeTab === 'tasks' && renderTasksTab()}
        {activeTab === 'expenses' && renderExpensesTab()}
        {activeTab === 'incidents' && renderIncidentsTab()}
        {activeTab === 'history' && renderHistoryTab()}
      </div>

      <SAAS__OperationsCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateOperation}
        vehicles={vehicles}
        clients={clients}
      />

      {showChangeStage && (
        <SAAS__ChangeStageModal
          isOpen={true}
          onClose={() => setShowChangeStage(null)}
          onConfirm={(newStage) => handleChangeStage(showChangeStage, newStage)}
          currentStage={operations.find(o => o.id === showChangeStage)?.stage || 'captacion'}
        />
      )}

      {showAssignResponsible && (
        <SAAS__AssignResponsibleModal
          isOpen={true}
          onClose={() => setShowAssignResponsible(null)}
          onConfirm={(responsible) => handleAssignResponsible(showAssignResponsible, responsible)}
          currentResponsible={operations.find(o => o.id === showAssignResponsible)?.responsible || ''}
        />
      )}
    </Layout>
  );
}
