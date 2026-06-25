import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  Lock,
  MoreHorizontal,
  Sparkles,
  TrendingUp,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  downloadClientImportTemplate,
  downloadClientsExport,
  type ClientExportRow,
} from '../../lib/crmImportTemplates';
import type { ClientsListFeatureId } from '../../hooks/useClientsListPlanAccess';

interface MenuItem {
  id: string;
  label: string;
  description: string;
  icon: ReactNode;
  locked?: boolean;
  disabled?: boolean;
  highlight?: boolean;
  action: () => void;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

export interface ClientsActionsMenuProps {
  isDeliveryBusiness: boolean;
  canUseSegments: boolean;
  canExport: boolean;
  canImportFromBusiness: boolean;
  hasOtherBusinesses: boolean;
  segmentConditionsCount: number;
  exportClients: ClientExportRow[];
  requiredPlanLabel: (id: ClientsListFeatureId) => string;
  onQuickAddClient: () => void;
  onAIAddClient: () => void;
  onImportClients: () => void;
  onToggleSegmentBuilder: () => void;
  onImportFromBusiness?: () => void;
  onDeleteAllClients?: () => void;
  deleteAllCount?: number;
  deletingAll?: boolean;
}

export function ClientsActionsMenu({
  isDeliveryBusiness,
  canUseSegments,
  canExport,
  canImportFromBusiness,
  hasOtherBusinesses,
  segmentConditionsCount,
  exportClients,
  requiredPlanLabel,
  onQuickAddClient,
  onAIAddClient,
  onImportClients,
  onToggleSegmentBuilder,
  onImportFromBusiness,
  onDeleteAllClients,
  deleteAllCount = 0,
  deletingAll = false,
}: ClientsActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const exportCount = exportClients.length;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const close = () => setOpen(false);

  const guardPlan = (allowed: boolean, featureId: ClientsListFeatureId, action: () => void) => {
    if (!allowed) {
      toast.info(`Disponible desde plan ${requiredPlanLabel(featureId)}`);
      close();
      return;
    }
    action();
    close();
  };

  const sections: MenuSection[] = [
    {
      title: 'Clientes',
      items: [
        {
          id: 'quick-add',
          label: 'Alta rápida',
          description: 'Formulario para nuevo cliente',
          icon: <Zap className="w-4 h-4 text-amber-500" />,
          highlight: true,
          action: () => {
            onQuickAddClient();
            close();
          },
        },
        {
          id: 'ai-add',
          label: 'Crear con IA',
          description: 'Describe el cliente y la IA lo organiza',
          icon: <Sparkles className="w-4 h-4 text-violet-500" />,
          action: () => {
            onAIAddClient();
            close();
          },
        },
        {
          id: 'import',
          label: 'Importar clientes',
          description: 'Subir CSV o Excel con tu listado',
          icon: <Upload className="w-4 h-4 text-blue-500" />,
          action: () => {
            onImportClients();
            close();
          },
        },
        ...(onDeleteAllClients
          ? [{
              id: 'delete-all',
              label: deletingAll ? 'Eliminando…' : 'Eliminar todos',
              description: deleteAllCount > 0
                ? `Borrar ${deleteAllCount} cliente${deleteAllCount === 1 ? '' : 's'} del negocio`
                : 'No hay clientes que eliminar',
              icon: <Trash2 className="w-4 h-4 text-red-500" />,
              disabled: deletingAll || deleteAllCount === 0,
              action: () => {
                onDeleteAllClients();
                close();
              },
            }]
          : []),
      ],
    },
  ];

  if (isDeliveryBusiness) {
    sections.push({
      title: 'Análisis',
      items: [
        {
          id: 'segments',
          label: 'Segmentos',
          description:
            segmentConditionsCount > 0
              ? `${segmentConditionsCount} filtro(s) activos`
              : 'Filtra clientes por condiciones avanzadas',
          icon: <TrendingUp className="w-4 h-4 text-indigo-500" />,
          locked: !canUseSegments,
          highlight: segmentConditionsCount > 0,
          action: () => guardPlan(canUseSegments, 'lista_segmentos', onToggleSegmentBuilder),
        },
      ],
    });

    sections.push({
      title: 'Exportar',
      items: [
        {
          id: 'template',
          label: 'Plantilla vacía',
          description: 'Cabeceras para rellenar e importar',
          icon: <FileSpreadsheet className="w-4 h-4 text-blue-500" />,
          locked: !canExport,
          action: () =>
            guardPlan(canExport, 'lista_export', () => {
              downloadClientImportTemplate({ includeResponsible: false });
              toast.success('Plantilla descargada');
            }),
        },
        {
          id: 'export',
          label: 'Mis clientes actuales',
          description:
            exportCount > 0
              ? `Exportar ${exportCount} cliente${exportCount === 1 ? '' : 's'} a Excel`
              : 'No hay clientes para exportar',
          icon: <Users className="w-4 h-4 text-emerald-500" />,
          locked: !canExport,
          disabled: exportCount === 0,
          action: () =>
            guardPlan(canExport, 'lista_export', () => {
              if (exportCount === 0) {
                toast.error('No hay clientes para exportar');
                return;
              }
              downloadClientsExport(exportClients, { includeResponsible: false });
              toast.success(`Exportados ${exportCount} clientes`);
            }),
        },
      ],
    });

    if (hasOtherBusinesses) {
      sections.push({
        title: 'Empresa',
        items: [
          {
            id: 'import-business',
            label: 'Importar de otra empresa',
            description: 'Traer clientes de otra empresa del portfolio',
            icon: <UserPlus className="w-4 h-4 text-violet-500" />,
            locked: !canImportFromBusiness,
            action: () =>
              guardPlan(canImportFromBusiness, 'lista_import_empresa', () => onImportFromBusiness?.()),
          },
        ],
      });
    }
  } else {
    sections.push({
      title: 'Exportar',
      items: [
        {
          id: 'template',
          label: 'Plantilla vacía',
          description: 'Cabeceras para rellenar e importar',
          icon: <FileSpreadsheet className="w-4 h-4 text-blue-500" />,
          action: () => {
            downloadClientImportTemplate({ includeResponsible: true });
            toast.success('Plantilla descargada');
            close();
          },
        },
        {
          id: 'export',
          label: 'Mis clientes actuales',
          description:
            exportCount > 0
              ? `Exportar ${exportCount} cliente${exportCount === 1 ? '' : 's'} a Excel`
              : 'No hay clientes para exportar',
          icon: <Users className="w-4 h-4 text-emerald-500" />,
          disabled: exportCount === 0,
          action: () => {
            if (exportCount === 0) {
              toast.error('No hay clientes para exportar');
              return;
            }
            downloadClientsExport(exportClients, { includeResponsible: true });
            toast.success(`Exportados ${exportCount} clientes`);
            close();
          },
        },
      ],
    });
  }

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-xl border-2 border-gray-900 bg-gray-900 px-3.5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <MoreHorizontal className="h-4 w-4" />
        <span>Acciones</span>
        {segmentConditionsCount > 0 ? (
          <span className="rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px] font-bold text-white dark:bg-indigo-600">
            {segmentConditionsCount}
          </span>
        ) : null}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="absolute right-0 top-full z-20 mt-2 max-h-[min(70vh,520px)] w-[min(calc(100vw-2rem),320px)] overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900"
          >
            {sections.map((section, sectionIndex) => (
              <div key={section.title}>
                {sectionIndex > 0 ? <div className="border-t border-gray-100 dark:border-gray-800" /> : null}
                <p className="px-4 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {section.title}
                </p>
                {section.items.map((item, itemIndex) => (
                  <div key={item.id}>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={item.disabled}
                      onClick={item.action}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        item.highlight
                          ? 'bg-indigo-50/70 hover:bg-indigo-50 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/40'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <div className="mt-0.5 flex-shrink-0">{item.icon}</div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {item.label}
                          {item.locked ? <Lock className="h-3 w-3 text-gray-400" /> : null}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{item.description}</p>
                      </div>
                      {item.id === 'export' && !item.locked ? (
                        <Download className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                      ) : null}
                    </button>
                    {itemIndex < section.items.length - 1 ? (
                      <div className="border-t border-gray-100 dark:border-gray-800" />
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
