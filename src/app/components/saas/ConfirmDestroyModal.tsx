import React, { useState, useEffect, useRef } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ConfirmDestroyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  itemName: string;
  confirmLabel?: string;
  destructiveLabel?: string;
  isDeleting?: boolean;
}

export function ConfirmDestroyModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  itemName,
  confirmLabel,
  destructiveLabel = 'Eliminar permanentemente',
  isDeleting = false,
}: ConfirmDestroyModalProps) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const isMatch = inputValue.trim() === itemName.trim();

  useEffect(() => {
    if (isOpen) {
      setInputValue('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!isMatch || isDeleting) return;
    await onConfirm();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isMatch && !isDeleting) void handleConfirm();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border-2 border-red-100 dark:border-red-900/50 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 bg-red-50 dark:bg-red-950/40 border-b border-red-100 dark:border-red-900/50">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/50 rounded-2xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-gray-100 text-base">{title}</h2>
                <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-0.5">{t('modal.confirmDelete.irreversible')}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/40 rounded-xl transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{description}</p>
          )}

          <div className="bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('modal.confirmDelete.nameToConfirm')}</p>
            <p className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 break-all">{itemName}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              {confirmLabel ?? t('modal.confirmDelete.typeExactly')}
            </label>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={itemName}
              className={`w-full px-3.5 py-2.5 border-2 rounded-xl text-sm outline-none transition-colors font-mono ${
                inputValue && isMatch
                  ? 'border-green-400 bg-green-50 dark:bg-green-950/40 text-green-900 dark:text-green-300'
                  : inputValue && !isMatch
                  ? 'border-red-300 bg-red-50 dark:bg-red-950/30 dark:text-red-300'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-400 dark:focus:border-gray-500'
              }`}
              autoComplete="off"
              spellCheck={false}
            />
            {inputValue && !isMatch && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-1.5 flex items-center gap-1">
                <span className="w-3.5 h-3.5 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center text-[9px] font-bold flex-shrink-0">✕</span>
                {t('modal.confirmDelete.noMatch')}
              </p>
            )}
            {isMatch && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1.5 flex items-center gap-1">
                <span className="w-3.5 h-3.5 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center text-[9px] font-bold flex-shrink-0">✓</span>
                {t('modal.confirmDelete.confirmed')}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl text-sm font-semibold hover:border-gray-300 dark:hover:border-gray-600 transition-colors disabled:opacity-60"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!isMatch || isDeleting}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
            {isDeleting ? t('modal.confirmDelete.deleting') : destructiveLabel}
          </button>
        </div>

      </div>
    </div>
  );
}
