import { Check, Circle, AlertCircle } from 'lucide-react';
import { Badge } from '../ui/badge';

export type QAStatus = 'ok' | 'pending' | 'issue';

export interface QAItem {
  module: string;
  feature: string;
  status: QAStatus;
  notes?: string;
}

interface QAChecklistProps {
  blockName: string;
  items: QAItem[];
  onComplete?: () => void;
}

export function QAChecklist({ blockName, items, onComplete }: QAChecklistProps) {
  const okCount = items.filter(item => item.status === 'ok').length;
  const pendingCount = items.filter(item => item.status === 'pending').length;
  const issueCount = items.filter(item => item.status === 'issue').length;
  const totalCount = items.length;
  const progress = (okCount / totalCount) * 100;

  const getStatusIcon = (status: QAStatus) => {
    switch (status) {
      case 'ok':
        return <Check className="w-5 h-5 text-green-600" />;
      case 'pending':
        return <Circle className="w-5 h-5 text-gray-400 dark:text-gray-500" />;
      case 'issue':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
    }
  };

  const getStatusBadge = (status: QAStatus) => {
    switch (status) {
      case 'ok':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">OK</Badge>;
      case 'pending':
        return <Badge className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">Pendiente</Badge>;
      case 'issue':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Issue</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">QA Checklist - {blockName}</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">Verificación de interactividad y navegación</p>
          
          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Progreso</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{okCount}/{totalCount}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="bg-green-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{okCount}</div>
              <div className="text-sm text-green-700">Completados</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">{pendingCount}</div>
              <div className="text-sm text-gray-700 dark:text-gray-300">Pendientes</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-red-600">{issueCount}</div>
              <div className="text-sm text-red-700">Issues</div>
            </div>
          </div>
        </div>

        {/* Checklist Items */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="divide-y divide-gray-200">
            {items.map((item, index) => (
              <div key={index} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="mt-0.5">
                    {getStatusIcon(item.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">{item.module}</h3>
                      {getStatusBadge(item.status)}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{item.feature}</p>
                    {item.notes && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">{item.notes}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Button */}
        {onComplete && progress === 100 && (
          <div className="mt-6 bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <h3 className="text-lg font-bold text-green-900 mb-2">
              ✓ Bloque {blockName} completado
            </h3>
            <p className="text-green-700 mb-4">Todas las verificaciones han pasado correctamente</p>
            <button
              onClick={onComplete}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              Continuar al siguiente bloque →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
