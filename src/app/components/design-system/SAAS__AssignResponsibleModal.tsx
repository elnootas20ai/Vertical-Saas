import { useState } from 'react';
import { X, User } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (responsible: string) => void;
  currentResponsible: string;
}

const teamMembers = [
  { id: '1', name: 'Juan García', role: 'Gerente', avatar: 'JG' },
  { id: '2', name: 'María López', role: 'Comercial', avatar: 'ML' },
  { id: '3', name: 'Carlos Ruiz', role: 'Taller', avatar: 'CR' },
  { id: '4', name: 'Ana Martínez', role: 'Administrativa', avatar: 'AM' },
  { id: '5', name: 'Pedro Sánchez', role: 'Comercial', avatar: 'PS' },
];

export function SAAS__AssignResponsibleModal({ isOpen, onClose, onConfirm, currentResponsible }: Props) {
  const [selectedResponsible, setSelectedResponsible] = useState(currentResponsible);
  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(selectedResponsible);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-600" />
            Asignar responsable
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Selecciona el miembro del equipo que será responsable de esta operación
          </p>

          <div className="space-y-2">
            {teamMembers.map((member) => (
              <button
                key={member.id}
                onClick={() => setSelectedResponsible(member.name)}
                className={`w-full p-4 border-2 rounded-xl transition-all text-left ${
                  selectedResponsible === member.name
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                    selectedResponsible === member.name
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 dark:text-gray-300'
                  }`}>
                    {member.avatar}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 dark:text-gray-100">{member.name}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">{member.role}</div>
                  </div>
                  {selectedResponsible === member.name && (
                    <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-6 py-3 bg-gray-900 hover:bg-black text-white font-medium rounded-xl transition-colors"
          >
            Asignar
          </button>
        </div>
      </div>
    </div>
  );
}
