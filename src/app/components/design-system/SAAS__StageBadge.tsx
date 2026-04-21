export type OperationStage = 
  | 'captacion'
  | 'revision'
  | 'puesta_punto'
  | 'publicacion'
  | 'negociacion'
  | 'reserva'
  | 'financiacion'
  | 'documentacion'
  | 'entrega'
  | 'postventa'
  | 'desguace';

interface Props {
  stage: OperationStage;
  onClick?: () => void;
}

const stageConfig: Record<OperationStage, { label: string; color: string }> = {
  captacion: { label: 'Captación', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  revision: { label: 'Revisión/Peritaje', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  puesta_punto: { label: 'Puesta a punto', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  publicacion: { label: 'Publicación', color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  negociacion: { label: 'Negociación', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  reserva: { label: 'Reserva', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  financiacion: { label: 'Financiación', color: 'bg-pink-100 text-pink-700 border-pink-200' },
  documentacion: { label: 'Documentación', color: 'bg-violet-100 text-violet-700 border-violet-200' },
  entrega: { label: 'Entrega', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  postventa: { label: 'Postventa', color: 'bg-teal-100 text-teal-700 border-teal-200' },
  desguace: { label: 'Desguace', color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700' },
};

export function SAAS__StageBadge({ stage, onClick }: Props) {
  const config = stageConfig[stage];
  
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`px-3 py-1 text-xs font-semibold rounded-full border ${config.color} hover:shadow-md transition-all`}
      >
        {config.label}
      </button>
    );
  }
  
  return (
    <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${config.color}`}>
      {config.label}
    </span>
  );
}
