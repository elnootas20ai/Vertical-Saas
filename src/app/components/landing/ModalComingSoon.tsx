import { X } from 'lucide-react';
import { useState } from 'react';
import { useModalClose } from '../../hooks/useModalClose';

interface ModalComingSoonProps {
  isOpen: boolean;
  onClose: () => void;
  verticalName: string;
}

export function ModalComingSoon({ isOpen, onClose, verticalName }: ModalComingSoonProps) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      onClose();
      setEmail('');
      setSubmitted(false);
    }, 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 dark:text-gray-500 hover:text-gray-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🚀</span>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {verticalName} - Próximamente
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Estamos trabajando en esta vertical. Déjanos tu email y te avisaremos cuando esté lista.
          </p>
        </div>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none transition-colors text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
            />
            <button
              type="submit"
              className="w-full px-6 py-3 bg-gray-900 dark:bg-white hover:bg-black dark:hover:bg-gray-100 text-white dark:text-gray-900 font-medium rounded-xl transition-colors"
            >
              Avisadme
            </button>
          </form>
        ) : (
          <div className="p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl text-center">
            <p className="text-green-800 dark:text-green-300 font-medium">
              ✅ ¡Gracias! Te avisaremos cuando esté listo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
