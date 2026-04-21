import { X } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface ModuleImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  imageSrc?: string;
}

export function ModuleImageModal({ isOpen, onClose, title, imageSrc }: ModuleImageModalProps) {
  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" 
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl max-w-5xl w-full p-4 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors"
        >
          <X className="w-8 h-8" />
        </button>

        <div className="mb-4">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h3>
        </div>

        <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-50 rounded-xl border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden">
          {imageSrc ? (
            <img src={imageSrc} alt={title} className="w-full h-full object-cover" />
          ) : (
            <div className="text-center p-8">
              <div className="w-24 h-24 bg-gray-200 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                <span className="text-4xl text-gray-400 dark:text-gray-500">📸</span>
              </div>
              <p className="text-gray-500 dark:text-gray-400 font-medium">Vista previa del módulo {title}</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Screenshot placeholder - Listo para reemplazar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
