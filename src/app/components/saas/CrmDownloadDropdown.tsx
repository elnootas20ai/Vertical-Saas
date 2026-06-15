import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  downloadClientImportTemplate,
  downloadClientsExport,
  downloadLeadImportTemplate,
  type ClientExportRow,
} from '../../lib/crmImportTemplates';

interface CrmDownloadDropdownProps {
  mode: 'clients' | 'leads';
  clients?: ClientExportRow[];
  isDelivery?: boolean;
}

export function CrmDownloadDropdown({ mode, clients = [], isDelivery = false }: CrmDownloadDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const includeResponsible = !isDelivery;
  const exportCount = clients.length;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const options = mode === 'clients'
    ? [
        {
          id: 'template',
          label: 'Plantilla vacía',
          description: 'Solo cabeceras para rellenar e importar',
          icon: <FileSpreadsheet className="w-4 h-4 text-blue-500" />,
          action: () => {
            downloadClientImportTemplate({ includeResponsible });
            toast.success('Plantilla descargada');
            setOpen(false);
          },
        },
        {
          id: 'export',
          label: 'Mis clientes actuales',
          description: exportCount > 0
            ? `Exportar ${exportCount} cliente${exportCount === 1 ? '' : 's'} a Excel`
            : 'No hay clientes para exportar',
          icon: <Users className="w-4 h-4 text-emerald-500" />,
          disabled: exportCount === 0,
          action: () => {
            if (exportCount === 0) {
              toast.error('No hay clientes para exportar');
              return;
            }
            downloadClientsExport(clients, { includeResponsible });
            toast.success(`Exportados ${exportCount} clientes`);
            setOpen(false);
          },
        },
      ]
    : [
        {
          id: 'template',
          label: 'Plantilla vacía',
          description: 'Solo cabeceras para rellenar e importar',
          icon: <FileSpreadsheet className="w-4 h-4 text-blue-500" />,
          action: () => {
            downloadLeadImportTemplate();
            toast.success('Plantilla descargada');
            setOpen(false);
          },
        },
      ];

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Descargar archivo"
        className="flex items-center gap-1.5 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold transition-colors"
      >
        <Download className="w-4 h-4" />
        <span className="hidden sm:inline">Descargar</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl overflow-hidden z-20">
            <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                ¿Qué archivo quieres?
              </p>
            </div>
            {options.map((opt, i) => (
              <div key={opt.id}>
                <button
                  type="button"
                  disabled={opt.disabled}
                  onClick={opt.action}
                  className="w-full px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800 text-left transition-colors flex items-start gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div className="mt-0.5 flex-shrink-0">{opt.icon}</div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{opt.label}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{opt.description}</p>
                  </div>
                </button>
                {i < options.length - 1 && <div className="border-t border-gray-100 dark:border-gray-800" />}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
